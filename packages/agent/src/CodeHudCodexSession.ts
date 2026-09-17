import type {
  ICodeHudAgentCommand,
  ICodeHudAgentEvent,
  ICodeHudAgentSession,
} from "@codehud/interface";

import { CodeHudCodexNormalizer } from "./CodeHudCodexNormalizer";
import type { ICodeHudHarnessChannel } from "./ICodeHudHarnessChannel";

/**
 * One conversation with a running `codex app-server`.
 *
 * A class, and a facade controller: it owns the channel, the normalizer, and
 * the approvals the server is waiting on. It knows nothing about processes,
 * because the channel does.
 *
 * Correlation is heavier here than in the Claude adapter. This is JSON-RPC in
 * both directions: our requests carry identifiers the server answers, and the
 * server's requests carry identifiers we answer. Those are two separate spaces
 * and confusing them would pair an answer with the wrong question, so the
 * outgoing counter and the set of incoming requests never meet.
 *
 * @evidence requirements/agent-control/harness-abstraction.md#agent-session-lifetime Exposes the four operations a live conversation offers, with termination that succeeds for an already-ended session.
 * @evidence requirements/agent-control/turn-and-approval.md#agent-permission-blocking Holds the approvals the server is waiting on, so an answer is paired against something rather than sent hopefully.
 * @evidence specifications/agent-harness/normalized-stream.md#spec-agent-session-open Implements the session surface as identity, observations, instruction delivery, and idempotent termination, and nothing else.
 * @evidence specifications/agent-harness/control-and-approval.md#spec-agent-permission-pairing Refuses an answer quoting no identifier or one it does not recognize, and applies it to nothing.
 * @author Samchon
 */
export class CodeHudCodexSession implements ICodeHudAgentSession {
  private readonly normalizer: CodeHudCodexNormalizer;
  private readonly waiting: Set<string> = new Set();
  private outgoing: number = 100;
  private ended: boolean = false;

  /** Constructs a session over one running server, on one thread. */
  public constructor(
    /**
     * Identifier the wire protocol addresses this session by.
     *
     * The bridge's rather than the server's, so a conversation is addressable
     * from the moment it is opened instead of from whenever `thread/started`
     * arrives.
     */
    public readonly id: string,
    private readonly channel: ICodeHudHarnessChannel,
    private readonly props: CodeHudCodexSession.IProps,
  ) {
    this.normalizer = new CodeHudCodexNormalizer(id, props.now);
    this.normalizer.directory = props.directory;
    this.normalizer.resumed = props.resumed === true;
  }

  /**
   * The server's own thread identifier, once it has said.
   *
   * What a terminal on the host machine resumes the same work with, which is
   * the whole of what makes a session reachable from either surface.
   */
  public get native(): string | undefined {
    return this.normalizer.thread;
  }

  /**
   * Normalized observations, in the order the server produced them.
   *
   * Approvals are remembered here rather than in the normalizer, which stays
   * pure. A terminal observation clears them, because a turn that has ended is
   * not waiting for anything.
   */
  public get events(): AsyncIterable<ICodeHudAgentEvent> {
    const source: AsyncIterable<unknown> = this.channel.lines;
    const normalizer: CodeHudCodexNormalizer = this.normalizer;
    const waiting: Set<string> = this.waiting;
    return {
      [Symbol.asyncIterator]:
        async function* (): AsyncGenerator<ICodeHudAgentEvent> {
          for await (const line of source)
            for (const event of normalizer.normalize(
              line as CodeHudCodexNormalizer.IMessage,
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
   * A decision is refused unless the server is actually waiting on the
   * identifier it quotes, and the option is sent back as the server's own
   * decision word rather than translated. That is not a shortcut: this protocol
   * has two decision vocabularies, and answering a modern request in the legacy
   * one is refused silently, leaving a wearer told their answer landed while
   * the agent sits blocked on the question they believe they answered.
   */
  public async send(command: ICodeHudAgentCommand): Promise<void> {
    if (this.ended === true)
      throw new Error(`session ${this.id} has already ended`);

    if (command.type === "prompt")
      return this.request("turn/start", {
        threadId: this.thread(),
        input: [{ type: "text", text: command.text, text_elements: [] }],
      });

    if (command.type === "interrupt")
      return this.request("turn/interrupt", { threadId: this.thread() });

    if (this.waiting.has(command.request) === false)
      throw new Error(`no approval is pending under ${command.request}`);
    const option = CodeHudCodexNormalizer.OPTIONS.find(
      (candidate) => candidate.id === command.option,
    );
    if (option === undefined)
      throw new Error(`${command.option} is not an answer this server offers`);
    this.waiting.delete(command.request);

    return this.channel.write({
      jsonrpc: "2.0",
      id: Number(command.request),
      result: { decision: option.id },
    });
  }

  /** Ends the session, and succeeds for one already ended. */
  public async close(): Promise<void> {
    if (this.ended === true) return;
    this.ended = true;
    this.waiting.clear();
    await this.channel.close();
  }

  /**
   * The thread every instruction names.
   *
   * Taken from the server once it has said, and from what the adapter was told
   * before that. An instruction that arrived between opening and the first
   * notification would otherwise name nothing.
   */
  private thread(): string {
    return this.normalizer.thread ?? this.props.thread;
  }

  private request(method: string, params: unknown): Promise<void> {
    return this.channel.write({
      jsonrpc: "2.0",
      id: ++this.outgoing,
      method,
      params,
    });
  }
}
export namespace CodeHudCodexSession {
  /** What a session needs beyond its channel. */
  export interface IProps {
    /** Thread the adapter opened, as the server named it. */
    thread: string;

    /** Absolute working directory the session runs in. */
    directory: string;

    /** Whether this conversation was opened by resuming an earlier one. */
    resumed?: boolean;

    /** Clock, so a test can state the times it expects. */
    now?: () => number;
  }
}
