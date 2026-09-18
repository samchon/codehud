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

    /**
     * What a host says when an utterance matched more than one command.
     *
     * Introduces the candidates rather than standing alone, because a wearer
     * told only that they were ambiguous has to guess which two.
     */
    ambiguous: string;

    /**
     * What a host says when nothing was heard clearly enough to act on.
     *
     * Said rather than silent. A wearer whose consent answer fell below the
     * floor is owed the difference between not being heard and not being
     * listened to, and the request is still theirs to answer.
     */
    unheard: string;

    /**
     * What a host says when the answer a wearer gave is not one on offer.
     *
     * Reachable whenever a harness omits an answer this surface would otherwise
     * expect, such as a request that can only be refused.
     */
    unoffered: string;

    /**
     * What a host says when asked for a session that is not there.
     *
     * A wearer selects a session by its ordinal, and a misheard number names
     * one that does not exist. Saying so is what separates a number nobody
     * heard from a number that moved the display somewhere unexpected.
     */
    nosuch: string;

    /**
     * How the list of sessions introduces itself.
     *
     * The list that follows is what a wearer selects from by number, so it is
     * the one place a session's identity has to be readable rather than short.
     */
    listing: string;

    /** How the session currently on the display is marked in that list. */
    showing: string;

    /**
     * What a request waiting on its second answer is prefixed with.
     *
     * A wearer who has already said the affirmative and sees the same words
     * again cannot tell a request that needs confirming from one that did not
     * hear them, and the difference decides whether they say it a third time.
     */
    again: string;

    /**
     * What a host says when it has been asked to stop waking the wearer.
     *
     * Said rather than drawn: a wearer entering quiet mode is by definition
     * about to stop looking, and a display that acknowledged it silently would
     * leave them unsure whether they had been heard.
     */
    muted: string;

    /** What a host says when waking and speech are permitted again. */
    unmuted: string;

    /**
     * What a host says when the connection to the bridge has gone.
     *
     * Said rather than drawn: the display is still showing the last frame it
     * had, which is true of the session and no longer true of the connection,
     * and a wearer needs to know which of the two they are reading.
     */
    dropped: string;

    /** What a host says when it has stopped trying to reach the bridge. */
    unreachable: string;

    /**
     * What a host says when the recognizer cannot say how sure it is.
     *
     * Consent requires a confidence and the platform makes reporting one
     * optional, so a device can be handed an engine that never does. Every
     * approval is then refused, correctly, and looks exactly like a noisy room.
     *
     * Said once and plainly, because it is the one condition here a wearer can
     * act on: a different engine, or somewhere they can type. Silence is the
     * response that leaves them with no move.
     */
    unmeasured: string;

    /**
     * What a host says when a demand went somewhere the wearer is not looking.
     *
     * Names the redirection rather than the content: the content already went,
     * and repeating it here would put on a display the thing the display could
     * not show.
     */
    elsewhere: string;
  }
}
