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

  /**
   * Resolves when there is a thread to address an instruction to.
   *
   * The server names the thread in a notification, which arrives on the
   * observation stream some moments after the process starts. Until then this
   * session knows the bridge's own identifier and nothing the server would
   * recognize, and an instruction sent in that window names an empty thread and
   * is discarded in silence — the turn never starts, no observation ever
   * arrives, and the display sits on *Connecting* forever.
   *
   * That was not hypothetical. It is what a wearer got whenever they spoke
   * before the server had finished starting, which on this harness is most of
   * the time, because a desk host reads a line the instant it has one.
   *
   * Already resolved when the opening exchange learned the identifier or the
   * caller supplied one to resume.
   */
  private readonly named: Promise<string>;

  /** Hands the identifier to whoever is waiting, once. */
  private names: ((thread: string) => void) | null = null;

  /** How long an instruction waits for that identifier. */
  private readonly naming: number;

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
    props: CodeHudCodexSession.IProps,
  ) {
    this.named =
      props.thread.length === 0
        ? new Promise<string>((resolve) => {
            this.names = resolve;
          })
        : Promise.resolve(props.thread);
    this.naming = props.naming ?? CodeHudCodexSession.NAMING;
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
    const closed = (): boolean => this.ended;
    const names = (thread: string): void => {
      const resolve = this.names;
      this.names = null;
      resolve?.(thread);
    };
    return {
      [Symbol.asyncIterator]:
        async function* (): AsyncGenerator<ICodeHudAgentEvent> {
          for await (const line of source) {
            const message: CodeHudCodexNormalizer.IMessage =
              line as CodeHudCodexNormalizer.IMessage;
            const produced: ICodeHudAgentEvent[] =
              normalizer.normalize(message);
            // The server names its thread in a notification rather than in a
            // reply, so this stream is where it becomes known, and an
            // instruction waiting to be addressed is released here — after the
            // line has been read rather than before it. Asking first meant the
            // very line that carries the name was the one line that did not
            // release anything, which is invisible in a real session, where
            // more lines follow, and total in one that names its thread and
            // stops.
            const thread: string | undefined = normalizer.thread;
            if (thread !== undefined) names(thread);
            for (const event of produced) {
              if (event.type === "permission" && message.method !== undefined)
                waiting.set(event.request, message.method);
              if (event.type === "result") waiting.clear();
              yield event;
            }
          }
          // The stream ended. This server has an `error` notification, but that
          // reports a protocol failure on a process that is still there; a
          // process that is gone sends nothing, and until now that reached the
          // wearer as a session sitting idle rather than as one that is over.
          // The bridge is written against the assumption that the adapter says
          // so on this stream, so nothing else was going to.
          if (closed() === false)
            yield normalizer.broken("the harness stopped");
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
        threadId: await this.thread(),
        input: [
          { type: "text", text: command.text, text_elements: [] },
          // The attached photographs, in this server's own input vocabulary.
          // It takes a URL rather than a payload, and the contract already
          // carries them as data URLs, so nothing is decoded on the way: the
          // string a device produced is the string the server is handed.
          ...(command.images ?? []).map((url) => ({
            type: "image" as const,
            url,
          })),
        ],
      });

    if (command.type === "interrupt")
      return this.request("turn/interrupt", { threadId: await this.thread() });

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
   * The thread every instruction names, waited for if it is not known yet.
   *
   * The server names it on the observation stream rather than in a reply, so
   * between opening and that notification there is nothing to address. Waiting
   * is the only honest answer: naming an empty thread sends the instruction
   * into a silence the wearer cannot distinguish from a slow agent.
   *
   * Bounded, because the wait depends on something outside this session. The
   * stream is read by whoever owns the session, and one that nobody reads never
   * learns anything; a wearer is owed a refusal rather than a promise that
   * never settles. The bound is a startup allowance and not a timeout on
   * anything a wearer decides — nothing here ever resolves an approval by
   * elapsed time.
   */
  private async thread(): Promise<string> {
    const known: string | undefined = this.normalizer.thread;
    if (known !== undefined) return known;
    const named: string | undefined = await Promise.race([
      this.named,
      CodeHudCodexSession.after(this.naming),
    ]);
    if (named === undefined || named.length === 0)
      throw new Error(
        `the server has not named a thread for session ${this.id}`,
      );
    return named;
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
  /**
   * How long an instruction waits for the server to name its thread.
   *
   * A startup allowance. The server names the thread within the first moments
   * of the process being up; this is an order of magnitude beyond what that
   * takes, and it exists so that a session nobody is reading refuses rather
   * than hangs.
   */
  export const NAMING: number = 10_000;

  /**
   * Resolves to nothing after a while, for the one place that races it.
   *
   * Deliberately not unreferenced. The first version was, on the reasoning that
   * a timer whose only job is to end a wait should not hold a process open —
   * and the effect was that a process with nothing else pending **exited
   * silently** in the middle of that wait, which is the failure the wait exists
   * to turn into a refusal. A few seconds of a held event loop is the price of
   * an answer.
   */
  export const after = (ms: number): Promise<undefined> =>
    new Promise<undefined>((resolve) => {
      setTimeout(() => resolve(undefined), ms);
    });

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

    /**
     * How long an instruction waits for the server to name its thread.
     *
     * Stated so a case can exercise the refusal without spending the allowance
     * a real startup needs. Absent is {@link NAMING}.
     */
    naming?: number;
  }
}
