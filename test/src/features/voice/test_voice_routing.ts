import type { ICodeHudState, ICodeHudVoiceRouting } from "@codehud/interface";
import {
  CodeHudContext,
  CodeHudReducer,
  CodeHudVoiceRouter,
} from "@codehud/projection";

import { Assert } from "../internal/assert";
import { Stream } from "../internal/stream";

/**
 * What a wearer says becomes exactly one thing, by a rule they can predict.
 *
 * Speech is the only instruction channel this product has, so the routing rule
 * is part of the interface rather than an implementation detail. A wearer has
 * to be able to know, before speaking, whether their words will steer the agent
 * or be handed to it. That is why the grammar is a table and the match is
 * literal: a rule that interprets is a rule nobody can rely on.
 *
 * The rule that matters most is the one about not guessing. An utterance that
 * matches two commands is reported as ambiguous rather than resolved toward
 * whichever happened to be checked first, because a wearer who said something
 * that could mean two things has not chosen, and choosing for them is how the
 * wrong one gets done.
 *
 * Scenarios:
 *
 * 1. A command phrase routes to that command, and nothing else does.
 * 2. Anything the grammar does not contain is a prompt, carried verbatim and
 *    unmodified, because locating the subject of an instruction is the agent's
 *    work rather than the recognizer's.
 * 3. An utterance matching two commands is reported ambiguous, with both
 *    candidates named, and resolves to neither.
 * 4. The locally answerable questions are answered from state alone: no agent,
 *    no network, no money. Routing one to the agent would be a defect.
 * 5. A consent answer below the confidence floor is unheard: not an approval,
 *    not a refusal, and not a prompt either. The approval stays pending.
 * 6. The floor guards consent and nothing else. A misheard navigation word
 *    costs a glance; a misheard approval cannot be undone, and only the second
 *    justifies refusing to act.
 * 7. A consent answer carrying no confidence at all is unheard for the same
 *    reason as one below the floor. The contract says it of the field: a
 *    recognizer that reports nothing there cannot be used for consent, so the
 *    absence of a number is not a reason to admit the answer.
 * 8. Selection is by ordinal, never by pronouncing an identifier.
 * 9. The grammar states itself in full, which is what the help command is for.
 */
export async function test_voice_routing(): Promise<void> {
  const router: CodeHudVoiceRouter = new CodeHudVoiceRouter(
    CodeHudContext.DEFAULT,
  );
  const consent = CodeHudContext.DEFAULT.consent;

  Assert.equals("a command is a command", router.route("stop"), {
    type: "command",
    command: "stop",
  });
  Assert.equals(
    "and so is a second phrase for the same one",
    router.route("halt"),
    { type: "command", command: "stop" },
  );
  Assert.equals(
    "the affirmative consent word is the approval",
    router.route(consent.affirmative, { confidence: 1 }),
    { type: "command", command: "allow" },
  );
  Assert.equals(
    "and the negative one is the refusal",
    router.route(consent.negative, { confidence: 1 }),
    { type: "command", command: "deny" },
  );
  Assert.equals(
    "while a recognizer that reported no confidence answers neither",
    router.route(consent.affirmative),
    { type: "unheard" },
  );
  Assert.equals(
    "not even to refuse, which would also be an answer",
    router.route(consent.negative).type,
    "unheard",
  );
  Assert.equals(
    "and the refusal carries no number, because none was reported",
    (router.route(consent.affirmative) as { confidence?: number }).confidence,
    undefined,
  );

  Assert.equals(
    "anything else is a prompt, verbatim",
    router.route("  refactor the reducer so it reads better  "),
    { type: "prompt", text: "refactor the reducer so it reads better" },
  );
  Assert.predicate(
    "with the wearer's own casing kept, because the agent reads it",
    (
      router.route("Rename CodeHudText to something shorter") as {
        text: string;
      }
    ).text.includes("CodeHudText"),
  );

  // Ambiguity: an utterance matching two commands is reported, never guessed.
  //
  // Driven against `matches` rather than through a router, because a router
  // whose consent words collide with the grammar can no longer be built: that
  // configuration is refused where it is stated. The rule being pinned here is
  // the routing one, and it lives at this level. What keeps a *configuration*
  // from ever reaching it is the constructor, pinned below; what would let the
  // grammar reach it is a phrase appearing under two commands, pinned after
  // that.
  const doubled: ICodeHudVoiceRouting.ICommand.Kind[] =
    CodeHudVoiceRouter.matches("stop", { ...consent, affirmative: "stop" });
  Assert.equals(
    "an utterance matching two commands names both, and resolves to neither",
    doubled.sort((a, b) => a.localeCompare(b)),
    ["allow", "stop"],
  );

  // The grammar itself, which is the one thing that could put a wearer there
  // without anyone misconfiguring anything.
  const phrases: string[] = Object.values(CodeHudVoiceRouter.GRAMMAR).flatMap(
    (list) => [...list],
  );
  Assert.equals(
    "no phrase is how a wearer says two different commands",
    phrases.filter((phrase, index) => phrases.indexOf(phrase) !== index),
    [],
  );

  // A consent configuration that cannot guard is refused where it is stated.
  //
  // The floor is the one that fails quietly: at zero it admits every
  // recognition the engine produced, however unsure, and nothing downstream
  // says the guard is off. The others are loud in their own way — two equal
  // words make either ambiguous, and a word that is already a command shadows
  // it, which for "stop" costs a wearer their brake — but loud once a wearer
  // is already walking is not the same as refused at startup.
  for (const [reason, consented] of [
    ["a floor of zero", { floor: 0 }],
    ["a negative floor", { floor: -1 }],
    ["a floor above one", { floor: 1.5 }],
    ["a floor that is not a number", { floor: Number.NaN }],
    ["an affirmative that is already a command", { affirmative: "stop" }],
    ["two consent words that are the same", { negative: "allow" }],
    ["an empty affirmative", { affirmative: "  " }],
  ] as const) {
    const broken: ICodeHudVoiceRouting.IConsent = { ...consent, ...consented };
    Assert.predicate(
      `${reason} is named as unusable`,
      (CodeHudVoiceRouter.unusable(broken) ?? "").length > 0,
    );
    await Assert.throws(`and refuses to build a router: ${reason}`, () => {
      const _ = new CodeHudVoiceRouter({
        ...CodeHudContext.DEFAULT,
        consent: broken,
      });
      void _;
    });
  }
  Assert.equals(
    "while the configuration this product ships with is usable",
    CodeHudVoiceRouter.unusable(CodeHudContext.DEFAULT.consent),
    undefined,
  );

  // The questions this device answers by itself.
  const reducer: CodeHudReducer = new CodeHudReducer(CodeHudContext.DEFAULT);
  Stream.reset();
  const opened: ICodeHudState = reducer.reduce(
    reducer.initialize(),
    Stream.session("/home/dev/projects/codehud"),
  );
  const finished: ICodeHudState = reducer.reduce(
    opened,
    Stream.result("Edited two files", "success"),
  );

  Assert.equals("a question is a query", router.route("how long"), {
    type: "query",
    query: "elapsed",
  });

  // A recognizer that never says how sure it is.
  //
  // The platform makes the number optional — Android's own documentation of
  // `CONFIDENCE_SCORES` ends "This value is optional and might not be
  // provided" — so a device can be handed an engine that never reports one.
  // Consent is then refused on every utterance, correctly, and identically to
  // a noisy room. One missing number is an utterance and says nothing about
  // the engine; a run of them is the engine, and only the second is something
  // a wearer can act on.
  const deaf: CodeHudVoiceRouter = new CodeHudVoiceRouter(
    CodeHudContext.DEFAULT,
  );
  Assert.equals(
    "a router that has heard nothing claims nothing",
    deaf.confidenceless,
    false,
  );
  for (let i: number = 0; i < CodeHudVoiceRouter.SAMPLE - 1; ++i)
    deaf.route("allow");
  Assert.equals(
    "and one short of the sample it still claims nothing",
    deaf.confidenceless,
    false,
  );
  deaf.route("allow");
  Assert.equals(
    "at the sample it says the recognizer cannot measure itself",
    deaf.confidenceless,
    true,
  );
  Assert.equals(
    "while every one of those answers was refused, which is the point",
    deaf.route("allow").type,
    "unheard",
  );

  // Whether the recognizer reports confidence is a fact about the recognizer,
  // not about what was said into it, so dictation counts. A wearer mostly
  // dictates; counting only the words that reached the consent check would make
  // the commonest session establish nothing at all.
  const dictating: CodeHudVoiceRouter = new CodeHudVoiceRouter(
    CodeHudContext.DEFAULT,
  );
  for (let i: number = 0; i < CodeHudVoiceRouter.SAMPLE; ++i)
    dictating.route("have a look at the failing test");
  Assert.equals(
    "prompts count, because the recognizer is the same recognizer",
    dictating.confidenceless,
    true,
  );

  const heard: CodeHudVoiceRouter = new CodeHudVoiceRouter(
    CodeHudContext.DEFAULT,
  );
  for (let i: number = 0; i < CodeHudVoiceRouter.SAMPLE * 2; ++i)
    heard.route("allow");
  heard.route("allow", { confidence: 0.2 });
  Assert.equals(
    "a single confidence ever reported settles it the other way, permanently",
    heard.confidenceless,
    false,
  );
  Assert.equals(
    "even though that one was below the floor and refused too",
    heard.route("allow", { confidence: 0.2 }).type,
    "unheard",
  );

  // Every question the vocabulary declares is reachable from a phrase and is
  // answered. Nothing pinned this, and the consequence was a member called
  // `policy` whose phrases were *what is it asking* and *what is pending* and
  // whose answer was the pending request's title: a closed vocabulary carrying
  // a name for something it does not do, for as long as nobody said the name
  // and the answer out loud in the same place.
  const questions: ICodeHudVoiceRouting.IQuery.Kind[] = [
    "activity",
    "elapsed",
    "session",
    "result",
    "pending",
  ];
  for (const question of questions) {
    const phrases: readonly string[] =
      CodeHudVoiceRouter.QUESTIONS[question] ?? [];
    Assert.predicate(
      `${question} is something a wearer can actually say`,
      phrases.length > 0,
    );
    for (const phrase of phrases)
      Assert.equals(
        `"${phrase}" asks about ${question}`,
        router.route(phrase),
        { type: "query", query: question },
      );
    Assert.predicate(
      `and ${question} answers rather than returning nothing`,
      router.answer(question, finished).length > 0,
    );
  }
  Assert.equals(
    "and never a prompt, so it costs no turn",
    router.route("what happened").type,
    "query",
  );
  Assert.equals(
    "answered from state alone",
    router.answer("result", finished),
    "Edited two files",
  );
  Assert.predicate(
    "including which session is in focus",
    router.answer("session", finished).includes("codehud"),
  );
  Assert.equals(
    "and a question about a session that has done nothing still answers",
    router.answer("result", reducer.initialize()),
    CodeHudContext.DEFAULT.vocabulary.ready,
  );

  // Silence, which a wearer has to be able to ask for out loud.
  Assert.equals(
    "the product can be silenced by saying so",
    router.route("quiet", { confidence: 1 }),
    { type: "command", command: "mute" },
  );
  Assert.equals(
    "and un-silenced by a different word, not by repeating the same one",
    router.route("unmute", { confidence: 1 }),
    { type: "command", command: "unmute" },
  );
  Assert.equals(
    "saying it twice asks for the same thing twice",
    router.route("quiet", { confidence: 1 }),
    router.route("silence", { confidence: 1 }),
  );
  Assert.predicate(
    "and neither word is close to a consent token",
    [consent.affirmative, consent.negative].includes("mute") === false &&
      [consent.affirmative, consent.negative].includes("unmute") === false,
  );

  // The second confirmation's own token, which is a consent answer and is
  // guarded like one.
  Assert.equals(
    "the confirmation token routes to its own command",
    router.route(consent.confirmation, { confidence: 1 }),
    { type: "command", command: "confirm" },
  );
  Assert.equals(
    "and is worded differently from the affirmative, or one mishearing does both",
    consent.confirmation === consent.affirmative,
    false,
  );
  Assert.equals(
    "below the floor it is unheard, like every other consent answer",
    router.route(consent.confirmation, { confidence: consent.floor - 0.01 })
      .type,
    "unheard",
  );

  // The floor, and what it does and does not guard.
  const floor: number = consent.floor;
  Assert.equals(
    "a consent answer below the floor is unheard",
    router.route(consent.affirmative, { confidence: floor - 0.01 }),
    { type: "unheard", confidence: floor - 0.01 },
  );
  Assert.equals(
    "and so is a refusal below it",
    router.route(consent.negative, { confidence: floor - 0.01 }).type,
    "unheard",
  );
  Assert.equals(
    "at the floor it is heard",
    router.route(consent.affirmative, { confidence: floor }).type,
    "command",
  );
  Assert.equals(
    "a navigation word below the floor is still acted on",
    router.route("back", { confidence: 0 }),
    { type: "command", command: "back" },
  );

  // Selection by ordinal, never by pronouncing a name.
  Assert.equals("a wearer picks by number", router.route("switch 2"), {
    type: "command",
    command: "switch",
    ordinal: 2,
  });
  Assert.equals("or by the word for it", router.route("switch three"), {
    type: "command",
    command: "switch",
    ordinal: 3,
  });
  Assert.predicate(
    "and no phrase in the grammar asks for a path, a branch, or a symbol",
    CodeHudVoiceRouter.phrases(consent).every(
      (phrase) => /[/\\.]/u.test(phrase) === false,
    ),
  );

  const grammar: string[] = router.help();
  Assert.predicate(
    "the grammar states itself in full",
    grammar.includes("stop") &&
      grammar.includes("how long") &&
      grammar.includes(consent.affirmative),
  );
  // Derived from the closed union rather than listed here, so a command added
  // to the vocabulary without a phrase a wearer could say fails this rather
  // than shipping unreachable.
  const kinds: ICodeHudVoiceRouting.ICommand.Kind[] = [
    "allow",
    "deny",
    "stop",
    "back",
    "forward",
    "latest",
    "repeat",
    "sessions",
    "switch",
    "help",
    "mute",
    "unmute",
    "confirm",
  ];
  Assert.equals(
    "every command in the vocabulary has a phrase that reaches it",
    kinds.filter(
      (kind) =>
        grammar.some((phrase) => {
          const routed = router.route(phrase, { confidence: 1 });
          return routed.type === "command" && routed.command === kind;
        }) === false,
    ),
    [],
  );
  Assert.predicate(
    "and every phrase in it routes to something other than a prompt",
    grammar.every((phrase) => router.route(phrase).type !== "prompt"),
  );
}
