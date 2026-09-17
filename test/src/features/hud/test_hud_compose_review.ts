import type { ICodeHudFrame, ICodeHudState } from "@codehud/interface";
import {
  CodeHudComposer,
  CodeHudContext,
  CodeHudReducer,
} from "@codehud/projection";
import { TestValidator } from "@nestia/e2e";

import { Stream } from "../internal/stream";

/**
 * Review renders the entry under the cursor and says where in the history it
 * is, recomputing the window rather than assuming a scroll container.
 *
 * No supported device offers one. The vendor display surfaces accept a fixed
 * layout with replaceable text, so a design that leaned on scrolling would work
 * only on the simulator.
 *
 * Scenarios:
 *
 * 1. Review outranks the activity: a state that would otherwise be idle or
 *    streaming composes as review while the cursor is active.
 * 2. The frame shows the entry at the cursor, not the newest one.
 * 3. The position line reads as a one-based ordinal out of the total, which is
 *    how a wearer knows whether saying "back" again will do anything.
 * 4. Review is ambient, because the wearer initiated it and is already looking.
 * 5. A failed entry keeps its alert tone under review, so a wearer walking back
 *    through a turn can still see which step broke.
 * 6. On a device with room, the hint names the three review words.
 * 7. On two rows there is no hint and the position line takes the second row.
 * 8. A cursor past the end of the history falls back to idle rather than
 *    composing an empty frame, the defensive arm.
 * 9. An approval outranks review: a request arriving mid-review is shown,
 *    because it is blocking the agent and review is not.
 */
export async function test_hud_compose_review(): Promise<void> {
  const reducer: CodeHudReducer = new CodeHudReducer(CodeHudContext.DEFAULT);
  const composer: CodeHudComposer = new CodeHudComposer(CodeHudContext.DEFAULT);
  Stream.reset();
  let state: ICodeHudState = reducer.reduce(
    reducer.initialize(),
    Stream.session(),
  );
  state = reducer.reduce(
    state,
    Stream.tool("c1", "Edit first.ts", "finish", false),
  );
  state = reducer.reduce(state, Stream.message("I edited one file.", true));
  state = reducer.reduce(
    state,
    Stream.tool("c2", "Bash pnpm test", "finish", true),
  );
  state = reducer.reduce(state, Stream.result("One file edited", "success"));

  const reviewing: ICodeHudState = reducer.review(state, "back");
  const frame: ICodeHudFrame = composer.compose(reviewing, Stream.NARROW);
  TestValidator.equals("review outranks the activity", frame.kind, "review");
  TestValidator.equals("review grade", frame.urgency, "ambient");
  TestValidator.equals(
    "shows the entry at the cursor",
    frame.lines[0]!.text,
    "Bash pnpm test",
  );
  TestValidator.equals(
    "failed entry keeps alert",
    frame.lines[0]!.tone,
    "alert",
  );
  TestValidator.equals("position line", frame.lines[1]!.text, "2 of 4");
  TestValidator.equals("no hint on two rows", frame.hint, undefined);

  const wide: ICodeHudFrame = composer.compose(reviewing, Stream.WIDE);
  TestValidator.equals(
    "hint names the review words",
    wide.hint,
    "Say back, forward, or latest",
  );

  const newest: ICodeHudFrame = composer.compose(
    { ...state, review: { active: true, offset: 0 } },
    Stream.NARROW,
  );
  TestValidator.equals(
    "newest is one of three",
    newest.lines[1]!.text,
    "1 of 4",
  );
  TestValidator.equals("and is not alert", newest.lines[0]!.tone, "primary");

  // Emphasis distinguishes what an entry is. On a monochrome two-line display
  // the text and its weight are all a wearer has to tell a turn summary from a
  // tool call, so each kind is pinned here and a failure overrides all of them.
  const tones = [0, 1, 2, 3].map(
    (offset) =>
      composer.compose(
        { ...state, review: { active: true, offset } },
        Stream.NARROW,
      ).lines[0]!.tone,
  );
  TestValidator.equals("a result is primary", tones[0], "primary");
  TestValidator.equals("a failure overrides the kind", tones[1], "alert");
  TestValidator.equals("a message is secondary", tones[2], "secondary");
  TestValidator.equals("a tool is muted", tones[3], "muted");

  TestValidator.equals(
    "the positional word comes from the vocabulary",
    composer.compose(
      { ...state, review: { active: true, offset: 0 } },
      Stream.NARROW,
    ).lines[1]!.text,
    `1 ${CodeHudContext.DEFAULT.vocabulary.within} 4`,
  );

  const past: ICodeHudFrame = composer.compose(
    { ...state, review: { active: true, offset: 99 } },
    Stream.NARROW,
  );
  TestValidator.equals("a cursor past the end falls back", past.kind, "idle");

  const interrupted: ICodeHudState = reducer.reduce(
    reviewing,
    Stream.permission("r1", "Write src/index.ts"),
  );
  TestValidator.equals(
    "an approval outranks review",
    composer.compose(interrupted, Stream.NARROW).kind,
    "permission",
  );
}
