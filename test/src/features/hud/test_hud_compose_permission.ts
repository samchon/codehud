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
import { TestValidator } from "@nestia/e2e";

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
  TestValidator.equals("kind", narrow.kind, "permission");
  TestValidator.equals("grade", narrow.urgency, "demand");
  TestValidator.equals("alert tone", narrow.lines[0]!.tone, "alert");
  TestValidator.equals("one content row", narrow.lines.length, 1);
  TestValidator.predicate(
    "which still says which session is asking",
    narrow.lines[0]!.text.includes("codehud"),
  );
  TestValidator.equals(
    "hint names both answers",
    narrow.hint,
    `${words.say} Allow ${words.or} Deny`,
  );
  TestValidator.equals(
    "hint never names the persisting option",
    narrow.hint?.includes("Always"),
    false,
  );

  const wide: ICodeHudFrame = composer.compose(asked, Stream.WIDE);
  TestValidator.equals(
    "the question, the session, and the detail, in that order",
    wide.lines.length,
    3,
  );
  TestValidator.equals("the session is named", wide.lines[1]!.tone, "muted");
  TestValidator.predicate(
    "by the trailing part of its directory",
    wide.lines[1]!.text.includes("codehud"),
  );
  TestValidator.equals("detail tone", wide.lines[2]!.tone, "secondary");
  TestValidator.equals(
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
  TestValidator.equals(
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
  TestValidator.equals(
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
  TestValidator.predicate(
    "an over-long hint falls back and still fits",
    fallback.hint !== undefined &&
      fallback.hint.length <= Stream.NARROW.columns,
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
  TestValidator.predicate(
    "and a refusal alone falls back the same way",
    trimmed.hint !== undefined && trimmed.hint.length <= Stream.NARROW.columns,
  );
}
