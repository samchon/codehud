/**
 * Where a finalized utterance goes and what it is allowed to authorize.
 *
 * Every utterance takes exactly one of three routes, and the route is decided
 * locally before any network call. Classifying utterances with a language model
 * would add a round trip and a bill to operations that should be instant and
 * free, and would make the same words sometimes operate the client and
 * sometimes reach the agent.
 *
 * @evidence requirements/voice-interaction/spoken-control.md#voice-command-versus-prompt Separates the fixed command vocabulary from free prompts by a stated rule rather than by inference.
 * @evidence specifications/voice-surface/utterance-routing.md#spec-voice-deterministic-routing Types the routing outcome the specification requires to be computed deterministically and without a model call.
 * @author Samchon
 */
export type ICodeHudVoiceRouting =
  | ICodeHudVoiceRouting.ICommand
  | ICodeHudVoiceRouting.IQuery
  | ICodeHudVoiceRouting.IPrompt
  | ICodeHudVoiceRouting.IAmbiguous
  | ICodeHudVoiceRouting.IUnheard;
export namespace ICodeHudVoiceRouting {
  /**
   * The utterance operated the client rather than the agent.
   *
   * Session switching, review navigation, interruption, and approval answers
   * live here. The vocabulary is finite and enumerable, and the client states
   * it in full when the wearer asks what they can say.
   */
  export interface ICommand {
    /** Discriminant of this routing outcome. */
    type: "command";

    /** Which command the utterance matched. */
    command: ICommand.Kind;

    /**
     * Ordinal the wearer named, when the command takes one.
     *
     * The only parameter shape a command accepts, because a wearer must never
     * be required to pronounce a path, a branch, a commit, or a symbol. An
     * operation needing an exact string offers candidates and takes the number
     * of one.
     */
    ordinal?: number;
  }
  export namespace ICommand {
    /**
     * The closed command vocabulary.
     *
     * Small enough for a wearer to hold in their head. Adding a member is a
     * change to the specification, not a runtime behavior.
     *
     * Silencing is two members rather than one toggle. A toggle asks a wearer
     * to know which state they are in, and the display that would tell them is
     * the one quiet mode has stopped waking; the failure it produces is a
     * product speaking up in a meeting because the wearer silenced it twice.
     */
    export type Kind =
      | "allow"
      | "deny"
      | "stop"
      | "back"
      | "forward"
      | "latest"
      | "repeat"
      | "sessions"
      | "switch"
      | "help"
      | "mute"
      | "unmute"
      | "confirm";
  }

  /**
   * The utterance asked something the client can answer from what it holds.
   *
   * What the agent is doing, how long the turn has run, which session is in
   * focus, what the last result was. Answering these costs no agent turn, no
   * network round trip, and no money, and they are answerable while the bridge
   * is unreachable.
   *
   * @evidence requirements/voice-interaction/spoken-control.md#voice-local-query Keeps questions about the product from being sent to the agent as turns.
   * @evidence specifications/voice-surface/utterance-routing.md#spec-voice-local-query Types the locally resolved subset of the command grammar.
   */
  export interface IQuery {
    /** Discriminant of this routing outcome. */
    type: "query";

    /** Which locally answerable question the utterance matched. */
    query: IQuery.Kind;
  }
  export namespace IQuery {
    /**
     * Questions resolved entirely from reducer state.
     *
     * Routing any of these to the agent is a defect rather than a slow path.
     *
     * `pending` was called `policy` and answered with the title of the request
     * in front of the wearer, which is not the policy and never was. Its two
     * phrases — *what is it asking*, *what is pending* — always described the
     * member it is now named for. A closed vocabulary with a member named for
     * something it does not do is worse than a shorter one.
     *
     * There is no question here that reports the policy in force, and a wearer
     * who cannot see it cannot rely on it. Answering that one needs the policy
     * to reach the fold, which it does not today.
     */
    export type Kind =
      "activity" | "elapsed" | "session" | "result" | "pending";
  }

  /**
   * The utterance is content for the agent.
   *
   * Carried verbatim. Locating the subject of an instruction is the agent's
   * work, not the recognizer's, so a wearer states intent and never spells an
   * identifier.
   *
   * @evidence requirements/voice-interaction/spoken-control.md#voice-no-spelling Carries intent verbatim so no contract requires the wearer to produce an exact identifier.
   * @evidence specifications/voice-surface/utterance-routing.md#spec-voice-no-identifier-dictation Types the prompt route, which takes no exact-string parameter at all.
   */
  export interface IPrompt {
    /** Discriminant of this routing outcome. */
    type: "prompt";

    /** The finalized utterance, unchanged. */
    text: string;
  }

  /**
   * The utterance matched more than one command.
   *
   * Reported rather than resolved by guessing. The client names the candidates
   * and asks for one of them, because picking the most likely match is how a
   * wearer discovers they authorized something else.
   */
  export interface IAmbiguous {
    /** Discriminant of this routing outcome. */
    type: "ambiguous";

    /** The commands the utterance matched. */
    candidates: ICommand.Kind[];
  }

  /**
   * Nothing was heard clearly enough to act on.
   *
   * Distinct from every other member, and distinct from silence. A consent
   * answer recognized below the stated floor is neither an approval nor a
   * refusal: the request stays pending and the system asks again. Routing it as
   * a prompt would send noise to the agent, and resolving it either way would
   * be the system answering on the wearer's behalf.
   *
   * It exists because the union could not express this and the specification
   * requires it. An answer that cannot be represented gets represented as
   * something else, and here the something else would have been irreversible.
   */
  export interface IUnheard {
    /** Discriminator. */
    type: "unheard";

    /**
     * What the recognizer reported, for a device that wants to say why.
     *
     * Absent when it reported nothing, which is itself a reason to refuse the
     * answer rather than a missing detail: a recognizer that cannot say how
     * sure it is cannot be used for consent, so there is no number to give.
     */
    confidence?: number;
  }

  /**
   * How a consent answer is admitted or refused.
   *
   * An approval answered by voice is one recognition error away from
   * authorizing something destructive, which is the highest-severity failure in
   * the product. Admission is therefore a stated threshold rather than a
   * best-effort match.
   *
   * @evidence requirements/voice-interaction/spoken-control.md#voice-consent-integrity Makes a low-confidence consent recognition equivalent to no answer, and requires a differently worded second confirmation.
   * @evidence specifications/voice-surface/utterance-routing.md#spec-voice-consent-integrity Types the confidence floor and the second-confirmation requirement the specification fixes.
   */
  export interface IConsent {
    /**
     * Lowest recognizer confidence an answer may carry, from zero to one.
     *
     * Below it the request stays pending and the client re-requests. It is
     * never resolved toward either answer, and silence is never an answer.
     */
    floor: number;

    /**
     * The affirmative token, chosen for acoustic distance.
     *
     * Distant from the negative and from ordinary conversational speech, and
     * not a general-purpose word that could appear inside a prompt.
     */
    affirmative: string;

    /** The negative token, under the same constraint. */
    negative: string;

    /**
     * The second confirmation a destructive action requires.
     *
     * Worded differently from {@link affirmative}, so one misrecognition cannot
     * satisfy both. A repetition of the first token does not satisfy it.
     */
    confirmation: string;
  }
}
