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
 * @evidence requirements/agent-control/turn-and-approval.md#agent-permission-answer-fidelity Writes each answer in the terms the request that prompted it accepts, rather than in one shape the server would silently refuse.
 * @evidence specifications/agent-harness/control-and-approval.md#spec-agent-answer-vocabulary Keeps each pending request's kind and resolves an option only among the answers that kind takes, refusing an identifier belonging to another.
 * @author Samchon
 */
export class CodeHudCodexSession implements ICodeHudAgentSession {
  private readonly normalizer: CodeHudCodexNormalizer;

  /**
   * The approvals the server is waiting on, and how each expects an answer.
   *
   * The method is kept rather than only the identifier because the answer's
   * shape follows it: three of the five approval methods speak vocabularies the
   * other two would refuse, and by the time an answer is being written the
   * request that prompted it is gone.
   */
  private readonly waiting: Map<string, string> = new Map();
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
    const waiting: Map<string, string> = this.waiting;
    return {
      [Symbol.asyncIterator]:
        async function* (): AsyncGenerator<ICodeHudAgentEvent> {
          for await (const line of source) {
            const message: CodeHudCodexNormalizer.IMessage =
              line as CodeHudCodexNormalizer.IMessage;
            for (const event of normalizer.normalize(message)) {
              if (event.type === "permission" && message.method !== undefined)
                waiting.set(event.request, message.method);
              if (event.type === "result") waiting.clear();
              yield event;
            }
          }
        },
    };
  }

  /**
   * Submits one instruction.
   *
   * A decision is refused unless the server is actually waiting on the
   * identifier it quotes, and the answer is written in the vocabulary that
   * request's own method speaks. That is not a shortcut: this protocol has
   * three answer shapes across five approval methods, and one written in the
   * wrong one is refused silently, leaving a wearer told their answer landed
   * while the agent sits blocked on the question they believe they answered.
   *
   * An option is therefore looked up among the answers offered for *that*
   * method rather than among all of them. A legacy decision word reaching a
   * modern request is not a near miss to be translated; it is an answer to a
   * question that was never asked, and it is refused.
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

    const method: string | undefined = this.waiting.get(command.request);
    const vocabulary: CodeHudCodexNormalizer.Vocabulary | undefined =
      method === undefined
        ? undefined
        : CodeHudCodexNormalizer.APPROVALS.get(method);
    if (vocabulary === undefined)
      throw new Error(`no approval is pending under ${command.request}`);
    const option = CodeHudCodexNormalizer.OPTIONS[vocabulary].find(
      (candidate) => candidate.id === command.option,
    );
    if (option === undefined)
      throw new Error(`${command.option} is not an answer ${method} takes`);
    this.waiting.delete(command.request);

    return this.channel.write({
      jsonrpc: "2.0",
      id: Number(command.request),
      result: CodeHudCodexNormalizer.answer(vocabulary, option),
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
