import type { ICodeHudVoiceRouting } from "./voice/ICodeHudVoiceRouting";

/**
 * Everything the pure layers need that is a choice rather than a rule.
 *
 * The fold and the projection are pure functions of the state and the
 * observation, but they are not free of decisions: how many entries to retain,
 * which words a wearer says to answer an approval, what the display calls a
 * turn that was stopped rather than failed. Baking those into the code makes
 * them invisible to the wearer and untestable at the boundary that matters.
 *
 * Carrying them here rather than as parameters on every call is what lets the
 * reducer and the composer be constructed once, with a stated configuration,
 * and then used as the pure functions they are.
 *
 * @evidence requirements/voice-interaction/spoken-control.md#voice-consent-integrity Makes the consent tokens and the confidence floor stated values rather than constants, which is the precondition for choosing them for acoustic distance at all. Enforcing them is the voice router's, declared on the field.
 * @evidence specifications/voice-surface/utterance-routing.md#spec-voice-consent-integrity Gives the floor and the differently worded second confirmation somewhere to be stated. The admission rule itself is typed by ICodeHudVoiceRouting.IConsent and applied by the router.
 * @author Samchon
 */
export interface ICodeHudContext {
  /**
   * Entries the display retains for review.
   *
   * A long turn produces hundreds and the display shows one at a time, so the
   * cap bounds memory rather than bounding what a wearer may read back to.
   */
  history: number;

  /**
   * How a spoken approval answer is admitted or refused.
   *
   * Configuration rather than a constant because the tokens have to be chosen
   * for acoustic distance in the wearer's language, and because a recognizer
   * that reports no confidence cannot be used for consent at all.
   *
   * The projection does not read this. A pending approval's hint names the
   * labels the harness reported, since a wearer answering with a word the
   * harness does not offer has not answered. It lands here now so that the
   * consent tokens live beside the rest of the configuration rather than
   * arriving later as a second context nobody expected.
   *
   * @publicUnconsumed the voice router: it decides whether a recognized
   *   utterance clears the confidence floor and whether a destructive action's
   *   second confirmation was given, and both need these values.
   */
  consent: ICodeHudVoiceRouting.IConsent;

  /** What the display calls things it has to name itself. */
  vocabulary: ICodeHudContext.IVocabulary;
}
export namespace ICodeHudContext {
  /**
   * Words the display uses when it has nothing more specific to show.
   *
   * Every string here is something the system originates rather than something
   * the harness reported, which is exactly the set that has to be translatable
   * and exactly the set a wearer will hear repeated hundreds of times.
   *
   * Data only, with no formatting functions. A contract that carried a
   * formatter would make the rendered phrasing untestable from the contract
   * side and would put behavior in a package that is meant to hold none.
   *
   * @evidence requirements/head-up-display/glanceable-rendering.md#hud-prefitted-frame Names the standing labels the composer fits, so that what fills a narrow display is stated rather than hidden in the composer.
   * @evidence specifications/display-projection/frame-and-state.md#spec-projection-frame-fits Types the system-originated strings the composition rules draw from.
   */
  export interface IVocabulary {
    /** Shown between opening a session and the harness acknowledging it. */
    connecting: string;

    /** Shown when a session is open and the agent is doing nothing. */
    ready: string;

    /** Shown when the agent is working and has reported no tool or prose. */
    working: string;

    /** Shown when the agent is reasoning and has reported no prose. */
    thinking: string;

    /** Verdict for a turn that finished as asked. */
    succeeded: string;

    /**
     * Verdict for a turn the wearer stopped.
     *
     * Distinct from {@link failed} because a wearer's own gesture must never be
     * rendered back to them as an error.
     */
    stopped: string;

    /** Verdict for a turn that ended in an error. */
    failed: string;

    /**
     * Verb that opens a spoken hint, such as `Say`.
     *
     * Separate from the words it introduces because the answers themselves come
     * from the harness and cannot be translated here.
     */
    say: string;

    /** Conjunction between two offered answers, such as `or`. */
    or: string;

    /**
     * Preposition joining a position to a total, such as `of` in `2 of 7`.
     *
     * Here for the same reason as the rest of this section: a wearer reviewing
     * history reads it on every frame, and a literal in the composer would be
     * one word of the interface nobody could translate.
     */
    within: string;

    /** Complete hint for stopping a turn in flight. */
    interrupt: string;

    /** Complete hint for moving through the retained history. */
    review: string;
  }
}
