import type { ICodeHudAgentEvent } from "../agent/ICodeHudAgentEvent";

/**
 * Everything the reducer remembers between observations.
 *
 * Plain data rather than behavior behind a class, so a session can be
 * serialized, replayed in a test, or handed to a reconnecting device without
 * the harness having to repeat itself. Nothing here references a column count,
 * a row count, a color, a manufacturer, or an input channel: two devices
 * watching one session share this state and compose different frames from it.
 *
 * @evidence requirements/head-up-display/glanceable-rendering.md#hud-device-independent-state Holds the folded state with no device fact in it, so one recorded stream reproduces every display decision.
 * @evidence specifications/display-projection/frame-and-state.md#spec-projection-state-purity Types the geometry-blind state the purity conditions are stated over.
 * @author Samchon
 */
export interface ICodeHudState {
  /**
   * Highest observation counter already folded in, or `-1` before the first.
   *
   * The guard that makes reconnection replay idempotent: an observation at or
   * below this is discarded rather than applied twice, so a late arrival
   * cannot rewind the display.
   */
  sequence: number;

  /**
   * Session facts reported when the agent started, once it has.
   *
   * Absent only in the window between opening a session and the harness
   * acknowledging it, which the display renders as connecting.
   */
  session?: ICodeHudState.ISession;

  /** What the agent is doing as far as the wearer is concerned. */
  activity: ICodeHudState.Activity;

  /**
   * Assistant prose accumulated for the message currently streaming.
   *
   * Reset when a turn finishes, because the display shows the message being
   * written rather than the transcript of the conversation.
   */
  message: string;

  /**
   * Retained history, newest first and bounded.
   *
   * Bounded because a long turn produces hundreds of entries and the display
   * shows one; retained at all because a wearer who looks up after ten minutes
   * has to be able to move back through what happened.
   */
  history: ICodeHudState.IEntry[];

  /** Where the wearer is looking within {@link history}. */
  review: ICodeHudState.IReview;

  /**
   * Approval request blocking the agent, when one is.
   *
   * At most one at a time. A wearer answering a queue of consent prompts on a
   * two-line display is a failure of design, so the client serializes them.
   */
  pending?: ICodeHudAgentEvent.IPermission;

  /**
   * Outcome of the last finished turn, once one has finished.
   *
   * What the idle display falls back to, so a wearer who looks up after ten
   * minutes sees what happened rather than an empty screen.
   */
  last?: ICodeHudAgentEvent.IResult;

  /**
   * Fatal error that ended the session, if one did.
   *
   * Held rather than thrown, because the display still has to say something
   * and a dead session must not look like an idle one.
   */
  fault?: string;
}
export namespace ICodeHudState {
  /**
   * Coarse activity states the display distinguishes.
   *
   * Coarser than the observation stream on purpose: a wearer cannot act on the
   * difference between two kinds of waiting, only on whether the agent needs
   * them right now.
   *
   * @evidence requirements/head-up-display/glanceable-rendering.md#hud-device-independent-state Reduces the observation vocabulary to the states a wearer would act on differently, independently of any device.
   * @evidence specifications/display-projection/frame-and-state.md#spec-projection-state-purity Types the activity the fold produces without consulting a device fact.
   */
  export type Activity =
    | "connecting"
    | "idle"
    | "thinking"
    | "working"
    | "waiting"
    | "done"
    | "fault";

  /**
   * Session facts worth keeping on the display.
   *
   * The working directory is here because it is what a demand-grade alert must
   * name: a wearer running several agents cannot answer an approval that does
   * not say which repository it would modify.
   *
   * @evidence requirements/notification/attention-and-quiet.md#notification-names-session Holds the working directory every demand-grade alert has to state.
   * @evidence specifications/notification/attention-contract.md#spec-notification-session-addressing Types the identifying fact the addressing rule renders, shortened from the left.
   */
  export interface ISession {
    /** Identifier the bridge addresses this session by. */
    id: string;

    /** Model the harness reported for the session. */
    model: string;

    /** Absolute working directory the agent is operating in. */
    directory: string;
  }

  /**
   * One thing that happened, as the display remembers it.
   *
   * Collapsed from however many observations produced it, because the wearer
   * cares that a file was edited rather than that editing it had a start.
   *
   * @evidence requirements/head-up-display/glanceable-rendering.md#hud-reviewable-history Retains the messages, tool calls, and turn summaries a wearer moves back through.
   * @evidence specifications/display-projection/frame-and-state.md#spec-projection-review-traversal Types the ordered bounded history the cursor traverses.
   */
  export interface IEntry {
    /**
     * Identifier correlating this entry to its source observations.
     *
     * A tool invocation reports several phases under one call identifier, and
     * they collapse onto one entry.
     */
    id: string;

    /** What kind of thing this entry records. */
    kind: IEntry.Kind;

    /** One-line description, already shortened for a narrow display. */
    title: string;

    /** Whether the thing this entry records has finished. */
    done: boolean;

    /** Whether it finished by failing. */
    failed: boolean;
  }
  export namespace IEntry {
    /**
     * Kinds of thing the history holds.
     *
     * Reasoning is absent: it is the lowest-value content on the display and
     * retaining it would push the entries a wearer actually reviews out of a
     * bounded history.
     */
    export type Kind = "message" | "tool" | "result";
  }

  /**
   * Where the wearer is looking within the retained history.
   *
   * Moving the cursor is a local state change that consumes no agent turn, no
   * network round trip, and no money, and it works while the bridge is
   * unreachable. Composition recomputes the visible window from it rather than
   * assuming the device offers a scroll container.
   *
   * @evidence requirements/head-up-display/glanceable-rendering.md#hud-reviewable-history Makes review a client-side traversal that never costs a turn and is reachable by speech.
   * @evidence specifications/display-projection/frame-and-state.md#spec-projection-review-traversal Types the cursor the composer recomputes the visible window from.
   */
  export interface IReview {
    /**
     * Whether the wearer is reviewing rather than watching.
     *
     * While false the display follows the newest content; while true it holds
     * position, so incoming observations do not move what is being read.
     */
    active: boolean;

    /**
     * Index into {@link ICodeHudState.history}, newest first.
     *
     * Zero is the newest entry. Out-of-range values are clamped by the
     * composer rather than rejected, because a wearer saying "back" at the end
     * of the history should stop rather than fail.
     */
    offset: number;
  }
}
