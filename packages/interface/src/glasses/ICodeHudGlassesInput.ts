/**
 * One thing the wearer did, normalized across vendors.
 *
 * Speech is the only required member. Touch and head gestures are optional
 * accelerators for what speech already reaches, so an interaction that exists
 * only on a device reporting them would be unreachable on the rest and cannot
 * be part of the product's core.
 *
 * No member carries coordinates. None of the supported devices agree on a
 * coordinate space and no interaction in this product needs one.
 *
 * @evidence requirements/glasses-device/device-abstraction.md#glasses-input-vocabulary Exposes the closed input union whose speech member is required and whose gesture members are optional.
 * @evidence specifications/device-surface/capability-and-input.md#spec-device-input-vocabulary Types the three-member union with the coordinate-free constraint the specification fixes.
 * @author Samchon
 */
export type ICodeHudGlassesInput =
  | ICodeHudGlassesInput.ISpeech
  | ICodeHudGlassesInput.ITouch
  | ICodeHudGlassesInput.IMotion;
export namespace ICodeHudGlassesInput {
  /**
   * Recognized speech from the wearer.
   *
   * The instruction channel. Interim results arrive first so a wearer can watch
   * the recognizer keeping up, and only a final result may act, because an
   * instruction assembled from text the wearer has not confirmed is an
   * instruction they did not give.
   *
   * @evidence requirements/voice-interaction/spoken-control.md#voice-no-keyboard Carries the only wearer-originated text in the system, which is a finalized recognition result rather than keystrokes.
   * @evidence specifications/voice-surface/utterance-routing.md#spec-voice-no-text-entry Types the single accepted text origin, so no contract can accept a typed character sequence.
   */
  export interface ISpeech {
    /** Discriminant of this input kind. */
    type: "speech";

    /** Text recognized so far. */
    text: string;

    /**
     * Whether recognition finished and the text is stable.
     *
     * Only a final result may act. Interim text exists to be displayed and
     * then replaced.
     */
    final: boolean;

    /**
     * Recognizer confidence in the final result, from zero to one.
     *
     * Present only on a final result, and only from a recognizer that reports
     * it. A consent answer below the configured floor is treated as no answer
     * rather than resolved by guessing, so a recognizer that reports nothing
     * here cannot be used for consent.
     */
    confidence?: number;
  }

  /**
   * A gesture on the temple touch surface.
   *
   * An accelerator, never a sole route. Present only where the device declared
   * a touch surface, and bound only to operations speech already reaches.
   *
   * @evidence requirements/glasses-device/device-abstraction.md#glasses-input-vocabulary Exposes touch as an optional accelerator rather than a required channel.
   * @evidence specifications/device-surface/capability-and-input.md#spec-device-input-vocabulary Types the gesture set every supported touch surface can report.
   */
  export interface ITouch {
    /** Discriminant of this input kind. */
    type: "touch";

    /** Which gesture the device recognized. */
    gesture: ITouch.Gesture;
  }
  export namespace ITouch {
    /**
     * Touch gestures every supported device can report.
     *
     * `hold` is reserved for negative, destructive, and interrupting meanings
     * throughout, so that no single light contact can deny, cancel, or
     * interrupt by accident.
     */
    export type Gesture = "tap" | "double" | "hold" | "forward" | "backward";
  }

  /**
   * A head movement the device recognized as deliberate.
   *
   * Present only where the device declared motion sensing, and never the sole
   * route to an approval answer, because a wearer walking produces motion they
   * did not intend as input.
   *
   * @evidence requirements/glasses-device/device-abstraction.md#glasses-input-vocabulary Exposes head motion as an optional accelerator excluded from being a sole approval route.
   * @evidence specifications/device-surface/capability-and-input.md#spec-device-input-vocabulary Types the two movements the specification admits.
   */
  export interface IMotion {
    /** Discriminant of this input kind. */
    type: "motion";

    /** Which movement the device recognized. */
    gesture: IMotion.Gesture;
  }
  export namespace IMotion {
    /**
     * Head movements with a conventional meaning.
     *
     * Restricted to the two that are unambiguous in the narrow sense this
     * product uses them: confirm and reject.
     */
    export type Gesture = "nod" | "shake";
  }
}
