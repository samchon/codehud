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
 * @evidence requirements/agent-control/turn-and-approval.md#agent-permission-scope-limit Offers only the answers whose scope a two-line display can state, so no answer a wearer cannot understand is reachable from the glasses.
 * @evidence specifications/agent-harness/control-and-approval.md#spec-agent-offered-answers Chooses the reported options per request kind instead of mirroring the server's available list, excludes the persisting and policy-amending answers, and reports a refusal on every request.
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
      return CodeHudCodexNormalizer.APPROVALS.has(message.method) === true
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

  /**
   * Turns one approval request into the question a wearer answers.
   *
   * The offered options come from the method rather than from a single table,
   * because the five methods do not share an answer shape, and from this
   * adapter rather than from the server's own `availableDecisions`: that list
   * includes the policy amendments this surface will not offer.
   *
   * A permissions request names no command, so it says what it is instead. The
   * server's reason is preferred when it gave one, since it is written about
   * this request and anything written here is written about all of them.
   */
  private approval(
    message: CodeHudCodexNormalizer.IMessage,
  ): ICodeHudAgentEvent[] {
    const id: number | undefined = message.id;
    const vocabulary: CodeHudCodexNormalizer.Vocabulary | undefined =
      CodeHudCodexNormalizer.APPROVALS.get(message.method ?? "");
    if (id === undefined || vocabulary === undefined) return [];
    const spoken: string | string[] | undefined = message.params?.command;
    const command: string | undefined =
      spoken === undefined
        ? undefined
        : Array.isArray(spoken) === true
          ? spoken.join(" ")
          : spoken;
    return [
      this.base<ICodeHudAgentEvent.IPermission>({
        type: "permission",
        request: String(id),
        title:
          command !== undefined
            ? CodeHudCodexNormalizer.title(command)
            : CodeHudCodexNormalizer.asked(message.params?.reason),
        ...(message.params?.cwd === undefined
          ? {}
          : { detail: message.params.cwd }),
        options: [...CodeHudCodexNormalizer.OPTIONS[vocabulary]],
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
   * How one approval method expects to be answered.
   *
   * Three, not one. The server's five approval requests do not share an answer
   * shape, and the difference is invisible until something blocks: a modern
   * request takes a decision word from its own enumeration, a legacy one takes
   * a `ReviewDecision` whose refusal is a structure rather than a word, and a
   * permissions request takes no decision at all — it takes the profile being
   * granted and the scope of the grant.
   */
  export type Vocabulary = "modern" | "legacy" | "profile";

  /**
   * The server requests that ask a wearer to decide, and how each is answered.
   *
   * Five, of which an ordinary turn produced one. The other four are here
   * because an adapter that met one and did nothing would leave the harness
   * waiting on an answer nobody was ever shown.
   *
   * A map rather than an object so a method name can never find an answer on
   * `Object.prototype`. Read from the schema the installed binary generates
   * (`codex app-server generate-json-schema`, codex-cli 0.154.0), which is the
   * only statement of the response shapes that comes from the server itself.
   */
  export const APPROVALS: ReadonlyMap<string, Vocabulary> = new Map<
    string,
    Vocabulary
  >([
    ["item/commandExecution/requestApproval", "modern"],
    ["item/fileChange/requestApproval", "modern"],
    ["item/permissions/requestApproval", "profile"],
    ["applyPatchApproval", "legacy"],
    ["execCommandApproval", "legacy"],
  ]);

  /**
   * What this adapter puts on the wire when a request goes unanswered in the
   * legacy vocabulary.
   *
   * The legacy refusal carries a sentence rather than being a bare word, and
   * the server has no use for it beyond the transcript. It says where the
   * refusal came from, because a refusal with no attribution reads in a
   * terminal like the harness declining its own work.
   */
  export const REJECTION: string = "Declined from the wearable surface.";

  /**
   * What a permissions request is called when the server gave no reason.
   *
   * Never the profile it asked for. A granted profile is a list of paths and a
   * network flag, and a display with two lines that tried to state it would
   * either lie by truncation or spend both lines saying less than this does.
   */
  export const ESCALATION: string = "Wider access requested";

  /**
   * What a request naming no command is called.
   *
   * Not put through {@link title}, which is written for commands and would
   * announce a sentence as one. The server's own reason is preferred when it
   * gave one, since it was written about this request and anything written here
   * is written about all of them.
   */
  export const asked = (reason: string | undefined): string => {
    const flat: string = (reason ?? "").replace(/\s+/gu, " ").trim();
    return flat.length === 0 ? ESCALATION : flat;
  };

  /**
   * The answers this adapter offers, per vocabulary.
   *
   * Identifiers are the server's own words wherever the server has one, because
   * a translation table between two vocabularies is a place for exactly the
   * mistake this repository already made: answering a modern request in the
   * legacy vocabulary, which the server silently refuses.
   *
   * Nothing here persists. The protocol offers `acceptForSession`, and a choice
   * that silences later requests of the same shape is not one a wearer should
   * be able to make by accident from a two-line display.
   *
   * Nothing here amends a policy either, and that is the wider rule. The
   * command vocabulary offers `acceptWithExecpolicyAmendment` and
   * `applyNetworkPolicyAmendment`, the legacy one offers three more, and the
   * server proposes them on the request itself and lists them in
   * `availableDecisions`. Each grants a *class* of future action whose scope is
   * a structured object — a command prefix vector, a host and a rule action —
   * that a two-line display cannot render at all. Mirroring the server's list
   * would put the broad grant one word away from the narrow one on the surface
   * least able to tell them apart, so the list is deliberately not mirrored.
   *
   * A permissions request is the same case in the other direction: every
   * affirmative answer to it is a grant of extra filesystem or network access
   * for the turn or the session, so this surface offers only the refusal. The
   * request still reaches the wearer, because an agent that asked for wider
   * access and was refused explains the failure that follows; and the refusal
   * is a well-formed answer, so the harness is unblocked rather than left
   * waiting on a question nobody can answer from here.
   */
  export const OPTIONS: Readonly<
    Record<Vocabulary, readonly ICodeHudAgentPermission[]>
  > = Object.freeze({
    modern: Object.freeze([
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
    ]),
    legacy: Object.freeze([
      Object.freeze({
        id: "approved",
        label: "Allow",
        affirmative: true,
        persistent: false,
      }),
      Object.freeze({
        id: "denied",
        label: "Deny",
        affirmative: false,
        persistent: false,
      }),
    ]),
    profile: Object.freeze([
      Object.freeze({
        id: "withhold",
        label: "Deny",
        affirmative: false,
        persistent: false,
      }),
    ]),
  });

  /**
   * The JSON-RPC result that answers one approval request.
   *
   * Three writers rather than one, each returning only what its own vocabulary
   * admits. Written that way so the suite can assign each one's result to the
   * vendor's own generated response type without a cast: a union wide enough to
   * hold all three would be assignable to none of them, and the check that
   * matters here is precisely that these shapes are the ones the server takes.
   *
   * That check lives in the suite rather than in this package, which keeps its
   * single dependency: importing 700 generated declarations here would subject
   * a vendor's emitted files to this repository's documentation rules.
   */
  export const answer = (
    vocabulary: Vocabulary,
    option: ICodeHudAgentPermission,
  ): IAnswer => {
    switch (vocabulary) {
      case "modern":
        return decided(option);
      case "legacy":
        return reviewed(option);
      case "profile":
        return withheld();
    }
  };

  /** The answer a modern approval method takes. */
  export const decided = (option: ICodeHudAgentPermission): IDecided => ({
    decision: option.affirmative === true ? "accept" : "decline",
  });

  /**
   * The answer a legacy approval method takes.
   *
   * The refusal carries a sentence the affirmative has no place for, which is
   * why this cannot be the same writer as the modern one with a different
   * table of words.
   */
  export const reviewed = (option: ICodeHudAgentPermission): IReviewed =>
    option.affirmative === true
      ? { decision: "approved" }
      : { decision: { denied: { rejection: REJECTION } } };

  /**
   * The answer a permissions request takes.
   *
   * Takes no option, because there is only one answer to give: granting nothing
   * is this protocol's refusal — the response type has no decline member at all
   * — and `turn` is the narrower of its two scopes.
   */
  export const withheld = (): IGranted => ({ permissions: {}, scope: "turn" });

  /**
   * What an answer may be on the wire.
   *
   * Three members for three vocabularies. Stated here rather than imported so
   * this package keeps its single dependency, and pinned to the vendor's own
   * generated response types by the suite, which is where a claim about another
   * program's shape belongs.
   */
  export type IAnswer = IDecided | IReviewed | IGranted;

  /**
   * The answer a modern approval method carries.
   *
   * Two words of the five its enumeration admits. The other three persist the
   * consent or amend a policy, and neither is offered from here.
   */
  export interface IDecided {
    /** The decision, in the modern vocabulary. */
    decision: "accept" | "decline";
  }

  /**
   * The answer a legacy approval method carries.
   *
   * The affirmative is a word and the refusal is a structure, which is the
   * whole reason a decision cannot be passed through untranslated: the same
   * answer that is one string here is a different string in the modern
   * vocabulary and an object in this one.
   */
  export interface IReviewed {
    /** The decision, in the legacy vocabulary. */
    decision: "approved" | { denied: { rejection: string } };
  }

  /**
   * The answer a permissions request carries.
   *
   * No decision word exists for this one. What the server wants back is the
   * profile being granted and how long the grant lasts, and a refusal is an
   * empty profile rather than a refusing word.
   */
  export interface IGranted {
    /** What is granted, which from this surface is always nothing. */
    permissions: Record<string, never>;

    /** How long the grant lasts, which from this surface is never the session. */
    scope: "turn";
  }

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

      /**
       * What is being asked about, on an approval request.
       *
       * One line on the modern methods and an argument vector on the legacy
       * ones, which is not a distinction worth carrying past this file: both
       * say the same thing, and a normalizer that only knew the first would
       * throw on a request from a server old enough to send the second.
       */
      command?: string | string[];

      /** Where it would run, on an approval request. */
      cwd?: string;

      /**
       * Why the server is asking, when it said.
       *
       * Optional on every approval request and the only prose a permissions
       * request carries: that one names no command, so without this there is
       * nothing to put in front of a wearer but the fact that something was
       * asked.
       */
      reason?: string;

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
