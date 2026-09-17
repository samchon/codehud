import type { IAgentPermission } from "./IAgentPermission";

/**
 * One normalized observation from a running coding agent.
 *
 * Claude Code emits newline-delimited `stream-json`, Codex answers JSON-RPC on
 * its app server, and neither vocabulary survives contact with a two-line
 * display. This union is the single shape the reducer consumes, so a new
 * harness costs an adapter and nothing downstream of it.
 *
 * @evidence requirements/agent-control/harness-abstraction.md#agent-normalized-observation Exposes the single normalized vocabulary both harness adapters translate into.
 * @evidence requirements/product/charter.md#product-not-an-agent Bounds displayable content to reductions of harness-reported facts, since every member originates with the harness.
 * @evidence specifications/agent-harness/normalized-stream.md#spec-agent-event-vocabulary Types the closed discriminated union the specification fixes.
 * @evidence specifications/product-boundary/charter-refinement.md#spec-product-judgement-locus Types the only origin of displayed content, so the system cannot originate a tool call or an option.
 * @author Samchon
 */
export type IAgentEvent =
  | IAgentEvent.ISession
  | IAgentEvent.IReasoning
  | IAgentEvent.IMessage
  | IAgentEvent.ITool
  | IAgentEvent.IPermission
  | IAgentEvent.IResult
  | IAgentEvent.IError;
export namespace IAgentEvent {
  /**
   * Fields every observation carries regardless of its kind.
   *
   * Sequencing lives here rather than in the transport because a wearer may
   * reconnect mid-turn, and the client must be able to tell a replayed event
   * from a new one without trusting socket order.
   *
   * @evidence requirements/session-continuity/reconnect-and-replay.md#session-idempotent-replay Carries the per-session counter that makes a replayed observation distinguishable from a new one.
   * @evidence specifications/session-lifecycle/attach-and-replay.md#spec-session-replay-convergence Types the monotonic guard the convergence property is computed from.
   */
  export interface IBase {
    /**
     * Session this observation belongs to.
     *
     * One bridge multiplexes several sessions over one socket, so every frame
     * is addressed rather than implied by connection identity.
     */
    session: string;

    /**
     * Monotonic per-session counter, starting at zero.
     *
     * The client discards any event whose sequence it has already reduced,
     * which is what makes reconnection replay safe.
     */
    sequence: number;

    /**
     * Wall-clock time the bridge observed the event, in epoch milliseconds.
     *
     * Taken on the host rather than the device because the two clocks are not
     * synchronized and only relative age is ever displayed.
     */
    at: number;
  }

  /**
   * The agent accepted a session and reported what it is working with.
   *
   * Always the first event of a session, including after a resume, so the
   * display can state the working directory before any output arrives.
   *
   * @evidence requirements/agent-control/harness-abstraction.md#agent-session-lifetime Reports the working directory and resume state a session was opened with.
   * @evidence specifications/agent-harness/normalized-stream.md#spec-agent-session-open Types the acknowledgement of the opening contract.
   */
  export interface ISession extends IBase {
    /** Discriminant of this event kind. */
    type: "session";

    /**
     * Model identifier the harness reported for the session.
     *
     * Shown once on session start; wearers switch models rarely and the line
     * is expensive, so it never appears again unless it changes.
     */
    model: string;

    /**
     * Absolute working directory the agent was launched in.
     *
     * The single most load-bearing fact on a head-up display: it is how a
     * wearer knows which repository an approval request would modify.
     */
    directory: string;

    /**
     * Whether this session continues prior history rather than starting fresh.
     *
     * Rendered because a resumed session carries context the wearer cannot
     * see, which changes how much a terse prompt will do.
     */
    resumed: boolean;
  }

  /**
   * Internal reasoning text, streamed as it is produced.
   *
   * Carried through so a device may show progress during long silent stretches,
   * but marked distinctly: the reducer treats it as the lowest-value content on
   * the display and drops it first when space runs out.
   *
   * @evidence requirements/agent-control/harness-abstraction.md#agent-normalized-observation Distinguishes reasoning from prose so the lower-value content can be dropped first.
   * @evidence specifications/agent-harness/normalized-stream.md#spec-agent-event-vocabulary Types the reasoning member the specification separates from wearer-addressed prose.
   */
  export interface IReasoning extends IBase {
    /** Discriminant of this event kind. */
    type: "reasoning";

    /** Text produced since the previous reasoning event of this session. */
    delta: string;
  }

  /**
   * Assistant prose addressed to the wearer, streamed as it is produced.
   *
   * This is the content a wearer actually waits for, so it outranks reasoning
   * and tool chatter whenever the reducer must choose what to show.
   *
   * @evidence requirements/agent-control/harness-abstraction.md#agent-normalized-observation Carries the prose the wearer actually waits for, separated from reasoning.
   * @evidence specifications/agent-harness/normalized-stream.md#spec-agent-event-vocabulary Types the wearer-addressed member of the observation union.
   */
  export interface IMessage extends IBase {
    /** Discriminant of this event kind. */
    type: "message";

    /** Text produced since the previous message event of this session. */
    delta: string;

    /**
     * Whether the assistant finished this message.
     *
     * The reducer holds a partial message on screen and only lets it scroll
     * away once the message is complete, so a wearer never loses a half-read
     * sentence to the next token.
     */
    complete: boolean;
  }

  /**
   * A tool invocation entering, advancing through, or leaving execution.
   *
   * Tool traffic is the bulk of an agent's output and almost none of it belongs
   * on a display, so the adapter is responsible for reducing each call to a
   * single short title before it reaches the reducer.
   *
   * @evidence requirements/agent-control/harness-abstraction.md#agent-normalized-observation Carries the adapter-shortened description, so tool argument shapes never reach the display.
   * @evidence specifications/agent-harness/normalized-stream.md#spec-agent-event-vocabulary Types the one-call-identifier-across-phases reporting the specification requires.
   */
  export interface ITool extends IBase {
    /** Discriminant of this event kind. */
    type: "tool";

    /**
     * Identifier correlating the phases of one invocation.
     *
     * The reducer collapses every phase of a call onto one display slot, which
     * requires knowing which events describe the same call.
     */
    call: string;

    /**
     * Raw tool name as the harness reported it, such as `Edit`.
     *
     * Retained for logs and for adapters that map names to icons; the display
     * prefers {@link title}.
     */
    name: string;

    /**
     * Stage this event reports for the invocation.
     *
     * A call that never reaches a terminal phase is how a stuck agent looks
     * from the outside, so the phase is explicit rather than inferred from
     * whether a result arrived.
     */
    phase: ITool.Phase;

    /**
     * One-line description already shortened for a narrow display.
     *
     * Produced by the adapter, which is the only layer that knows a given
     * harness's argument shape, such as turning an `Edit` call into
     * `Edit src/index.ts`.
     */
    title: string;

    /**
     * Whether a finished invocation failed.
     *
     * Absent on non-terminal phases. A failure is escalated by the reducer
     * because it usually means the wearer must intervene.
     */
    failed?: boolean;
  }
  export namespace ITool {
    /**
     * Lifecycle stages of a single tool invocation.
     *
     * `update` exists for long-running calls that report progress; a harness
     * that reports none simply never emits it.
     *
     * @evidence requirements/agent-control/harness-abstraction.md#agent-normalized-observation Makes a call that never reaches a terminal phase observable, which is how a stuck agent looks from outside.
     * @evidence specifications/agent-harness/normalized-stream.md#spec-agent-event-vocabulary Types the explicit phase rather than inferring termination from a result arriving.
     */
    export type Phase = "start" | "update" | "finish";
  }

  /**
   * The agent is blocked waiting for the wearer to approve an action.
   *
   * The whole product turns on this event. Everything else can be caught up on
   * later; this one stops the agent until a wrist or a voice answers it.
   *
   * @evidence requirements/agent-control/turn-and-approval.md#agent-permission-blocking Carries the request identifier an answer must quote, so a queued request cannot be answered by accident.
   * @evidence specifications/agent-harness/control-and-approval.md#spec-agent-permission-pairing Types the blocking request half of the identifier pairing.
   */
  export interface IPermission extends IBase {
    /** Discriminant of this event kind. */
    type: "permission";

    /**
     * Identifier the answer must quote.
     *
     * Requests may queue, so the answer names its request rather than relying
     * on the most recent one still being current.
     */
    request: string;

    /**
     * Short statement of what the agent wants to do, such as
     * `Write src/index.ts`.
     *
     * Must be readable in about two seconds, because that is the budget a
     * wearer gives a head-up display before looking away.
     */
    title: string;

    /**
     * Fuller description for devices with room to show it.
     *
     * Optional by design: a two-line display renders only {@link title}, and
     * the request must be answerable from the title alone.
     */
    detail?: string;

    /**
     * Answers the harness will accept, in the order it offered them.
     *
     * Order is preserved for devices that can list them; the reducer reorders
     * by {@link IAgentPermission.affirmative} when binding them to gestures.
     */
    options: IAgentPermission[];
  }

  /**
   * A turn finished and the agent is idle again.
   *
   * The event that lets the display go quiet, and the one that drives the
   * completion signal a wearer feels when a long task ends.
   *
   * @evidence requirements/agent-control/turn-and-approval.md#agent-turn-outcome Reports what changed in one line, with cost absent rather than zero when unreported.
   * @evidence specifications/agent-harness/control-and-approval.md#spec-agent-result-report Types the turn-end observation the specification fixes.
   */
  export interface IResult extends IBase {
    /** Discriminant of this event kind. */
    type: "result";

    /** How the turn ended. */
    outcome: IResult.Outcome;

    /**
     * One-line summary of the turn, already shortened for a narrow display.
     *
     * A wearer who looked away for ten minutes reads this line and nothing
     * else, so it states what changed rather than that the turn ended.
     */
    summary: string;

    /**
     * Wall-clock duration of the turn in milliseconds.
     *
     * Rendered in coarse units because the display has no room for precision
     * and a wearer only ever compares it to their own patience.
     */
    elapsed: number;

    /**
     * Cost of the turn in United States dollars, when the harness reports it.
     *
     * Absent for harnesses and plans that report no cost, which is not an
     * error and must not be rendered as zero.
     */
    cost?: number;
  }
  export namespace IResult {
    /**
     * Terminal states a turn can reach.
     *
     * `interrupted` is distinct from `error` because the wearer caused it, and
     * the display must not report their own gesture as a failure.
     *
     * @evidence requirements/agent-control/turn-and-approval.md#agent-turn-outcome Separates a wearer's own interruption from a failure, so their gesture is never reported as an error.
     * @evidence specifications/agent-harness/control-and-approval.md#spec-agent-result-report Types the three terminal states the specification admits.
     */
    export type Outcome = "success" | "error" | "interrupted";
  }

  /**
   * The harness, the transport, or the adapter failed.
   *
   * Separate from a failed turn: this is the session itself breaking, and a
   * fatal instance means no further event will arrive.
   *
   * @evidence requirements/bridge-and-pairing/local-only-transport.md#bridge-single-rejection-channel Reports a harness or transport failure through the one channel a wearer looks at when nothing is happening.
   * @evidence specifications/local-bridge/rpc-protocol.md#spec-bridge-refusal-channel Types the session-level failure in the uniform display-readable form.
   */
  export interface IError extends IBase {
    /** Discriminant of this event kind. */
    type: "error";

    /**
     * Message shortened for a narrow display.
     *
     * Adapters strip stack traces here; the full text belongs in the bridge's
     * own log, which a wearer can read on the host machine.
     */
    message: string;

    /**
     * Whether the session is over.
     *
     * A fatal error makes the client stop reducing and offer a restart rather
     * than leave a dead session looking live.
     */
    fatal: boolean;
  }
}
