import type {
  ICodeHudAgentEvent,
  ICodeHudAgentPermission,
} from "@codehud/interface";

/**
 * Turns what `codex app-server` sends into observations the rest reads.
 *
 * A class because it carries state across messages: a completed item has to be
 * matched to the one that started, and the turn's start has to be remembered to
 * report how long it took. Pure otherwise, which is what lets every rule here
 * be checked against captured output rather than a running agent.
 *
 * Written against what a real turn produced rather than what the protocol
 * declares. `ThreadItem` has nineteen variants; an ordinary turn emits four.
 * The rules below cover those four and absorb the rest, because a rule for a
 * kind nothing emits is a guess wearing the clothes of a decision.
 *
 * @evidence requirements/agent-control/harness-abstraction.md#agent-normalized-observation Translates the second harness family's output into the same observation vocabulary, absorbing what would not change a wearer's action.
 * @evidence specifications/agent-harness/normalized-stream.md#spec-agent-event-vocabulary Produces the closed union with a per-session counter from zero, reports a command under one identifier across its phases with a one-line description made here, and keeps reasoning distinct from prose.
 * @evidence specifications/agent-harness/control-and-approval.md#spec-agent-permission-pairing Carries the server's own request identifier onto the approval observation, so an answer can quote it back.
 * @author Samchon
 */
export class CodeHudCodexNormalizer {
  private readonly titles: Map<string, string> = new Map();
  private sequence: number = 0;
  private started: number;

  /** Constructs a normalizer for one session. */
  public constructor(
    private readonly session: string,
    private readonly now: () => number = Date.now,
  ) {
    this.started = this.now();
  }

  /** The server's own identifier for this conversation, once it has said. */
  public get thread(): string | undefined {
    return this.identity;
  }

  private identity: string | undefined = undefined;

  /**
   * Translates one server message into the observations it means.
   *
   * Returns none for the eleven kinds of bookkeeping a wearer would do nothing
   * differently for: rate limits, token usage, hooks, MCP startup, remote
   * control status. The counter advances only for observations produced, so an
   * absorbed message leaves no gap.
   */
  public normalize(
    message: CodeHudCodexNormalizer.IMessage,
  ): ICodeHudAgentEvent[] {
    // A request, not a notification: the server is asking, and waiting.
    if (message.id !== undefined && message.method !== undefined)
      return CodeHudCodexNormalizer.APPROVALS.includes(message.method) === true
        ? this.approval(message)
        : [];

    switch (message.method) {
      case "thread/started":
        this.identity = message.params?.thread?.id;
        return [];
      case "turn/started":
        this.started = this.now();
        return [
          this.base<ICodeHudAgentEvent.ISession>({
            type: "session",
            model: message.params?.turn?.model ?? "",
            directory: this.directory,
            ...(this.identity === undefined ? {} : { native: this.identity }),
            resumed: this.resumed,
          }),
        ];
      case "item/agentMessage/delta":
        return [
          this.base<ICodeHudAgentEvent.IMessage>({
            type: "message",
            delta: message.params?.delta ?? "",
            complete: false,
          }),
        ];
      case "item/started":
      case "item/completed":
        return this.item(message, message.method === "item/completed");
      case "turn/completed":
        return this.finished(message);
      case "error":
        return [
          this.base<ICodeHudAgentEvent.IError>({
            type: "error",
            message: message.params?.message ?? "the server reported an error",
            fatal: true,
          }),
        ];
      case undefined:
      default:
        // A response to something we asked, or one of the eleven kinds of
        // bookkeeping. Neither changes what a wearer would do.
        return [];
    }
  }

  /** Working directory the session runs in, reported on its first observation. */
  public directory: string = "";

  /** Whether this conversation was opened by resuming an earlier one. */
  public resumed: boolean = false;

  private item(
    message: CodeHudCodexNormalizer.IMessage,
    complete: boolean,
  ): ICodeHudAgentEvent[] {
    const item: CodeHudCodexNormalizer.IItem | undefined = message.params?.item;
    if (item?.id === undefined) return [];

    switch (item.type) {
      case "agentMessage":
        // Only the completion matters: the deltas already carried the words,
        // and this arrives as a terminator so the display does not show them
        // twice. The text is checked to agree with the deltas in the fixtures.
        return complete === false
          ? []
          : [
              this.base<ICodeHudAgentEvent.IMessage>({
                type: "message",
                delta: this.streaming === true ? "" : (item.text ?? ""),
                complete: true,
              }),
            ];

      case "reasoning": {
        // Absorbed when it carries nothing, which is what these captures show:
        // an empty summary and empty content. An empty reasoning observation
        // would spend a line of a two-line display saying nothing.
        const text: string = (item.summary ?? [])
          .concat(item.content ?? [])
          .join(" ")
          .trim();
        return complete === false || text.length === 0
          ? []
          : [
              this.base<ICodeHudAgentEvent.IReasoning>({
                type: "reasoning",
                delta: text,
              }),
            ];
      }

      case "commandExecution": {
        const title: string =
          this.titles.get(item.id) ??
          CodeHudCodexNormalizer.title(item.command ?? "");
        this.titles.set(item.id, title);
        return [
          this.base<ICodeHudAgentEvent.ITool>({
            type: "tool",
            call: item.id,
            name: "command",
            phase: complete === true ? "finish" : "start",
            title,
            ...(complete === true && item.status !== "completed"
              ? { failed: true }
              : {}),
          }),
        ];
      }

      case undefined:
      default:
        // userMessage among them: the wearer's own words, handed back.
        return [];
    }
  }

  /**
   * Whether the completed message terminates deltas or carries the whole text.
   *
   * True is the ordinary case, because the server streams prose whether or not
   * anyone asked. Stated rather than inferred from having seen a delta, since a
   * message that produced none would otherwise be indistinguishable from one
   * whose deltas are still arriving.
   */
  public streaming: boolean = true;

  private approval(
    message: CodeHudCodexNormalizer.IMessage,
  ): ICodeHudAgentEvent[] {
    const id: number | undefined = message.id;
    if (id === undefined) return [];
    return [
      this.base<ICodeHudAgentEvent.IPermission>({
        type: "permission",
        request: String(id),
        title: CodeHudCodexNormalizer.title(message.params?.command ?? ""),
        ...(message.params?.cwd === undefined
          ? {}
          : { detail: message.params.cwd }),
        options: [...CodeHudCodexNormalizer.OPTIONS],
      }),
    ];
  }

  private finished(
    message: CodeHudCodexNormalizer.IMessage,
  ): ICodeHudAgentEvent[] {
    const turn: CodeHudCodexNormalizer.ITurn | undefined = message.params?.turn;
    const outcome: ICodeHudAgentEvent.IResult.Outcome =
      turn?.error !== undefined && turn.error !== null
        ? "error"
        : turn?.status === "interrupted" || turn?.status === "cancelled"
          ? "interrupted"
          : turn?.status === "completed"
            ? "success"
            : "error";
    return [
      this.base<ICodeHudAgentEvent.IResult>({
        type: "result",
        outcome,
        summary: CodeHudCodexNormalizer.summary(turn),
        elapsed: Math.max(0, this.now() - this.started),
      }),
    ];
  }

  private base<T extends ICodeHudAgentEvent>(
    props: Omit<T, "session" | "sequence" | "at">,
  ): T {
    return {
      ...props,
      session: this.session,
      sequence: this.sequence++,
      at: this.now(),
    } as T;
  }
}
export namespace CodeHudCodexNormalizer {
  /**
   * The server requests that ask a wearer to decide.
   *
   * Five, of which an ordinary turn produced one. The other four are here
   * because an adapter that met one and did nothing would leave the harness
   * waiting on an answer nobody was ever shown.
   */
  export const APPROVALS: readonly string[] = Object.freeze([
    "item/commandExecution/requestApproval",
    "item/fileChange/requestApproval",
    "item/permissions/requestApproval",
    "applyPatchApproval",
    "execCommandApproval",
  ]);

  /**
   * The two answers this adapter offers.
   *
   * Their identifiers are the server's own words rather than ours, because the
   * session sends them straight back and a translation table between two
   * vocabularies is a place for exactly the mistake this repository already
   * made: answering a modern request in the legacy vocabulary, which the server
   * silently refuses.
   *
   * Neither persists. The protocol offers `acceptForSession`, and a choice that
   * silences later requests of the same shape is not one a wearer should be
   * able to make by accident from a two-line display.
   */
  export const OPTIONS: readonly ICodeHudAgentPermission[] = Object.freeze([
    Object.freeze({
      id: "accept",
      label: "Allow",
      affirmative: true,
      persistent: false,
    }),
    Object.freeze({
      id: "decline",
      label: "Deny",
      affirmative: false,
      persistent: false,
    }),
  ]);

  /** One JSON-RPC message from the server, as far as normalization needs it. */
  export interface IMessage {
    /** Correlation identifier, present when the server expects an answer. */
    id?: number;

    /** Method, on a notification or a request. */
    method?: string;

    /** Whatever the method carries. */
    params?: {
      /** The thread, on `thread/started`. */
      thread?: { id?: string };

      /** The turn, on `turn/started` and `turn/completed`. */
      turn?: ITurn;

      /** The item, on `item/started` and `item/completed`. */
      item?: IItem;

      /** Prose fragment, on an agent message delta. */
      delta?: string;

      /** What is being asked about, on an approval request. */
      command?: string;

      /** Where it would run, on an approval request. */
      cwd?: string;

      /** What went wrong, on an error notification. */
      message?: string;
    };
  }

  /** One thread item, in the four shapes an ordinary turn produces. */
  export interface IItem {
    /** Item kind. */
    type?: string;

    /** Identifier, stable across the item's start and completion. */
    id?: string;

    /** Prose, on an agent message. */
    text?: string;

    /** Reasoning summary fragments. */
    summary?: string[];

    /** Reasoning body fragments. */
    content?: string[];

    /** What was run, on a command execution. */
    command?: string;

    /** How it ended: `completed`, `declined`, `failed`, `inProgress`. */
    status?: string;
  }

  /** One turn, as its start and completion report it. */
  export interface ITurn {
    /** Model driving the turn. */
    model?: string;

    /** How the turn ended. */
    status?: string;

    /** What went wrong, if anything did. */
    error?: unknown;
  }

  /**
   * Describes a command in one line, for a display that has two.
   *
   * The adapter's obligation rather than the projection boundary's, because
   * only something that knows this harness's shapes can tell what is worth
   * showing. Codex reports a command as the full line it will run, which on
   * Windows means an absolute interpreter path and a `-Command` flag in front
   * of the part anyone cares about. The interpreter is dropped and the quoted
   * script kept.
   *
   * Not fitted to a width: how many columns exist is the device's business.
   */
  export const title = (command: string): string => {
    const flat: string = command.replace(/\s+/gu, " ").trim();
    if (flat.length === 0) return "command";
    const quoted: RegExpMatchArray | null = flat.match(/'([^']+)'|"([^"]+)"$/u);
    const inner: string | undefined = quoted?.[1] ?? quoted?.[2];
    const shown: string =
      inner !== undefined && /-Command|-c\b/u.test(flat) === true
        ? inner
        : flat;
    return shown.startsWith("command") === true ? shown : `command ${shown}`;
  };

  /**
   * One line saying how the turn ended.
   *
   * Built here rather than taken from the turn, because Codex reports a turn's
   * outcome as a status and an optional error rather than as a sentence, and
   * the display needs a sentence.
   */
  export const summary = (turn: ITurn | undefined): string => {
    if (turn?.error !== undefined && turn.error !== null)
      return typeof turn.error === "string"
        ? turn.error
        : ((turn.error as { message?: string }).message ??
            "the turn ended in an error");
    return turn?.status ?? "finished";
  };
}
