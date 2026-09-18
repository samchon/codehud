import type {
  ICodeHudContext,
  ICodeHudState,
  ICodeHudVoiceRouting,
} from "@codehud/interface";

import { CodeHudText } from "./CodeHudText";

/**
 * Decides what a spoken utterance is, without asking anything.
 *
 * A class because it reads a configuration, and pure in every other sense: the
 * same words under the same state always route the same way. No model runs, no
 * request leaves the device, and nothing here depends on what the agent has
 * been doing. That is the point rather than an optimization — a routing rule a
 * wearer cannot predict is one they cannot rely on, and one that needed the
 * network would stop working exactly when the bridge did.
 *
 * The grammar is a table, finite and enumerable, and stating it in full is what
 * the help command does. Adding a command is a change to this file, never a
 * runtime behavior.
 *
 * @evidence requirements/voice-interaction/spoken-control.md#voice-command-versus-prompt Decides command from prompt by a stated rule rather than by interpretation, so a wearer can predict which one their words will be.
 * @evidence requirements/voice-interaction/spoken-control.md#voice-local-query Answers from the state the client already holds the questions that need no agent, no network, and no money.
 * @evidence specifications/voice-surface/utterance-routing.md#spec-voice-deterministic-routing Implements the fixed grammar, the local and deterministic match, and the refusal to resolve an ambiguous utterance by guessing.
 * @evidence specifications/voice-surface/utterance-routing.md#spec-voice-local-query Implements the locally answerable subset, resolved entirely from reducer state.
 * @author Samchon
 */
export class CodeHudVoiceRouter {
  /** Recognitions seen, and how many of them carried a confidence. */
  private heard: number = 0;
  private measured: number = 0;

  /** Constructs a router bound to one configuration. */
  public constructor(private readonly context: ICodeHudContext) {}

  /**
   * Routes one finalized utterance.
   *
   * A recognition too uncertain to act on is not routed at all when it would
   * answer an approval. Everything else is matched against the grammar, and
   * what does not match is a prompt, carried verbatim: locating the subject of
   * an instruction is the agent's work, not the recognizer's.
   */
  public route(
    utterance: string,
    props: CodeHudVoiceRouter.IHeard = {},
  ): ICodeHudVoiceRouting {
    const said: string = utterance.trim().replace(/\s+/gu, " ").toLowerCase();
    if (said.length === 0) return { type: "prompt", text: "" };

    const ordinal: number | undefined = CodeHudVoiceRouter.ordinal(said);

    // A question the client answers itself, checked before the commands so a
    // phrase can never be both.
    const asked: ICodeHudVoiceRouting.IQuery.Kind | undefined =
      CodeHudVoiceRouter.asks(said);
    if (asked !== undefined) return { type: "query", query: asked };

    const matched: ICodeHudVoiceRouting.ICommand.Kind[] =
      CodeHudVoiceRouter.matches(said, this.context.consent);

    if (matched.length > 1) return { type: "ambiguous", candidates: matched };

    const only: ICodeHudVoiceRouting.ICommand.Kind | undefined = matched[0];
    if (only === undefined) return { type: "prompt", text: utterance.trim() };

    // The floor guards consent and only consent. An approval answered by voice
    // is one recognition error away from authorizing something destructive, and
    // that error cannot be undone; a misheard "back" costs a glance.
    //
    // A result carrying no confidence at all is refused for the same reason
    // rather than admitted for want of a number. The contract states it of the
    // field itself: a recognizer that reports nothing here cannot be used for
    // consent. Admitting it would put every approval on a device whose
    // recognizer is silent about certainty one mishearing from authorizing a
    // deletion, and the floor would guard exactly the devices that already
    // measure themselves.
    // Counted, because one recognition says nothing about the recognizer and
    // a run of them says everything. The platform is explicit that the number
    // is optional — Android's own documentation of `CONFIDENCE_SCORES` ends
    // "This value is optional and might not be provided" — so a device can be
    // handed an engine that never reports it, and on that device every consent
    // answer is refused forever. Refused correctly, and indistinguishably from
    // a noisy room, which is the part a wearer cannot act on.
    this.heard += 1;
    if (props.confidence !== undefined) this.measured += 1;

    if (
      (only === "allow" || only === "deny" || only === "confirm") &&
      (props.confidence === undefined ||
        props.confidence < this.context.consent.floor)
    )
      return {
        type: "unheard",
        ...(props.confidence === undefined
          ? {}
          : { confidence: props.confidence }),
      };

    return {
      type: "command",
      command: only,
      ...(ordinal === undefined ? {} : { ordinal }),
    };
  }

  /**
   * Answers a question from the state this device already holds.
   *
   * No agent turn, no round trip, no money, and it works while the bridge is
   * unreachable. Routing one of these to the agent is a defect rather than a
   * slower path to the same answer.
   */
  public answer(
    query: ICodeHudVoiceRouting.IQuery.Kind,
    state: ICodeHudState,
    now: number = Date.now(),
  ): string {
    const words: ICodeHudContext.IVocabulary = this.context.vocabulary;
    switch (query) {
      case "activity":
        return state.activity === "thinking"
          ? words.thinking
          : state.activity === "working"
            ? words.working
            : state.activity === "done"
              ? (state.last?.summary ?? words.ready)
              : words.ready;
      case "elapsed":
        return state.last === undefined
          ? CodeHudText.elapsed(0)
          : CodeHudText.elapsed(state.last.elapsed);
      case "session":
        return state.session === undefined
          ? words.ready
          : CodeHudText.path(state.session.directory, 64);
      case "result":
        return state.last === undefined ? words.ready : state.last.summary;
      case "pending":
        return state.pending === undefined ? words.ready : state.pending.title;
    }
    void now;
  }

  /**
   * Whether this device's recognizer appears unable to say how sure it is.
   *
   * True once enough recognitions have arrived without a confidence between
   * them. One missing number is an utterance; a run of them is the engine, and
   * the difference matters because only the second is something a wearer can
   * do anything about — change the engine, or work somewhere they can type.
   *
   * A single confidence ever seen settles it the other way and permanently:
   * the question is whether the recognizer *can* report, not whether it did
   * this time.
   *
   * Reported rather than acted on. What a device does about it is the device's,
   * and what the product should degrade to is a specification question that is
   * not answered by noticing.
   */
  public get confidenceless(): boolean {
    return this.measured === 0 && this.heard >= CodeHudVoiceRouter.SAMPLE;
  }

  /** Every phrase a wearer may say, for the command that states the grammar. */
  public help(): string[] {
    return CodeHudVoiceRouter.phrases(this.context.consent);
  }
}
export namespace CodeHudVoiceRouter {
  /**
   * How many recognitions establish that an engine does not report confidence.
   *
   * Three, and the number is a judgement rather than a measurement. One is an
   * utterance and says nothing; two could still be coincidence on a platform
   * where the field is per-result; three is a run. Erring high costs a wearer
   * two more refusals before being told something useful, and erring low tells
   * them their engine is broken when it was a bad second.
   */
  export const SAMPLE: number = 3;

  /** What the recognizer reported about an utterance. */
  export interface IHeard {
    /**
     * How sure the recognizer was, from zero to one.
     *
     * Absent means the recognizer does not report one, which the specification
     * treats as unusable for consent: a device that cannot say how sure it is
     * cannot be trusted to answer an approval. Absent therefore does not clear
     * the floor by default; it simply carries no claim, and the caller supplies
     * a number when it has one.
     */
    confidence?: number;
  }

  /**
   * The grammar, in full.
   *
   * A table rather than a parser. Every phrase is short, distinct from the
   * others by more than one sound, and none of them takes a filesystem path, a
   * branch, or a symbol as something the wearer has to pronounce exactly. Where
   * an operation needs one of those, the wearer picks by ordinal instead.
   *
   * The consent words are not here: they come from the configuration, because
   * they have to be chosen for acoustic distance in the wearer's language and a
   * table baked into a source file cannot be.
   */
  export const GRAMMAR: Readonly<
    Record<ICodeHudVoiceRouting.ICommand.Kind, readonly string[]>
  > = Object.freeze({
    allow: Object.freeze([]),
    deny: Object.freeze([]),
    confirm: Object.freeze([]),
    stop: Object.freeze(["stop", "halt", "interrupt"]),
    back: Object.freeze(["back", "previous"]),
    forward: Object.freeze(["forward", "next"]),
    latest: Object.freeze(["latest", "newest"]),
    repeat: Object.freeze(["repeat", "again", "say again"]),
    sessions: Object.freeze(["sessions", "list sessions"]),
    switch: Object.freeze(["switch", "switch to"]),
    help: Object.freeze(["help", "what can i say"]),
    // Chosen for distance from the consent tokens above all: the obvious word
    // for leaving quiet mode is *aloud*, and a recognizer that confused it with
    // *allow* would approve something while the wearer was asking to be spoken
    // to again.
    mute: Object.freeze(["mute", "quiet", "silence"]),
    unmute: Object.freeze(["unmute", "quiet off"]),
  });

  /**
   * Phrases that ask a question the client can answer by itself.
   *
   * Separate from {@link GRAMMAR} because these produce a query rather than a
   * command, and the union distinguishes the two so a caller cannot send one
   * where the other belongs.
   */
  export const QUESTIONS: Readonly<
    Record<ICodeHudVoiceRouting.IQuery.Kind, readonly string[]>
  > = Object.freeze({
    activity: Object.freeze(["what is it doing", "status"]),
    elapsed: Object.freeze(["how long", "elapsed"]),
    session: Object.freeze(["which session", "where am i"]),
    result: Object.freeze(["what happened", "last result"]),
    pending: Object.freeze(["what is it asking", "what is pending"]),
  });

  /**
   * Every command an utterance matches.
   *
   * More than one is an ambiguity to report rather than a tie to break. A
   * wearer who said something that could mean two things has not chosen, and
   * choosing for them is how the wrong one gets done.
   */
  export const matches = (
    said: string,
    consent: ICodeHudVoiceRouting.IConsent,
  ): ICodeHudVoiceRouting.ICommand.Kind[] => {
    // The selection a wearer spoke comes off before the phrase is matched, in
    // both spellings: "switch 2" and "switch three" are the same command.
    const bare: string = said.replace(/^(?:number\s+)?/u, "").trim();
    const head: string = bare
      .replace(/\s+\d+$/u, "")
      .replace(/\s+(?:one|two|three|four|five|six|seven|eight|nine)$/u, "")
      .trim();
    const found: ICodeHudVoiceRouting.ICommand.Kind[] = [];

    if (head === consent.affirmative.toLowerCase()) found.push("allow");
    if (head === consent.negative.toLowerCase()) found.push("deny");
    if (head === consent.confirmation.toLowerCase()) found.push("confirm");

    for (const [command, phrases] of Object.entries(GRAMMAR))
      if (phrases.includes(head) === true)
        found.push(command as ICodeHudVoiceRouting.ICommand.Kind);
    return found;
  };

  /**
   * The question an utterance asks, if it asks one this device can answer.
   *
   * Checked before the commands, so a phrase belongs to exactly one of the two
   * and a wearer never has to know which list it is on.
   */
  export const asks = (
    said: string,
  ): ICodeHudVoiceRouting.IQuery.Kind | undefined => {
    const head: string = said.replace(/[?.!]+$/u, "").trim();
    for (const [query, phrases] of Object.entries(QUESTIONS))
      if (phrases.includes(head) === true)
        return query as ICodeHudVoiceRouting.IQuery.Kind;
    return undefined;
  };

  /** The ordinal a wearer spoke, if they spoke one. */
  export const ordinal = (said: string): number | undefined => {
    const trailing: RegExpMatchArray | null = said.match(/\s(\d+)$/u);
    if (trailing !== null) return Number.parseInt(trailing[1] ?? "", 10);
    const words: readonly string[] = [
      "zero",
      "one",
      "two",
      "three",
      "four",
      "five",
      "six",
      "seven",
      "eight",
      "nine",
    ];
    for (let i: number = 1; i < words.length; ++i)
      if (said.endsWith(` ${words[i]!}`) === true) return i;
    return undefined;
  };

  /** Everything a wearer may say, for the command that states the grammar. */
  export const phrases = (consent: ICodeHudVoiceRouting.IConsent): string[] => [
    consent.affirmative,
    consent.negative,
    consent.confirmation,
    ...Object.values(GRAMMAR).flatMap((list) => [...list]),
    ...Object.values(QUESTIONS).flatMap((list) => [...list]),
  ];
}
