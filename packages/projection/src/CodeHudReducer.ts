import type {
  ICodeHudAgentEvent,
  ICodeHudContext,
  ICodeHudState,
} from "@codehud/interface";

/**
 * Folds a coding agent's observation stream into the state a display is drawn
 * from.
 *
 * A class rather than a namespace because it carries a configuration: how much
 * history to retain is a choice a wearer can change, not a constant. What it
 * does not carry is state between calls. Every method is a pure function of the
 * state and observation it is handed, so a recorded stream replays to the same
 * result every time, with no hardware, no socket, and no clock. That property
 * is what makes the most important logic in the product testable at all.
 *
 * @evidence requirements/head-up-display/glanceable-rendering.md#hud-device-independent-state Folds observations into state that references no device fact, so two devices watching one session share it.
 * @evidence requirements/session-continuity/reconnect-and-replay.md#session-idempotent-replay Discards an observation at or below the highest already folded, so a replayed stream converges and a late arrival cannot rewind the display.
 * @evidence specifications/display-projection/frame-and-state.md#spec-projection-state-purity Implements the fold as a pure function of prior state and one observation.
 * @evidence specifications/session-lifecycle/attach-and-replay.md#spec-session-replay-convergence Implements the monotonic guard the convergence property is stated over.
 * @author Samchon
 */
export class CodeHudReducer {
  /**
   * Constructs a reducer bound to one configuration.
   *
   * The configuration is read at every call rather than copied, so a caller
   * holding a mutable context sees its own changes. Nothing here mutates it.
   */
  public constructor(private readonly context: ICodeHudContext) {}

  /**
   * State of a session before its first observation arrives.
   *
   * Starts at sequence `-1` so an observation numbered zero is still ahead of
   * it, which keeps the replay guard a plain comparison.
   */
  public initialize(): ICodeHudState {
    return {
      sequence: -1,
      activity: "connecting",
      message: "",
      history: [],
      review: { active: false, offset: 0 },
    };
  }

  /**
   * Applies one observation, returning the state that results.
   *
   * Returns the input unchanged when the observation was already folded in,
   * which is what makes a reconnecting device safe to replay into: it asks for
   * everything after what it holds and reaches the same state either way.
   */
  public reduce(
    state: ICodeHudState,
    event: ICodeHudAgentEvent,
  ): ICodeHudState {
    if (event.sequence <= state.sequence) return state;
    const next: ICodeHudState = { ...state, sequence: event.sequence };
    switch (event.type) {
      case "session":
        next.session = {
          id: event.session,
          model: event.model,
          directory: event.directory,
        };
        next.activity = "idle";
        return next;

      case "reasoning":
        next.activity = "thinking";
        return next;

      case "message": {
        const joined: string = state.message + event.delta;
        next.activity = "working";
        if (event.complete === false) {
          next.message = joined;
          return next;
        }
        next.message = "";
        return this.record(next, {
          id: `${event.session}:${event.sequence}`,
          kind: "message",
          title: joined.trim(),
          done: true,
          failed: false,
        });
      }

      case "tool":
        next.activity = "working";
        return this.record(next, {
          id: event.call,
          kind: "tool",
          title: event.title,
          done: event.phase === "finish",
          failed: event.failed === true,
        });

      case "permission":
        next.activity = "waiting";
        next.pending = event;
        return next;

      case "result":
        next.activity = "done";
        next.pending = undefined;
        next.last = event;
        next.message = "";
        return this.record(next, {
          id: `${event.session}:${event.sequence}`,
          kind: "result",
          title: event.summary,
          done: true,
          failed: event.outcome === "error",
        });

      case "error":
        if (event.fatal === false) return next;
        next.activity = "fault";
        next.pending = undefined;
        next.fault = event.message;
        return next;
    }
  }

  /**
   * Clears a pending request once the wearer has answered it.
   *
   * Applied optimistically rather than waiting for the harness to confirm,
   * because the interval between an answer and the next observation is long
   * enough for a wearer to speak again and answer the following request by
   * mistake.
   *
   * Answering a request that is not the pending one changes nothing, so a stale
   * answer cannot clear a newer request.
   */
  public settle(state: ICodeHudState, request: string): ICodeHudState {
    return state.pending?.request === request
      ? { ...state, pending: undefined, activity: "working" }
      : state;
  }

  /**
   * Moves the review cursor, or leaves review and follows the newest content.
   *
   * A local state change: no agent turn, no network round trip, and it works
   * while the bridge is unreachable. Movement past either end clamps rather
   * than failing, because a wearer saying the word for back at the end of the
   * history should stop rather than hear an error.
   */
  public review(
    state: ICodeHudState,
    move: CodeHudReducer.Move,
  ): ICodeHudState {
    if (move === "latest")
      return { ...state, review: { active: false, offset: 0 } };
    if (state.history.length === 0) return state;
    // Moving toward newer content while already following it does nothing.
    // Entering review here would pin the display at the newest entry and stop
    // it tracking what arrives next, which is a freeze the wearer did not ask
    // for and cannot tell from the agent having gone quiet.
    if (state.review.active === false && move === "forward") return state;

    const offset: number = state.review.active
      ? state.review.offset + (move === "back" ? 1 : -1)
      : 1;
    return {
      ...state,
      review: {
        active: true,
        offset: Math.min(Math.max(0, offset), state.history.length - 1),
      },
    };
  }

  private record(
    state: ICodeHudState,
    entry: ICodeHudState.IEntry,
  ): ICodeHudState {
    const index: number = state.history.findIndex((e) => e.id === entry.id);
    if (index !== -1) {
      const history: ICodeHudState.IEntry[] = state.history.slice();
      history[index] = entry;
      return { ...state, history };
    }
    // A new entry is prepended, which shifts every existing index by one. A
    // wearer holding a cursor is reading a particular entry, not a particular
    // position, so the cursor moves with it.
    return {
      ...state,
      history: [entry, ...state.history].slice(0, this.context.history),
      review: state.review.active
        ? { active: true, offset: state.review.offset + 1 }
        : state.review,
    };
  }
}
export namespace CodeHudReducer {
  /**
   * Where a review instruction moves the cursor.
   *
   * `back` walks toward older entries, `forward` toward newer ones, and
   * `latest` leaves review so the display follows incoming content again.
   */
  export type Move = "back" | "forward" | "latest";
}
