import { CodeHudText } from "@codehud/projection";
import { TestValidator } from "@nestia/e2e";

/**
 * `tail` wraps to the column budget and keeps only the newest lines.
 *
 * Streaming prose is read from the bottom: the wearer wants the words that just
 * arrived, not the opening of a paragraph that already scrolled past.
 *
 * Scenarios:
 *
 * 1. A non-positive row or column budget yields no lines, the two guards.
 * 2. Empty and whitespace-only text yield no lines rather than one blank one,
 *    since a blank line on a two-row display costs half the surface.
 * 3. Short text yields one line.
 * 4. Wrapped text respects the column budget on every line.
 * 5. More wrapped lines than rows keeps the last ones, not the first.
 * 6. A single word longer than the budget is split rather than overflowing,
 *    the branch an unbroken identifier reaches.
 */
export async function test_hud_text_tail(): Promise<void> {
  TestValidator.equals("zero rows", CodeHudText.tail("hello", 10, 0), []);
  TestValidator.equals("zero columns", CodeHudText.tail("hello", 0, 2), []);

  TestValidator.equals("empty text", CodeHudText.tail("", 10, 2), []);
  TestValidator.equals(
    "whitespace only",
    CodeHudText.tail("   \n  ", 10, 2),
    [],
  );

  TestValidator.equals("short text", CodeHudText.tail("hi there", 20, 2), [
    "hi there",
  ]);

  const wrapped: string[] = CodeHudText.tail(
    "the reducer is pure and the composer knows the geometry",
    12,
    10,
  );
  for (const l of wrapped)
    TestValidator.predicate(`line within budget: ${l}`, l.length <= 12);
  TestValidator.predicate("wrapped into several", wrapped.length > 1);

  const tailed: string[] = CodeHudText.tail(
    "alpha bravo charlie delta echo foxtrot golf hotel",
    12,
    2,
  );
  TestValidator.equals("kept only two rows", tailed.length, 2);
  TestValidator.predicate(
    "kept the newest, not the oldest",
    tailed.join(" ").includes("hotel") && !tailed.join(" ").includes("alpha"),
  );

  const split: string[] = CodeHudText.tail("supercalifragilistic", 6, 10);
  for (const l of split)
    TestValidator.predicate(`split line within budget: ${l}`, l.length <= 6);
  TestValidator.predicate("long word was split", split.length > 1);
  TestValidator.equals(
    "split loses nothing",
    split.join(""),
    "supercalifragilistic",
  );
}
