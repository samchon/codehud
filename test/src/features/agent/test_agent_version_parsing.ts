import { CodeHudHarnessProbe } from "@codehud/agent";
import { TestValidator } from "@nestia/e2e";

/**
 * Version parsing reads what the two harnesses actually print.
 *
 * The first two cases are not invented. They are what the binaries on the
 * machine this was written on printed when asked, and they disagree about
 * shape, which is why the rule is to find a dotted numeric token rather than to
 * match a position.
 *
 * ```text
 * claude --version   ->  2.1.274 (Claude Code)
 * codex --version    ->  codex-cli 0.154.0
 * ```
 *
 * Scenarios:
 *
 * 1. Both real shapes parse, one with the version first and one with a hyphenated
 *    name in front of it.
 * 2. A prerelease or build suffix survives rather than being discarded. A first
 *    attempt required the whole token to be numeric and reported a release
 *    candidate as no version at all.
 * 3. Output with no version reads as absent, which the specification treats as
 *    available without one rather than as unusable.
 * 4. A bare integer is not a version, the boundary that keeps a word like an
 *    exit code from being read as one.
 * 5. The first dotted token wins when several appear, so a version followed by a
 *    date or a commit count does not shift the answer.
 * 6. Punctuation around the token does not hide it, since one harness wraps its
 *    name in parentheses.
 */
export async function test_agent_version_parsing(): Promise<void> {
  const parse = CodeHudHarnessProbe.version;

  TestValidator.equals(
    "claude, as measured",
    parse("2.1.274 (Claude Code)"),
    "2.1.274",
  );
  TestValidator.equals(
    "codex, as measured",
    parse("codex-cli 0.154.0"),
    "0.154.0",
  );

  TestValidator.equals(
    "prerelease survives",
    parse("v1.2.3-beta.4"),
    "1.2.3-beta.4",
  );
  TestValidator.equals(
    "build metadata survives",
    parse("2.0.0+build.7"),
    "2.0.0+build.7",
  );

  TestValidator.equals("no version at all", parse("hello there"), undefined);
  TestValidator.equals("empty output", parse(""), undefined);

  TestValidator.equals(
    "a bare integer is not a version",
    parse("exit 1"),
    undefined,
  );

  TestValidator.equals(
    "the first dotted token wins",
    parse("1.2.3 built 4.5.6"),
    "1.2.3",
  );

  TestValidator.equals(
    "parentheses do not hide it",
    parse("tool (3.4.5)"),
    "3.4.5",
  );
  TestValidator.equals(
    "brackets do not either",
    parse("tool [3.4.5]"),
    "3.4.5",
  );
}
