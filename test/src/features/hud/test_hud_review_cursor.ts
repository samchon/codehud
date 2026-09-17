import type { ICodeHudState } from "@codehud/interface";
import { CodeHudContext, CodeHudReducer } from "@codehud/projection";
import { TestValidator } from "@nestia/e2e";

import { Stream } from "../internal/stream";

/**
 * The review cursor tracks the entry a wearer is reading, not a position.
 *
 * History is newest-first, so every new entry shifts every existing index by
 * one. A cursor that did not move with it would silently slide the wearer onto
 * a different entry every time the agent did anything, which is the worst kind
 * of display bug: it looks like the wearer misread rather than like a defect.
 *
 * Scenarios:
 *
 * 1. Moving back on an empty history changes nothing, the guard.
 * 2. Moving back from inactive enters review at the newest entry's neighbour.
 * 3. Moving back walks toward older entries and clamps at the oldest rather
 *    than failing, since a wearer saying "back" at the end should stop.
 * 4. Moving forward walks toward newer entries and clamps at the newest.
 * 5. Moving toward newer content while already following does nothing, rather
 *    than entering review and pinning the display at the newest entry. That
 *    freeze is one the wearer did not ask for and cannot tell from the agent
 *    having gone quiet.
 * 6. Saying latest leaves review entirely and returns to following.
 * 6. A new entry arriving during review increments the offset, so the cursor
 *    still points at the same entry. This is the scenario the whole test exists
 *    for.
 * 7. A new entry arriving while not in review does not move the offset, the
 *    negative twin.
 * 8. An upsert of an existing entry does not move the cursor either, since
 *    nothing was prepended.
 * 9. When the retention cap drops the very entry the cursor was on, the cursor
 *    stops at the oldest that survived instead of following past the end. A
 *    cursor past the end renders as the idle frame while review is still
 *    active: the wearer is thrown out of the history they were walking, the
 *    display says nothing about it, and their next word moves from a position
 *    that no longer exists.
 */
export async function test_hud_review_cursor(): Promise<void> {
  const reducer: CodeHudReducer = new CodeHudReducer(CodeHudContext.DEFAULT);
  Stream.reset();
  let state: ICodeHudState = reducer.initialize();

  TestValidator.equals(
    "back on empty history changes nothing",
    reducer.review(state, "back"),
    state,
  );

  for (const name of ["first", "second", "third"])
    state = reducer.reduce(
      state,
      Stream.tool(name, `Edit ${name}.ts`, "finish", false),
    );
  TestValidator.equals("three entries", state.history.length, 3);
  TestValidator.equals(
    "newest first",
    state.history[0]!.title,
    "Edit third.ts",
  );

  const back1: ICodeHudState = reducer.review(state, "back");
  TestValidator.equals("review entered", back1.review.active, true);
  TestValidator.equals("moved one back", back1.review.offset, 1);

  const back2: ICodeHudState = reducer.review(back1, "back");
  TestValidator.equals("moved to the oldest", back2.review.offset, 2);

  const clampedBack: ICodeHudState = reducer.review(back2, "back");
  TestValidator.equals("clamps at the oldest", clampedBack.review.offset, 2);

  const forward: ICodeHudState = reducer.review(back2, "forward");
  TestValidator.equals("moved forward", forward.review.offset, 1);

  const clampedForward: ICodeHudState = reducer.review(
    reducer.review(forward, "forward"),
    "forward",
  );
  TestValidator.equals("clamps at the newest", clampedForward.review.offset, 0);
  TestValidator.equals("still reviewing", clampedForward.review.active, true);

  TestValidator.equals(
    "forward while following does not freeze the display",
    reducer.review(state, "forward"),
    state,
  );

  const left: ICodeHudState = reducer.review(back2, "latest");
  TestValidator.equals("latest leaves review", left.review.active, false);
  TestValidator.equals("and resets the offset", left.review.offset, 0);

  const held: string = back2.history[back2.review.offset]!.title;
  const shifted: ICodeHudState = reducer.reduce(
    back2,
    Stream.tool("fourth", "Edit fourth.ts", "finish", false),
  );
  TestValidator.equals("offset followed the entry", shifted.review.offset, 3);
  TestValidator.equals(
    "and the entry under the cursor is unchanged",
    shifted.history[shifted.review.offset]!.title,
    held,
  );

  const following: ICodeHudState = reducer.reduce(
    state,
    Stream.tool("fifth", "Edit fifth.ts", "finish", false),
  );
  TestValidator.equals(
    "not reviewing, offset unmoved",
    following.review.offset,
    0,
  );
  TestValidator.equals("and still following", following.review.active, false);

  const upserted: ICodeHudState = reducer.reduce(
    back2,
    Stream.tool("third", "Edit third.ts (again)", "finish", false),
  );
  TestValidator.equals(
    "an upsert does not move the cursor",
    upserted.review.offset,
    2,
  );

  // The cap, and the entry the cursor was reading falling off the end of it.
  const small: CodeHudReducer = new CodeHudReducer(
    CodeHudContext.create({ history: 3 }),
  );
  let capped: ICodeHudState = small.initialize();
  for (const name of ["a", "b", "c"])
    capped = small.reduce(
      capped,
      Stream.tool(name, `Edit ${name}.ts`, "finish", false),
    );
  for (let i: number = 0; i < 3; ++i) capped = small.review(capped, "back");
  TestValidator.equals(
    "the wearer walked to the oldest entry",
    capped.history[capped.review.offset]?.title,
    "Edit a.ts",
  );

  const evicted: ICodeHudState = small.reduce(
    capped,
    Stream.tool("d", "Edit d.ts", "finish", false),
  );
  TestValidator.equals(
    "the entry the cursor was on is gone",
    evicted.history.some((entry) => entry.title === "Edit a.ts"),
    false,
  );
  TestValidator.equals(
    "so the cursor stops at the oldest that survived",
    evicted.review.offset,
    evicted.history.length - 1,
  );
  TestValidator.predicate(
    "which is an entry rather than nothing",
    evicted.history[evicted.review.offset] !== undefined,
  );
  TestValidator.equals(
    "and the wearer is still in review",
    evicted.review.active,
    true,
  );
}
