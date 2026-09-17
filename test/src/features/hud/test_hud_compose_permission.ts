import type { ICodeHudFrame, ICodeHudState } from "@codehud/interface";
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
 * 8. When the labels are too long to name both, the hint falls back to a
 *    shorter form that still fits.
 */
export async function test_hud_compose_permission(): Promise<void> {
  const reducer: CodeHudReducer = new CodeHudReducer(CodeHudContext.DEFAULT);
  const composer: CodeHudComposer = new CodeHudComposer(CodeHudContext.DEFAULT);
  Stream.reset();
  const asked: ICodeHudState = reducer.reduce(
    reducer.reduce(reducer.initialize(), Stream.session()),
    Stream.permission("r1", "Write src/index.ts", "Creates a new file."),
  );

  const narrow: ICodeHudFrame = composer.compose(asked, Stream.NARROW);
  TestValidator.equals("kind", narrow.kind, "permission");
  TestValidator.equals("grade", narrow.urgency, "demand");
  TestValidator.equals("alert tone", narrow.lines[0]!.tone, "alert");
  TestValidator.equals("one content row", narrow.lines.length, 1);
  TestValidator.equals(
    "hint names both answers",
    narrow.hint,
    "Say Allow or Deny",
  );
  TestValidator.equals(
    "hint never names the persisting option",
    narrow.hint?.includes("Always"),
    false,
  );

  const wide: ICodeHudFrame = composer.compose(asked, Stream.WIDE);
  TestValidator.equals("detail survives with room", wide.lines.length, 2);
  TestValidator.equals("detail tone", wide.lines[1]!.tone, "secondary");
  TestValidator.equals("hint still present", wide.hint, "Say Allow or Deny");

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
}
