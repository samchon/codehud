import type {
  ICodeHudContext,
  ICodeHudFrame,
  ICodeHudState,
} from "@codehud/interface";
import {
  CodeHudComposer,
  CodeHudContext,
  CodeHudReducer,
} from "@codehud/projection";

import { Assert } from "../internal/assert";
import { Stream } from "../internal/stream";

/**
 * A pending approval composes to a demand-grade frame whose title is readable
 * and whose spoken answers are the ones the harness actually offered.
 *
 * This is the frame the product exists for. Everything else a wearer misses can
 * be caught up on; this one stops the agent until a person answers.
 *
 * Scenarios:
 *
 * 1. The frame is demand-grade, since it may wake a sleeping display and speak.
 * 2. The title is the alert line, and it fits the device.
 * 3. The hint names the labels the harness reported rather than a fixed pair,
 *    because a wearer answering with a word the harness does not offer has not
 *    answered.
 * 4. The persisting option is never named in the hint, since a consent whose
 *    scope cannot be read on a two-line display must not be the easiest answer.
 * 5. On a two-row device the hint takes the second row and the detail is
 *    dropped, because the subject outranks the elaboration.
 * 6. On a wider device the detail survives alongside the hint.
 * 7. When the harness offers no negative answer there is no hint, the arm where
 *    a legend would name a phrase that does nothing.
 * 8. When it offers only a refusal there is still a hint, naming it alone. Not
 *    every request can be answered affirmatively from a wearable — a Codex
 *    permissions request grants a profile of paths and network access, and that
 *    surface offers only to withhold it — and a request shown with no words to
 *    clear it is one a wearer cannot answer at all.
 * 9. When the labels are too long to name both, the hint falls back to a
 *    shorter form that still fits, on either shape.
 * 10. A request waiting on its second answer says so and names the
 *    differently-worded token, so a wearer who has already spoken once can tell
 *    a question that needs confirming from one that did not hear them. The
 *    refusal is still named, because refusing still takes one word.
 */
export async function test_hud_compose_permission(): Promise<void> {
  const reducer: CodeHudReducer = new CodeHudReducer(CodeHudContext.DEFAULT);
  const composer: CodeHudComposer = new CodeHudComposer(CodeHudContext.DEFAULT);
  Stream.reset();

  // The two labels are the harness's, supplied by the fixture below; only the
  // connectives around them belong to the configuration. Spelling those out as
  // a literal would tie the rule to wording the composer merely passes through.
  const words: ICodeHudContext.IVocabulary = CodeHudContext.DEFAULT.vocabulary;
  const asked: ICodeHudState = reducer.reduce(
    reducer.reduce(reducer.initialize(), Stream.session()),
    Stream.permission("r1", "Write src/index.ts", "Creates a new file."),
  );

  const narrow: ICodeHudFrame = composer.compose(asked, Stream.NARROW);
  Assert.equals("kind", narrow.kind, "permission");
  Assert.equals("grade", narrow.urgency, "demand");
  Assert.equals("alert tone", narrow.lines[0]!.tone, "alert");
  Assert.equals("one content row", narrow.lines.length, 1);
  Assert.predicate(
    "which still says which session is asking",
    narrow.lines[0]!.text.includes("codehud"),
  );
  Assert.equals(
    "hint names both answers",
    narrow.hint,
    `${words.say} Allow ${words.or} Deny`,
  );
  Assert.equals(
    "hint never names the persisting option",
    narrow.hint?.includes("Always"),
    false,
  );

  const wide: ICodeHudFrame = composer.compose(asked, Stream.WIDE);
  Assert.equals(
    "the question, the session, and the detail, in that order",
    wide.lines.length,
    3,
  );
  Assert.equals("the session is named", wide.lines[1]!.tone, "muted");
  Assert.predicate(
    "by the trailing part of its directory",
    wide.lines[1]!.text.includes("codehud"),
  );
  Assert.equals("detail tone", wide.lines[2]!.tone, "secondary");
  Assert.equals(
    "hint still present",
    wide.hint,
    `${words.say} Allow ${words.or} Deny`,
  );

  const onesided: ICodeHudState = {
    ...asked,
    pending: {
      ...asked.pending!,
      options: [
        { id: "yes", label: "Allow", affirmative: true, persistent: false },
      ],
    },
  };
  Assert.equals(
    "no negative answer means no hint",
    composer.compose(onesided, Stream.NARROW).hint,
    undefined,
  );

  const refusing: ICodeHudState = {
    ...asked,
    pending: {
      ...asked.pending!,
      options: [
        { id: "no", label: "Deny", affirmative: false, persistent: false },
      ],
    },
  };
  Assert.equals(
    "a refusal alone is still named",
    composer.compose(refusing, Stream.NARROW).hint,
    `${words.say} Deny`,
  );

  const verbose: ICodeHudState = {
    ...asked,
    pending: {
      ...asked.pending!,
      options: [
        {
          id: "yes",
          label: "Yes go ahead and do it",
          affirmative: true,
          persistent: false,
        },
        {
          id: "no",
          label: "No stop right there",
          affirmative: false,
          persistent: false,
        },
      ],
    },
  };
  const fallback: ICodeHudFrame = composer.compose(verbose, Stream.NARROW);
  Assert.predicate(
    "an over-long hint falls back and still fits",
    fallback.hint !== undefined &&
      fallback.hint.length <= Stream.NARROW.columns,
  );

  // The second ask.
  const confirming: ICodeHudState = { ...asked, confirming: true };
  const second: ICodeHudFrame = composer.compose(confirming, Stream.WIDE);
  Assert.predicate(
    "the second ask says it is one",
    second.lines[0]!.text.startsWith(words.again),
  );
  Assert.predicate(
    "and still says what is being asked",
    second.lines[0]!.text.includes("Write src/index.ts"),
  );
  Assert.equals(
    "naming the differently worded token and the refusal",
    second.hint,
    `${words.say} Confirm ${words.or} Deny`,
  );
  Assert.predicate(
    "which is the configured token, presented as the labels beside it are",
    second.hint
      ?.toLowerCase()
      .includes(CodeHudContext.DEFAULT.consent.confirmation.toLowerCase()) ===
      true,
  );
  Assert.equals(
    "which is not the token that got it here",
    second.hint?.includes(CodeHudContext.DEFAULT.consent.affirmative),
    false,
  );
  Assert.equals("and it is still a demand", second.urgency, "demand");
  const narrow2: ICodeHudFrame = composer.compose(confirming, Stream.NARROW);
  Assert.predicate(
    "at the smallest geometry it still fits",
    narrow2.lines.every((line) => line.text.length <= Stream.NARROW.columns) &&
      (narrow2.hint?.length ?? 0) <= Stream.NARROW.columns,
  );

  const wordy: ICodeHudState = {
    ...asked,
    pending: {
      ...asked.pending!,
      options: [
        {
          id: "no",
          label: "No, withhold that access entirely",
          affirmative: false,
          persistent: false,
        },
      ],
    },
  };
  const trimmed: ICodeHudFrame = composer.compose(wordy, Stream.NARROW);
  Assert.predicate(
    "and a refusal alone falls back the same way",
    trimmed.hint !== undefined && trimmed.hint.length <= Stream.NARROW.columns,
  );
}
