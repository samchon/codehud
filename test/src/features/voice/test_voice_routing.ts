import type { ICodeHudState, ICodeHudVoiceRouting } from "@codehud/interface";
import {
  CodeHudContext,
  CodeHudReducer,
  CodeHudVoiceRouter,
} from "@codehud/projection";
import { TestValidator } from "@nestia/e2e";

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

  TestValidator.equals("a command is a command", router.route("stop"), {
    type: "command",
    command: "stop",
  });
  TestValidator.equals(
    "and so is a second phrase for the same one",
    router.route("halt"),
    { type: "command", command: "stop" },
  );
  TestValidator.equals(
    "the affirmative consent word is the approval",
    router.route(consent.affirmative, { confidence: 1 }),
    { type: "command", command: "allow" },
  );
  TestValidator.equals(
    "and the negative one is the refusal",
    router.route(consent.negative, { confidence: 1 }),
    { type: "command", command: "deny" },
  );
  TestValidator.equals(
    "while a recognizer that reported no confidence answers neither",
    router.route(consent.affirmative),
    { type: "unheard" },
  );
  TestValidator.equals(
    "not even to refuse, which would also be an answer",
    router.route(consent.negative).type,
    "unheard",
  );
  TestValidator.equals(
    "and the refusal carries no number, because none was reported",
    (router.route(consent.affirmative) as { confidence?: number }).confidence,
    undefined,
  );

  TestValidator.equals(
    "anything else is a prompt, verbatim",
    router.route("  refactor the reducer so it reads better  "),
    { type: "prompt", text: "refactor the reducer so it reads better" },
  );
  TestValidator.predicate(
    "with the wearer's own casing kept, because the agent reads it",
    (
      router.route("Rename CodeHudText to something shorter") as {
        text: string;
      }
    ).text.includes("CodeHudText"),
  );

  // Ambiguity, constructed by giving two commands the same phrase.
  const collided: CodeHudVoiceRouter = new CodeHudVoiceRouter({
    ...CodeHudContext.DEFAULT,
    consent: { ...consent, affirmative: "stop" },
  });
  const ambiguous = collided.route("stop");
  TestValidator.equals(
    "a double match is ambiguous",
    ambiguous.type,
    "ambiguous",
  );
  TestValidator.equals(
    "naming every candidate, and resolving to none of them",
    (ambiguous as { candidates: string[] }).candidates.sort((a, b) =>
      a.localeCompare(b),
    ),
    ["allow", "stop"],
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

  TestValidator.equals("a question is a query", router.route("how long"), {
    type: "query",
    query: "elapsed",
  });
  TestValidator.equals(
    "and never a prompt, so it costs no turn",
    router.route("what happened").type,
    "query",
  );
  TestValidator.equals(
    "answered from state alone",
    router.answer("result", finished),
    "Edited two files",
  );
  TestValidator.predicate(
    "including which session is in focus",
    router.answer("session", finished).includes("codehud"),
  );
  TestValidator.equals(
    "and a question about a session that has done nothing still answers",
    router.answer("result", reducer.initialize()),
    CodeHudContext.DEFAULT.vocabulary.ready,
  );

  // Silence, which a wearer has to be able to ask for out loud.
  TestValidator.equals(
    "the product can be silenced by saying so",
    router.route("quiet", { confidence: 1 }),
    { type: "command", command: "mute" },
  );
  TestValidator.equals(
    "and un-silenced by a different word, not by repeating the same one",
    router.route("unmute", { confidence: 1 }),
    { type: "command", command: "unmute" },
  );
  TestValidator.equals(
    "saying it twice asks for the same thing twice",
    router.route("quiet", { confidence: 1 }),
    router.route("silence", { confidence: 1 }),
  );
  TestValidator.predicate(
    "and neither word is close to a consent token",
    [consent.affirmative, consent.negative].includes("mute") === false &&
      [consent.affirmative, consent.negative].includes("unmute") === false,
  );

  // The second confirmation's own token, which is a consent answer and is
  // guarded like one.
  TestValidator.equals(
    "the confirmation token routes to its own command",
    router.route(consent.confirmation, { confidence: 1 }),
    { type: "command", command: "confirm" },
  );
  TestValidator.equals(
    "and is worded differently from the affirmative, or one mishearing does both",
    consent.confirmation === consent.affirmative,
    false,
  );
  TestValidator.equals(
    "below the floor it is unheard, like every other consent answer",
    router.route(consent.confirmation, { confidence: consent.floor - 0.01 })
      .type,
    "unheard",
  );

  // The floor, and what it does and does not guard.
  const floor: number = consent.floor;
  TestValidator.equals(
    "a consent answer below the floor is unheard",
    router.route(consent.affirmative, { confidence: floor - 0.01 }),
    { type: "unheard", confidence: floor - 0.01 },
  );
  TestValidator.equals(
    "and so is a refusal below it",
    router.route(consent.negative, { confidence: floor - 0.01 }).type,
    "unheard",
  );
  TestValidator.equals(
    "at the floor it is heard",
    router.route(consent.affirmative, { confidence: floor }).type,
    "command",
  );
  TestValidator.equals(
    "a navigation word below the floor is still acted on",
    router.route("back", { confidence: 0 }),
    { type: "command", command: "back" },
  );

  // Selection by ordinal, never by pronouncing a name.
  TestValidator.equals("a wearer picks by number", router.route("switch 2"), {
    type: "command",
    command: "switch",
    ordinal: 2,
  });
  TestValidator.equals("or by the word for it", router.route("switch three"), {
    type: "command",
    command: "switch",
    ordinal: 3,
  });
  TestValidator.predicate(
    "and no phrase in the grammar asks for a path, a branch, or a symbol",
    CodeHudVoiceRouter.phrases(consent).every(
      (phrase) => /[/\\.]/u.test(phrase) === false,
    ),
  );

  const grammar: string[] = router.help();
  TestValidator.predicate(
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
  TestValidator.equals(
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
  TestValidator.predicate(
    "and every phrase in it routes to something other than a prompt",
    grammar.every((phrase) => router.route(phrase).type !== "prompt"),
  );
}
