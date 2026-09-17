/**
 * Exactly what the head-up display should show right now.
 *
 * A frame is already fitted to the device it was produced for, so an adapter
 * renders it verbatim and makes no layout decisions of its own. Two vendors
 * showing the same frame differently would make the interaction testable only
 * on all of the hardware at once.
 *
 * @evidence requirements/head-up-display/glanceable-rendering.md#hud-prefitted-frame Exposes content already fitted to the device, so no adapter is left to clip overflow.
 * @evidence specifications/display-projection/frame-and-state.md#spec-projection-frame-fits Types the lines and optional footer the geometry invariant is stated over.
 * @author Samchon
 */
export interface ICodeHudFrame {
  /**
   * Digest of the frame's visible content.
   *
   * An adapter skips the draw when the key matches what it already shows,
   * which is what keeps a waveguide from flickering while a message streams in
   * token by token.
   */
  key: string;

  /** What the wearer is being shown. */
  kind: ICodeHudFrame.Kind;

  /**
   * Lines to draw, already truncated to the device's column count.
   *
   * Never longer than the device's row count once {@link hint} is accounted
   * for. The composer decides what to drop rather than leaving an adapter to
   * clip arbitrarily.
   */
  lines: ICodeHudFrame.ILine[];

  /**
   * What the wearer can say right now, for the bottom of the display.
   *
   * Present only when an utterance is actually bound, because naming a phrase
   * that does nothing is worse than naming nothing. It is a spoken hint rather
   * than a gesture legend: speech is the only instruction channel, so a legend
   * naming a tap would describe an accelerator most devices never deliver to
   * the client.
   */
  hint?: string;

  /** How hard the frame should compete for the wearer's attention. */
  urgency: ICodeHudFrame.Urgency;
}
export namespace ICodeHudFrame {
  /**
   * The situations the display distinguishes.
   *
   * Each maps to a distinct reading posture: a wearer glances at `stream`,
   * stops walking for `permission`, scrolls back through `review`, and ignores
   * `idle` entirely.
   *
   * @evidence requirements/head-up-display/glanceable-rendering.md#hud-prefitted-frame Names the content kinds composition must produce at every geometry, including two rows.
   * @evidence specifications/display-projection/frame-and-state.md#spec-projection-frame-fits Types the kinds the geometry invariant is required to hold for.
   */
  export type Kind =
    "idle" | "status" | "stream" | "permission" | "result" | "review" | "fault";

  /**
   * How insistently a frame should be presented.
   *
   * Mandatory rather than defaulted, and the same fact the notification rules
   * act on, so composition and attention cannot disagree about whether the
   * wearer is interrupted.
   *
   * @evidence requirements/head-up-display/glanceable-rendering.md#hud-urgency Makes every frame state whether it may wake a sleeping display and whether it may speak.
   * @evidence specifications/display-projection/frame-and-state.md#spec-projection-urgency-grade Types the mandatory three-valued grade the specification shares with the notification contract.
   */
  export type Urgency = "ambient" | "notice" | "demand";

  /**
   * One rendered line of a frame.
   *
   * Carries emphasis rather than color, because the monochrome devices have to
   * express the same distinction with weight, case, or a leading marker.
   *
   * @evidence requirements/head-up-display/glanceable-rendering.md#hud-prefitted-frame Carries text already fitted to the declared column count.
   * @evidence specifications/display-projection/frame-and-state.md#spec-projection-frame-fits Types the per-line unit the column invariant is checked against.
   */
  export interface ILine {
    /** Text of the line, already fitted to the display width. */
    text: string;

    /** Relative importance of this line within the frame. */
    tone: ILine.Tone;
  }
  export namespace ILine {
    /**
     * Emphasis levels an adapter must be able to distinguish.
     *
     * Four is the most a monochrome waveguide can express legibly, which is
     * why the set stops here rather than at a richer typographic scale.
     */
    export type Tone = "primary" | "secondary" | "muted" | "alert";
  }
}
