import type {
  ICodeHudAgentEvent,
  ICodeHudAgentPermission,
} from "@codehud/interface";

/**
 * Turns what Claude Code prints into observations the rest of the system reads.
 *
 * A class because it carries state across lines: a tool result names only the
 * call it answers, so the name and title have to be remembered from the request,
 * and the turn's start has to be remembered to report how long the turn took.
 *
 * Pure in every other sense. It touches no process, no clock it was not handed,
 * and no filesystem, which is what lets every rule here be checked against
 * captured output rather than against a running agent.
 *
 * The absorbing is as much the job as the translating. `rate_limit_event`,
 * `system/status`, and `system/thinking_tokens` are real lines that change
 * nothing a wearer would do, so they become no observation at all rather than a
 * member of the union nobody can act on.
 *
 * @evidence requirements/agent-control/harness-abstraction.md#agent-normalized-observation Translates one harness family's output into the shared observation vocabulary, absorbing the distinctions that would not change what a wearer does.
 * @evidence specifications/agent-harness/normalized-stream.md#spec-agent-event-vocabulary Produces the closed union with a per-session counter from zero, reports a tool under one call identifier across its phases, carries a one-line description made here rather than at the projection boundary, and keeps reasoning distinct from prose.
 * @evidence specifications/agent-harness/control-and-approval.md#spec-agent-permission-pairing Carries the harness's own request identifier onto the approval observation, so an answer can quote it back verbatim.
 * @author Samchon
 */
export class CodeHudClaudeNormalizer {
  private readonly calls: Map<string, CodeHudClaudeNormalizer.ICall> =
    new Map();
  private sequence: number = 0;
  private started: number;

  /** Constructs a normalizer for one session, from that session's start. */
  public constructor(
    private readonly session: string,
    private readonly now: () => number = Date.now,
  ) {
    this.started = this.now();
  }

  /**
   * Translates one harness line into the observations it means.
   *
   * Returns several for an assistant message carrying several content blocks,
   * and none for a line that changes nothing a wearer would act on. The counter
   * advances only for observations actually produced, so an absorbed line
   * leaves no gap.
   */
  public normalize(line: CodeHudClaudeNormalizer.ILine): ICodeHudAgentEvent[] {
    if (line.type === "control_request")
      return line.request?.subtype === "can_use_tool"
        ? this.permission(line)
        : [];
    if (line.type === "system")
      return line.subtype === "init" ? this.opened(line) : [];
    if (line.type === "stream_event") return this.partial(line);
    if (line.type === "assistant" || line.type === "user")
      return this.blocks(line);
    if (line.type === "result") return this.finished(line);
    return [];
  }

  /** The harness's own identifier for this conversation, once it has said. */
  public get native(): string | undefined {
    return this.identity;
  }

  private identity: string | undefined = undefined;

  private opened(line: CodeHudClaudeNormalizer.ILine): ICodeHudAgentEvent[] {
    this.identity = line.session_id;
    this.started = this.now();
    return [
      this.base<ICodeHudAgentEvent.ISession>({
        type: "session",
        model: line.model ?? "",
        directory: line.cwd ?? "",
        ...(line.session_id === undefined ? {} : { native: line.session_id }),
        // A resumed conversation is one the harness was pointed at, which the
        // adapter knows from how it launched rather than from this line.
        resumed: this.resumed,
      }),
    ];
  }

  /** Whether this session was opened by resuming an earlier conversation. */
  public resumed: boolean = false;

  private partial(line: CodeHudClaudeNormalizer.ILine): ICodeHudAgentEvent[] {
    const delta: CodeHudClaudeNormalizer.IDelta | undefined = line.event?.delta;
    if (line.event?.type !== "content_block_delta" || delta === undefined)
      return [];
    if (delta.type === "thinking_delta" && delta.thinking !== undefined)
      return [
        this.base<ICodeHudAgentEvent.IReasoning>({
          type: "reasoning",
          delta: delta.thinking,
        }),
      ];
    if (delta.type === "text_delta" && delta.text !== undefined)
      return [
        this.base<ICodeHudAgentEvent.IMessage>({
          type: "message",
          delta: delta.text,
          complete: false,
        }),
      ];
    return [];
  }

  /**
   * Translates the content blocks of a completed message.
   *
   * A completed text block arrives as a terminator carrying nothing, because
   * the deltas already carried the words and the fold appends what it is given.
   * Emitting the text again would double it on the display. When partial
   * messages are off there were no deltas, and the same terminator carries the
   * whole text instead; the caller says which case it is.
   */
  private blocks(line: CodeHudClaudeNormalizer.ILine): ICodeHudAgentEvent[] {
    const content: CodeHudClaudeNormalizer.IBlock[] = Array.isArray(
      line.message?.content,
    )
      ? line.message.content
      : [];
    const events: ICodeHudAgentEvent[] = [];

    for (const block of content) {
      if (block.type === "text")
        events.push(
          this.base<ICodeHudAgentEvent.IMessage>({
            type: "message",
            delta: this.streaming === true ? "" : (block.text ?? ""),
            complete: true,
          }),
        );
      else if (block.type === "thinking" && this.streaming === false)
        events.push(
          this.base<ICodeHudAgentEvent.IReasoning>({
            type: "reasoning",
            delta: block.thinking ?? "",
          }),
        );
      else if (block.type === "tool_use" && block.id !== undefined) {
        const title: string = CodeHudClaudeNormalizer.title(
          block.name ?? "",
          block.input,
        );
        this.calls.set(block.id, { name: block.name ?? "", title });
        events.push(
          this.base<ICodeHudAgentEvent.ITool>({
            type: "tool",
            call: block.id,
            name: block.name ?? "",
            phase: "start",
            title,
          }),
        );
      } else if (
        block.type === "tool_result" &&
        block.tool_use_id !== undefined
      ) {
        const remembered: CodeHudClaudeNormalizer.ICall | undefined =
          this.calls.get(block.tool_use_id);
        events.push(
          this.base<ICodeHudAgentEvent.ITool>({
            type: "tool",
            call: block.tool_use_id,
            name: remembered?.name ?? "",
            phase: "finish",
            title: remembered?.title ?? remembered?.name ?? "Tool",
            ...(block.is_error === true ? { failed: true } : {}),
          }),
        );
      }
    }
    return events;
  }

  /**
   * Whether the harness was launched with partial messages on.
   *
   * Decides whether a completed block repeats its text or terminates what the
   * deltas already carried. Stated by the caller rather than inferred from
   * having seen a delta, because a message that produced none would then be
   * indistinguishable from one whose deltas are still arriving.
   */
  public streaming: boolean = true;

  private permission(
    line: CodeHudClaudeNormalizer.ILine,
  ): ICodeHudAgentEvent[] {
    const request: string | undefined = line.request_id;
    if (request === undefined) return [];
    const name: string = line.request?.tool_name ?? "";
    return [
      this.base<ICodeHudAgentEvent.IPermission>({
        type: "permission",
        request,
        title: CodeHudClaudeNormalizer.title(name, line.request?.input),
        ...(line.request?.description === undefined
          ? {}
          : { detail: line.request.description }),
        options: [...CodeHudClaudeNormalizer.OPTIONS],
      }),
    ];
  }

  private finished(line: CodeHudClaudeNormalizer.ILine): ICodeHudAgentEvent[] {
    const refused: boolean = (line.permission_denials ?? []).length > 0;
    const outcome: ICodeHudAgentEvent.IResult.Outcome =
      line.is_error === true || line.subtype === "error_during_execution"
        ? "error"
        : refused === true
          ? "interrupted"
          : "success";
    return [
      this.base<ICodeHudAgentEvent.IResult>({
        type: "result",
        outcome,
        summary: (line.result ?? "").split("\n")[0] ?? "",
        elapsed: Math.max(0, this.now() - this.started),
        ...(line.total_cost_usd === undefined
          ? {}
          : { cost: line.total_cost_usd }),
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
export namespace CodeHudClaudeNormalizer {
  /**
   * The two answers this adapter offers a wearer.
   *
   * Built here rather than taken from the harness, which describes a permission
   * request in prose and offers no option list of its own. Each states its own
   * advancing and persisting properties, because the projection boundary
   * assigns spoken inputs by those facts and never by reading the label.
   *
   * Neither persists. A choice that silences later requests of the same shape
   * is exactly the choice a wearer should not be able to make by accident from
   * a two-line display, and the harness's own suggestions are not yet read.
   */
  export const OPTIONS: readonly ICodeHudAgentPermission[] = Object.freeze([
    Object.freeze({
      id: "allow",
      label: "Allow",
      affirmative: true,
      persistent: false,
    }),
    Object.freeze({
      id: "deny",
      label: "Deny",
      affirmative: false,
      persistent: false,
    }),
  ]);

  /**
   * One line of the harness's output, as far as normalization needs it.
   *
   * Loose on purpose. This is a capture of a vendor's format, not a contract
   * this repository owns, and every field here was seen in a real run rather
   * than taken from documentation.
   */
  export interface ILine {
    /** Line kind. */
    type: string;

    /** Finer kind, where the line has one. */
    subtype?: string;

    /** Conversation the line belongs to, absent on control lines. */
    session_id?: string;

    /** Working directory, on an init line. */
    cwd?: string;

    /** Model in use, on an init line. */
    model?: string;

    /** The message, on assistant and user lines. */
    message?: { content?: string | IBlock[] };

    /** The raw streaming event, on a stream_event line. */
    event?: { type?: string; delta?: IDelta };

    /** Correlates a control exchange. */
    request_id?: string;

    /** What the harness is asking its host. */
    request?: {
      subtype?: string;
      tool_name?: string;
      description?: string;
      input?: Record<string, unknown>;
    };

    /** Final text, on a result line. */
    result?: string;

    /** Whether the turn itself failed, on a result line. */
    is_error?: boolean;

    /** What the turn was refused, on a result line. */
    permission_denials?: { tool_name: string }[];

    /** What the turn cost, on a result line. */
    total_cost_usd?: number;
  }

  /** One content block of a message. */
  export interface IBlock {
    /** Block kind. */
    type: string;

    /** Prose, on a text block. */
    text?: string;

    /** Reasoning, on a thinking block. */
    thinking?: string;

    /** Call identifier, on a tool_use block. */
    id?: string;

    /** Tool being invoked, on a tool_use block. */
    name?: string;

    /** Arguments, on a tool_use block. */
    input?: Record<string, unknown>;

    /** Call being answered, on a tool_result block. */
    tool_use_id?: string;

    /** Whether the call failed, on a tool_result block. */
    is_error?: boolean;
  }

  /** One streaming delta. */
  export interface IDelta {
    /** Delta kind. */
    type?: string;

    /** Prose fragment. */
    text?: string;

    /** Reasoning fragment. */
    thinking?: string;
  }

  /** What was remembered about a tool call when it started. */
  export interface ICall {
    /** Tool that was invoked. */
    name: string;

    /** Description shown for every phase of this call. */
    title: string;
  }

  /**
   * Describes a tool call in one line, for a display that has two.
   *
   * The adapter's obligation rather than the projection boundary's, because
   * only something that knows this harness's argument shapes can tell which
   * argument is the one worth showing. A path is shown by its last two
   * segments, since the leading ones are the same for every call in a session
   * and spend room saying nothing.
   *
   * Not fitted to a width. How many columns exist is the device's business, and
   * a line already truncated here would be truncated twice.
   */
  export const title = (
    name: string,
    input: Record<string, unknown> | undefined,
  ): string => {
    const read = (key: string): string | undefined => {
      const value: unknown = input?.[key];
      return typeof value === "string" && value.length > 0 ? value : undefined;
    };
    const salient: string | undefined =
      read("command") ??
      read("pattern") ??
      read("url") ??
      read("description") ??
      (() => {
        const path: string | undefined = read("file_path") ?? read("path");
        return path === undefined ? undefined : tail(path);
      })();
    const one: string = (salient ?? "").replace(/\s+/gu, " ").trim();
    return one.length === 0 ? name : `${name} ${one}`;
  };

  /**
   * The last two segments of a path.
   *
   * Two rather than one because a bare `index.ts` names nothing a wearer can
   * place, and the directory above it usually does.
   */
  export const tail = (path: string): string => {
    const parts: string[] = path.split(/[\\/]+/u).filter((p) => p.length !== 0);
    return parts.slice(-2).join("/");
  };
}
