import { CodeHudText } from "@codehud/projection";
import { TestValidator } from "@nestia/e2e";

/**
 * `fit` never returns more columns than it was given, and says when it cut.
 *
 * Scenarios:
 *
 * 1. A non-positive budget yields the empty string rather than throwing, since
 *    a caller computing a budget can legitimately reach zero.
 * 2. Text within the budget passes through with interior whitespace collapsed,
 *    because streamed output arrives with newlines that mean nothing on one
 *    line and would otherwise spend the budget on emptiness.
 * 3. Text over the budget is cut to exactly the budget and ends in the marker,
 *    so a cut line cannot be mistaken for a finished one.
 * 4. A one-column budget yields the marker alone, the boundary where no content
 *    character fits beside it.
 * 5. Exactly-at-budget text is not cut, the boundary on the other side.
 */
export async function test_hud_text_fit(): Promise<void> {
  TestValidator.equals("zero budget", CodeHudText.fit("anything", 0), "");
  TestValidator.equals("negative budget", CodeHudText.fit("anything", -3), "");

  TestValidator.equals(
    "whitespace collapsed",
    CodeHudText.fit("  read \n\n  src/index.ts  ", 40),
    "read src/index.ts",
  );

  const cut: string = CodeHudText.fit("abcdefghij", 5);
  TestValidator.equals("cut to budget", cut.length, 5);
  TestValidator.equals(
    "cut is marked",
    cut.endsWith(CodeHudText.ELLIPSIS),
    true,
  );
  TestValidator.equals("cut keeps the head", cut.startsWith("abcd"), true);

  TestValidator.equals(
    "one column",
    CodeHudText.fit("abcdef", 1),
    CodeHudText.ELLIPSIS,
  );

  const exact: string = CodeHudText.fit("abcde", 5);
  TestValidator.equals("exactly at budget is untouched", exact, "abcde");
  TestValidator.equals(
    "exactly at budget is unmarked",
    exact.includes(CodeHudText.ELLIPSIS),
    false,
  );
}
