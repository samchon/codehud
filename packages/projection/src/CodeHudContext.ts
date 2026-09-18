import type { ICodeHudContext } from "@codehud/interface";

/**
 * Defaults for the configuration the pure layers take.
 *
 * A namespace rather than a class because nothing here is a facade: there is no
 * collaborator to hold, no lifetime to manage, and no state between calls. It
 * builds a value and stops.
 *
 * The consent tokens below are placeholders in the honest sense. They are
 * ordinary English words chosen so the composer has something to render, not
 * words chosen for acoustic distance in the wearer's language, which is the
 * open question the consent requirement states and which no default can settle.
 *
 * @evidence requirements/voice-interaction/spoken-control.md#voice-consent-integrity Supplies starting values for the consent tokens and the floor, so that no consent word is a constant buried in a source file. It chooses nothing for acoustic distance and enforces nothing; both belong to the wearer's configuration and to the voice router.
 * @evidence specifications/voice-surface/utterance-routing.md#spec-voice-consent-integrity Supplies a default floor and a second confirmation worded differently from the affirmative, which is the one part of the rule a default can satisfy. The threshold comparison and the re-request are the router's.
 * @author Samchon
 */
export namespace CodeHudContext {
  /**
   * The configuration used when a caller states none.
   *
   * Frozen, because a shared default that one consumer can mutate is a
   * configuration bug that surfaces somewhere else entirely.
   */
  export const DEFAULT: ICodeHudContext = Object.freeze({
    history: 64,
    consent: Object.freeze({
      // A recognizer reporting lower than this has not produced an answer, and
      // the request stays pending rather than resolving toward either side.
      floor: 0.8,
      affirmative: "allow",
      negative: "deny",
      // Worded differently from the affirmative on purpose: repeating the first
      // token must not satisfy the second confirmation.
      confirmation: "confirm",
    }),
    vocabulary: Object.freeze({
      connecting: "Connecting",
      ready: "Ready",
      working: "Working",
      thinking: "Thinking",
      succeeded: "Done",
      stopped: "Stopped",
      failed: "Failed",
      say: "Say",
      or: "or",
      within: "of",
      interrupt: "Say stop",
      review: "Say back, forward, or latest",
      ambiguous: "That could be",
      unheard: "Not heard clearly, still waiting",
      unoffered: "Not an answer this one offers",
      dropped: "Connection lost, reaching for the bridge",
      unreachable: "The bridge is not answering",
      unmeasured:
        "This recognizer cannot report confidence; approval by voice is unavailable",
      nosuch: "No session by that number",
      listing: "Sessions",
      showing: "showing",
      again: "Confirm:",
      muted: "Quiet. Nothing will wake you",
      unmuted: "Listening again",
      elsewhere: "Sent to the phone instead",
    }),
  });

  /**
   * Builds a configuration from the defaults and the parts a caller states.
   *
   * Shallow by section rather than deep, so stating one word of the vocabulary
   * does not silently drop the rest of it.
   */
  export const create = (
    props: CodeHudContext.IPartial = {},
  ): ICodeHudContext => ({
    history: props.history ?? DEFAULT.history,
    consent: { ...DEFAULT.consent, ...props.consent },
    vocabulary: { ...DEFAULT.vocabulary, ...props.vocabulary },
  });

  /**
   * A configuration stated in part.
   *
   * Each section may be given whole or in pieces; what is left out comes from
   * {@link DEFAULT}.
   */
  export interface IPartial {
    /** Entries the display retains for review. */
    history?: number;

    /** How a spoken approval answer is admitted or refused. */
    consent?: Partial<ICodeHudContext["consent"]>;

    /** What the display calls things it has to name itself. */
    vocabulary?: Partial<ICodeHudContext.IVocabulary>;
  }
}
