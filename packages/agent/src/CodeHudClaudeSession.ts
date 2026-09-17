import type {
  ICodeHudAgentCommand,
  ICodeHudAgentEvent,
  ICodeHudAgentSession,
} from "@codehud/interface";

import { CodeHudClaudeNormalizer } from "./CodeHudClaudeNormalizer";
import type { ICodeHudHarnessChannel } from "./ICodeHudHarnessChannel";

/**
 * One conversation with a running Claude Code process.
 *
 * A class, and a facade controller: it owns the channel, the normalizer, and
 * the set of approvals the harness is currently waiting on. It knows nothing
 * about processes, because the channel does, so every rule here is exercised
 * without launching anything.
 *
 * The approvals are the reason this holds state at all. The harness asks by
 * sending a request identifier and then waits; an answer has to quote that
 * identifier back, and an answer quoting one nobody is waiting on must change
 * nothing rather than be forwarded and silently ignored at the far end.
 *
 * @evidence requirements/agent-control/harness-abstraction.md#agent-session-lifetime Exposes the four operations a live conversation offers, with termination that succeeds for an already-ended session.
 * @evidence requirements/agent-control/turn-and-approval.md#agent-permission-blocking Holds the approvals the harness is waiting on, so an answer is paired against something rather than sent hopefully.
 * @evidence specifications/agent-harness/normalized-stream.md#spec-agent-session-open Implements the session surface as identity, observations, instruction delivery, and idempotent termination, and nothing else.
 * @evidence specifications/agent-harness/control-and-approval.md#spec-agent-permission-pairing Refuses an answer quoting no identifier or one it does not recognize, and applies it to nothing.
 * @author Samchon
 */
export class CodeHudClaudeSession implements ICodeHudAgentSession {
  private readonly normalizer: CodeHudClaudeNormalizer;
  private readonly waiting: Set<string> = new Set();
  private ended: boolean = false;

  /** Constructs a session over one running harness. */
  public constructor(
    /**
     * Identifier the wire protocol addresses this session by.
     *
     * The bridge's rather than the harness's, so a conversation is addressable
     * from the moment it is opened instead of from whenever the harness first
     * names itself.
     */
    public readonly id: string,
    private readonly channel: ICodeHudHarnessChannel,
    props: CodeHudClaudeSession.IProps = {},
  ) {
    this.normalizer = new CodeHudClaudeNormalizer(id, props.now);
    this.normalizer.resumed = props.resumed === true;
    this.normalizer.streaming = props.streaming !== false;
  }

  /**
   * The harness's own identifier for this conversation, once it has said.
   *
   * What a terminal on the host machine passes to resume the same work, which
   * is the whole of what makes a session reachable from either surface.
   */
  public get native(): string | undefined {
    return this.normalizer.native;
  }

  /**
   * Normalized observations, in the order the harness produced them.
   *
   * Every approval the harness asks about is remembered as it passes through,
   * so the answer that arrives later has something to be paired against. Doing
   * it here rather than in the normalizer keeps that one pure.
   */
  public get events(): AsyncIterable<ICodeHudAgentEvent> {
    const source: AsyncIterable<unknown> = this.channel.lines;
    const normalizer: CodeHudClaudeNormalizer = this.normalizer;
    const waiting: Set<string> = this.waiting;
    return {
      [Symbol.asyncIterator]:
        async function* (): AsyncGenerator<ICodeHudAgentEvent> {
          for await (const line of source)
            for (const event of normalizer.normalize(
              line as CodeHudClaudeNormalizer.ILine,
            )) {
              if (event.type === "permission") waiting.add(event.request);
              if (event.type === "result") waiting.clear();
              yield event;
            }
        },
    };
  }

  /**
   * Submits one instruction.
   *
   * A decision is refused unless the harness is actually waiting on the
   * identifier it quotes. An answer to a request that was never asked, or that
   * has already been answered, would otherwise be written to a harness that
   * discards it, and the wearer would be told their answer went through.
   */
  public async send(command: ICodeHudAgentCommand): Promise<void> {
    if (this.ended === true)
      throw new Error(`session ${this.id} has already ended`);

    if (command.type === "prompt")
      return this.channel.write({
        type: "user",
        message: { role: "user", content: command.text },
      });

    if (command.type === "interrupt")
      return this.channel.write({
        type: "control_request",
        request_id: `interrupt-${this.id}`,
        request: { subtype: "interrupt" },
      });

    if (this.waiting.has(command.request) === false)
      throw new Error(`no approval is pending under ${command.request}`);
    this.waiting.delete(command.request);

    const option = CodeHudClaudeNormalizer.OPTIONS.find(
      (candidate) => candidate.id === command.option,
    );
    if (option === undefined)
      throw new Error(`${command.option} is not an answer this harness offers`);

    return this.channel.write({
      type: "control_response",
      response: {
        subtype: "success",
        request_id: command.request,
        response:
          option.affirmative === true
            ? { behavior: "allow" }
            : { behavior: "deny", message: "the wearer declined" },
      },
    });
  }

  /** Ends the session, and succeeds for one already ended. */
  public async close(): Promise<void> {
    if (this.ended === true) return;
    this.ended = true;
    this.waiting.clear();
    await this.channel.close();
  }
}
export namespace CodeHudClaudeSession {
  /** What a session needs beyond its channel. */
  export interface IProps {
    /** Whether this conversation was opened by resuming an earlier one. */
    resumed?: boolean;

    /**
     * Whether the harness was launched with partial messages on.
     *
     * Decides whether a completed message repeats its text or terminates what
     * the deltas already carried. Defaults to on, which is how the adapter
     * launches it.
     */
    streaming?: boolean;

    /** Clock, so a test can state the times it expects. */
    now?: () => number;
  }
}
