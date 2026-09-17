import type { ICodeHudAgentEvent, ICodeHudState } from "@codehud/interface";

/**
 * Folds a coding agent's observation stream into the state a display is drawn
 * from.
 *
 * Pure and device-blind. Nothing here reads a column count, a clock, a random
 * source, or any input or output, so a recorded stream replays to the same
 * state every time, with no hardware and no socket. That property is what makes
 * the most important logic in the product testable at all.
 *
 * @evidence requirements/head-up-display/glanceable-rendering.md#hud-device-independent-state Folds observations into state that references no device fact, so two devices watching one session share it.
 * @evidence requirements/session-continuity/reconnect-and-replay.md#session-idempotent-replay Discards an observation at or below the highest already folded, so a replayed stream converges and a late arrival cannot rewind the display.
 * @evidence specifications/display-projection/frame-and-state.md#spec-projection-state-purity Implements the fold as a pure function of prior state and one observation.
 * @evidence specifications/session-lifecycle/attach-and-replay.md#spec-session-replay-convergence Implements the monotonic guard the convergence property is stated over.
 * @author Samchon
 */
export namespace CodeHudReducer {
  /**
   * Entries retained for review.
   *
   * A long turn produces hundreds and the display shows one at a time, so the
   * cap bounds memory rather than bounding what a wearer may read back to.
   */
  export const HISTORY = 64;

  /**
   * State of a session before its first observation arrives.
   *
   * Starts at sequence `-1` so an observation numbered zero is still ahead of
   * it, which keeps the replay guard a plain comparison.
   */
  export const initialize = (): ICodeHudState => ({
    sequence: -1,
    activity: "connecting",
    message: "",
    history: [],
    review: { active: false, offset: 0 },
  });

  /**
   * Applies one observation, returning the state that results.
   *
   * Returns the input unchanged when the observation was already folded in,
   * which is what makes a reconnecting device safe to replay into: it asks for
   * everything after what it holds and reaches the same state either way.
   */
  export const reduce = (
    state: ICodeHudState,
    event: ICodeHudAgentEvent,
  ): ICodeHudState => {
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
        return record(next, {
          id: `${event.session}:${event.sequence}`,
          kind: "message",
          title: joined.trim(),
          done: true,
          failed: false,
        });
      }

      case "tool":
        next.activity = "working";
        return record(next, {
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
        return record(next, {
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
  };

  /**
   * Clears a pending request once the wearer has answered it.
   *
   * Applied optimistically rather than waiting for the harness to confirm,
   * because the interval between an answer and the next observation is long
   * enough for a wearer to speak again and answer the following request by
   * mistake.
   *
   * Answering a request that is not the pending one changes nothing, so a
   * stale answer cannot clear a newer request.
   */
  export const settle = (
    state: ICodeHudState,
    request: string,
  ): ICodeHudState =>
    state.pending?.request === request
      ? { ...state, pending: undefined, activity: "working" }
      : state;

  /**
   * Moves the review cursor, or leaves review and follows the newest content.
   *
   * A local state change: no agent turn, no network round trip, and it works
   * while the bridge is unreachable. Movement past either end clamps rather
   * than failing, because a wearer saying "back" at the end of the history
   * should stop rather than hear an error.
   */
  export const review = (
    state: ICodeHudState,
    move: CodeHudReducer.Move,
  ): ICodeHudState => {
    if (move === "latest")
      return { ...state, review: { active: false, offset: 0 } };
    if (state.history.length === 0) return state;

    const delta: number = move === "back" ? 1 : -1;
    const offset: number = state.review.active
      ? state.review.offset + delta
      : Math.max(0, delta);
    const clamped: number = Math.min(
      Math.max(0, offset),
      state.history.length - 1,
    );
    return { ...state, review: { active: true, offset: clamped } };
  };

  /**
   * Where a review instruction moves the cursor.
   *
   * `back` walks toward older entries, `forward` toward newer ones, and
   * `latest` leaves review so the display follows incoming content again.
   */
  export type Move = "back" | "forward" | "latest";

  const record = (
    state: ICodeHudState,
    entry: ICodeHudState.IEntry,
  ): ICodeHudState => {
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
      history: [entry, ...state.history].slice(0, HISTORY),
      review: state.review.active
        ? { active: true, offset: state.review.offset + 1 }
        : state.review,
    };
  };
}
