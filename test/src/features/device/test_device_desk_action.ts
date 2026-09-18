import { CodeHudAgentPolicy } from "@codehud/agent";
import type {
  ICodeHudAgentAdapter,
  ICodeHudState,
  ICodeHudVoiceRouting,
} from "@codehud/interface";
import { CodeHudDeskAction, CodeHudDeskCommand } from "@codehud/simulator";
import { TestValidator } from "@nestia/e2e";

import { Stream } from "../internal/stream";

/**
 * What a routed utterance does, decided once and in one place.
 *
 * The router settles what a wearer said; this settles what that does to the
 * session in front of them. Separating the two is what keeps a host from
 * reinterpreting an utterance the router already decided, which is the shape
 * that produces a word meaning one thing on the glasses and another at a desk.
 *
 * The rule that carries the most weight is the one about answers. An approval
 * is answered with an option *the harness offered*, found by its declared
 * affirmative property rather than by matching a label: the two harness
 * families spell their answers differently — `accept` against one, `approved`
 * against the other, and neither against a permissions request — and the wearer
 * said none of those spellings. A host that matched labels would answer one
 * harness and silently fail against the other.
 *
 * Scenarios:
 *
 * 1. Free words become a prompt, carried unchanged; an empty one does nothing.
 * 2. A locally answerable question becomes an answer rather than a turn.
 * 3. An approval answer names the option the harness offered, by its own
 *    identifier, chosen by the affirmative property.
 * 4. The same words with nothing pending do nothing at all. A wearer who said
 *    *allow* into a session that is not asking has not written a prompt.
 * 5. A request offering no answer of the kind the wearer gave is reported
 *    rather than answered with something else. A Codex permissions request is
 *    the live case: it offers only a refusal.
 * 6. A persisting option is never the one an answer picks, because a consent
 *    whose scope a display cannot state must not be the easiest thing to say.
 * 7. Navigation, interruption, repetition, help, silence, and session
 *    selection each map to one
 *    effect. Silence carries the state the wearer named rather than a toggle:
 *    saying the word for quiet twice must not be the opposite of saying it
 *    once, on a surface where the display that would show the state is the one
 *    quiet mode stopped waking.
 * 8. Ambiguity and a recognition below the floor are reported, never resolved.
 * 9. A request whose class the session's policy marks doubly-confirmed is not
 *    answered by the affirmative: it moves to waiting for the differently
 *    worded token. Repeating the affirmative neither satisfies it nor undoes
 *    it — a word that cannot advance the request must not send the wearer back
 *    to the first question either — while any other word leaves the state, and
 *    refusing or stopping still takes one word because both are the wearer
 *    taking something back.
 * 10. A request the adapter could not classify is asked twice wherever the
 *    wearer's policy asks twice about anything, which is the cautious reading
 *    of an adapter saying it does not know.
 * 11. The default policy a desk states is the partition the harness defaults to,
 *    so the two spellings of one decision cannot drift apart.
 */
export async function test_device_desk_action(): Promise<void> {
  Stream.reset();
  // The policy every decision is read against. Stated once because the table
  // requires one: what is doubly-confirmed is the wearer's statement, and a
  // decision made without it would be a decision made against nobody's.
  const policy: ICodeHudAgentAdapter.IPolicy = CodeHudDeskCommand.POLICY;
  const idle: ICodeHudState = {
    sequence: 0,
    activity: "idle",
    message: "",
    history: [],
    review: { active: false, offset: 0 },
  };
  const asking = (
    ...options: { id: string; affirmative: boolean; persistent: boolean }[]
  ): ICodeHudState => ({
    ...idle,
    activity: "waiting",
    pending: {
      ...Stream.permission("r1", "Write src/index.ts"),
      options: options.map((option) => ({ ...option, label: option.id })),
      // Classified, like every request a real adapter produces: both harness
      // families report a class from the tool they named or the command they
      // would run. An unclassified one is its own scenario below, because it
      // is treated differently on purpose.
      action: "write" as const,
    },
  });

  // 1. Words for the agent.
  TestValidator.equals(
    "free words are carried to the agent unchanged",
    CodeHudDeskAction.decide(
      { type: "prompt", text: "run the suite" },
      idle,
      policy,
    ),
    { type: "prompt", text: "run the suite" },
  );
  TestValidator.equals(
    "and an empty one is addressed to nothing",
    CodeHudDeskAction.decide({ type: "prompt", text: "" }, idle, policy),
    { type: "none" },
  );

  // 2. Questions this device answers itself.
  TestValidator.equals(
    "a local question costs no turn",
    CodeHudDeskAction.decide({ type: "query", query: "elapsed" }, idle, policy),
    { type: "answer", query: "elapsed" },
  );

  // 3-6. Answers, and what they are allowed to name.
  const offered: ICodeHudState = asking(
    { id: "accept", affirmative: true, persistent: false },
    { id: "decline", affirmative: false, persistent: false },
  );
  TestValidator.equals(
    "an approval names the harness's own affirmative",
    CodeHudDeskAction.decide(
      { type: "command", command: "allow" },
      offered,
      policy,
    ),
    { type: "decision", request: "r1", option: "accept" },
  );
  TestValidator.equals(
    "and a refusal its own negative",
    CodeHudDeskAction.decide(
      { type: "command", command: "deny" },
      offered,
      policy,
    ),
    { type: "decision", request: "r1", option: "decline" },
  );

  const legacy: ICodeHudState = asking(
    { id: "approved", affirmative: true, persistent: false },
    { id: "denied", affirmative: false, persistent: false },
  );
  TestValidator.equals(
    "the other harness's spelling is found the same way",
    CodeHudDeskAction.decide(
      { type: "command", command: "allow" },
      legacy,
      policy,
    ),
    { type: "decision", request: "r1", option: "approved" },
  );

  TestValidator.equals(
    "answering nothing does nothing",
    CodeHudDeskAction.decide(
      { type: "command", command: "allow" },
      idle,
      policy,
    ),
    { type: "none" },
  );

  const withholding: ICodeHudState = asking({
    id: "withhold",
    affirmative: false,
    persistent: false,
  });
  TestValidator.equals(
    "a request with no affirmative cannot be allowed",
    CodeHudDeskAction.decide(
      { type: "command", command: "allow" },
      withholding,
      policy,
    ),
    { type: "say", reason: "unoffered" },
  );
  TestValidator.equals(
    "though it can still be refused",
    CodeHudDeskAction.decide(
      { type: "command", command: "deny" },
      withholding,
      policy,
    ),
    { type: "decision", request: "r1", option: "withhold" },
  );

  const persisting: ICodeHudState = asking(
    { id: "acceptForSession", affirmative: true, persistent: true },
    { id: "decline", affirmative: false, persistent: false },
  );
  TestValidator.equals(
    "a persisting option is never what an answer picks",
    CodeHudDeskAction.decide(
      { type: "command", command: "allow" },
      persisting,
      policy,
    ),
    { type: "say", reason: "unoffered" },
  );

  // 7. The rest of the grammar, one effect each.
  for (const [command, expected] of [
    ["stop", { type: "interrupt" }],
    ["back", { type: "review", move: "back" }],
    ["forward", { type: "review", move: "forward" }],
    ["latest", { type: "review", move: "latest" }],
    ["repeat", { type: "redraw" }],
    ["help", { type: "say", reason: "help" }],
    ["mute", { type: "silence", active: true }],
    ["unmute", { type: "silence", active: false }],
    ["sessions", { type: "list" }],
    ["switch", { type: "list" }],
  ] as [ICodeHudVoiceRouting.ICommand.Kind, CodeHudDeskAction.IAction][])
    TestValidator.equals(
      `${command} has exactly one effect`,
      CodeHudDeskAction.decide({ type: "command", command }, idle, policy),
      expected,
    );

  // 8. What is reported rather than acted on.
  TestValidator.equals(
    "an ambiguous utterance names its candidates",
    CodeHudDeskAction.decide(
      { type: "ambiguous", candidates: ["back", "stop"] },
      idle,
      policy,
    ),
    { type: "say", reason: "ambiguous", candidates: ["back", "stop"] },
  );
  TestValidator.equals(
    "and one below the floor says so, carrying what was reported",
    CodeHudDeskAction.decide(
      { type: "unheard", confidence: 0.2 },
      idle,
      policy,
    ),
    { type: "say", reason: "unheard", confidence: 0.2 },
  );
  TestValidator.equals(
    "or nothing, when the recognizer reported nothing",
    CodeHudDeskAction.decide({ type: "unheard" }, idle, policy),
    { type: "say", reason: "unheard" },
  );

  // Selection is by ordinal, never by pronouncing a path.
  TestValidator.equals(
    "a number selects a session",
    CodeHudDeskAction.decide(
      { type: "command", command: "switch", ordinal: 2 },
      idle,
      policy,
    ),
    { type: "focus", ordinal: 2 },
  );
  TestValidator.equals(
    "and the word without a number states what there is to select from",
    CodeHudDeskAction.decide(
      { type: "command", command: "switch" },
      idle,
      policy,
    ),
    { type: "list" },
  );

  // The second confirmation, which is the product's strongest promise about
  // what one misrecognized word can do.
  const irreversible: ICodeHudState = {
    ...asking(
      { id: "accept", affirmative: true, persistent: false },
      { id: "decline", affirmative: false, persistent: false },
    ),
  };
  irreversible.pending = { ...irreversible.pending!, action: "delete" };

  TestValidator.equals(
    "the affirmative does not answer a doubly-confirmed request",
    CodeHudDeskAction.decide(
      { type: "command", command: "allow" },
      irreversible,
      policy,
    ),
    { type: "confirm", request: "r1", confirming: true },
  );
  TestValidator.equals(
    "while the same words on an ordinary one answer it",
    CodeHudDeskAction.decide(
      { type: "command", command: "allow" },
      {
        ...irreversible,
        pending: { ...irreversible.pending!, action: "write" },
      },
      policy,
    ),
    { type: "decision", request: "r1", option: "accept" },
  );

  const confirming: ICodeHudState = { ...irreversible, confirming: true };
  TestValidator.equals(
    "the confirmation token answers it",
    CodeHudDeskAction.decide(
      { type: "command", command: "confirm" },
      confirming,
      policy,
    ),
    { type: "decision", request: "r1", option: "accept" },
  );
  TestValidator.equals(
    "repeating the affirmative answers nothing and undoes nothing",
    CodeHudDeskAction.decide(
      { type: "command", command: "allow" },
      confirming,
      policy,
    ),
    { type: "none" },
  );
  TestValidator.equals(
    "nor does a prompt, which leaves the request waiting for a first answer",
    CodeHudDeskAction.decide(
      { type: "prompt", text: "actually never mind" },
      confirming,
      policy,
    ),
    { type: "confirm", request: "r1", confirming: false },
  );
  TestValidator.equals(
    "refusing still takes one word, because refusing is the recoverable way",
    CodeHudDeskAction.decide(
      { type: "command", command: "deny" },
      confirming,
      policy,
    ),
    { type: "decision", request: "r1", option: "decline" },
  );
  TestValidator.equals(
    "stopping the turn is not swallowed either, because it is a brake",
    CodeHudDeskAction.decide(
      { type: "command", command: "stop" },
      confirming,
      policy,
    ),
    { type: "interrupt" },
  );
  TestValidator.equals(
    "and an utterance nobody heard leaves it exactly where it was",
    CodeHudDeskAction.decide({ type: "unheard" }, confirming, policy),
    { type: "say", reason: "unheard" },
  );
  TestValidator.equals(
    "the token means nothing outside a confirming request",
    CodeHudDeskAction.decide(
      { type: "command", command: "confirm" },
      irreversible,
      policy,
    ),
    { type: "none" },
  );

  // A request whose class the adapter could not tell.
  const unclassified: ICodeHudState = {
    ...irreversible,
    pending: { ...irreversible.pending!, action: undefined },
  };
  TestValidator.equals(
    "an unclassified request is asked twice under a policy that asks twice",
    CodeHudDeskAction.decide(
      { type: "command", command: "allow" },
      unclassified,
      policy,
    ),
    { type: "confirm", request: "r1", confirming: true },
  );
  TestValidator.equals(
    "and once under one that never does",
    CodeHudDeskAction.decide(
      { type: "command", command: "allow" },
      unclassified,
      { actions: { read: "unattended", write: "attended" } },
    ),
    { type: "decision", request: "r1", option: "accept" },
  );

  // 9. One decision, two spellings, pinned against each other.
  TestValidator.equals(
    "the desk states the partition the harness defaults to",
    CodeHudDeskCommand.POLICY.actions,
    CodeHudAgentPolicy.DEFAULT.actions,
  );
}
