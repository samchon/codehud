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
    const closed = (): boolean => this.ended;
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
          // The stream ended. A harness that dies writes nothing to say so,
          // and the bridge deliberately says nothing either — it is written
          // against the assumption that the adapter reports a dead harness on
          // this same stream, which neither adapter did. So the wearer was
          // shown a session still working on something that no longer existed,
          // which is the failure this product is for preventing.
          //
          // Measured rather than assumed: `claude 2.1.274` with `--print
          // --input-format stream-json` stays alive after a result and takes a
          // second turn on the same stdin. The process does not exit when a
          // turn ends, so a stream that ends on its own is a harness that is
          // gone rather than one that finished.
          if (closed() === false)
            yield normalizer.broken("the harness stopped");
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
   *
   * A refused answer applies to nothing, which includes the record of what is
   * still pending. Consuming a request while declining to answer it would leave
   * the harness blocked on a question this session no longer believes it
   * asked.
   */
  public async send(command: ICodeHudAgentCommand): Promise<void> {
    if (this.ended === true)
      throw new Error(`session ${this.id} has already ended`);

    if (command.type === "prompt")
      return this.channel.write({
        type: "user",
        message: {
          role: "user",
          content: CodeHudClaudeSession.content(command),
        },
      });

    if (command.type === "interrupt")
      return this.channel.write({
        type: "control_request",
        request_id: `interrupt-${this.id}`,
        request: { subtype: "interrupt" },
      });

    if (this.waiting.has(command.request) === false)
      throw new Error(`no approval is pending under ${command.request}`);

    const option = CodeHudClaudeNormalizer.OPTIONS.find(
      (candidate) => candidate.id === command.option,
    );
    if (option === undefined)
      throw new Error(`${command.option} is not an answer this harness offers`);
    // Forgotten only once the answer is known to be one that can be sent. The
    // order used to be the other way round, which let a refused answer consume
    // the request it failed to answer: the harness stayed blocked, and every
    // later answer to it — including the correct one — was refused as though
    // nothing were pending.
    this.waiting.delete(command.request);

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
  /**
   * What a prompt's message carries.
   *
   * A bare string when there is only text, because that is what the harness
   * receives from every other client and the shape its own captures show. An
   * array of content blocks when the wearer attached what they were looking at,
   * which is the one input a desktop terminal cannot produce and the reason the
   * contract carries images at all.
   *
   * The block shape is the vendor's: `{ type: "image", source: { type:
   * "base64", media_type, data } }`, read out of the installed binary rather
   * than assumed, alongside the branch that accepts a message whose content is
   * an array instead of a string.
   */
  export const content = (
    command: ICodeHudAgentCommand.IPrompt,
  ): string | IBlock[] => {
    const images: string[] = command.images ?? [];
    if (images.length === 0) return command.text;
    return [
      { type: "text", text: command.text },
      ...images.map((url) => {
        const parsed: IImage = image(url);
        return {
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: parsed.media,
            data: parsed.data,
          },
        };
      }),
    ];
  };

  /**
   * Splits a data URL into the two things the harness's block needs.
   *
   * Refused rather than repaired. A photograph that arrived malformed is a
   * defect in the device that took it, and sending it as text or dropping it
   * quietly would leave a wearer looking at an answer about a picture the agent
   * never saw.
   */
  export const image = (url: string): IImage => {
    const parsed: RegExpMatchArray | null = url.match(
      /^data:([a-z]+\/[a-z0-9.+-]+);base64,(.+)$/iu,
    );
    const media: string | undefined = parsed?.[1];
    const data: string | undefined = parsed?.[2];
    if (media === undefined || data === undefined)
      throw new Error("an attached image is not a base64 data URL");
    return { media, data };
  };

  /** One content block of a prompt message. */
  export type IBlock =
    | { type: "text"; text: string }
    | {
        type: "image";
        source: { type: "base64"; media_type: string; data: string };
      };

  /** A data URL split into what the harness's image block carries. */
  export interface IImage {
    /** Media type, such as `image/png`. */
    media: string;

    /** The base64 payload, without the URL around it. */
    data: string;
  }

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
