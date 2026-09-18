import { CodeHudText } from "@codehud/projection";

import { Assert } from "../internal/assert";

/**
 * `path` drops leading segments rather than trailing characters.
 *
 * The tail of a path is what tells a wearer which file an approval would
 * modify. Cutting from the right would leave every path in a repository
 * looking identical.
 *
 * Scenarios:
 *
 * 1. A non-positive budget yields the empty string.
 * 2. A path within the budget passes through unchanged.
 * 3. Backslashes normalize to forward slashes, because the bridge runs on the
 *    wearer's own machine and that machine is often Windows.
 * 4. An over-budget path keeps its trailing segments and marks the elision, and
 *    the result still fits.
 * 5. When not even one whole segment fits, the last segment is cut by `fit`
 *    instead, which is the branch where segment-wise elision gives up.
 * 6. A path made only of separators has no segments at all, the degenerate
 *    input that reaches the fallback with nothing to fall back to.
 */
export async function test_hud_text_path(): Promise<void> {
  Assert.equals("zero budget", CodeHudText.path("/a/b/c", 0), "");

  Assert.equals("fits unchanged", CodeHudText.path("/a/b.ts", 20), "/a/b.ts");

  Assert.equals(
    "backslashes normalized",
    CodeHudText.path("D:\\github\\samchon\\codehud", 40),
    "D:/github/samchon/codehud",
  );

  const elided: string = CodeHudText.path(
    "/home/dev/projects/codehud/packages/projection/src/CodeHudComposer.ts",
    30,
  );
  Assert.equals("elided fits", elided.length <= 30, true);
  Assert.equals(
    "elision marked",
    elided.startsWith(CodeHudText.ELLIPSIS),
    true,
  );
  Assert.equals("tail survives", elided.endsWith("CodeHudComposer.ts"), true);

  const tiny: string = CodeHudText.path(
    "/home/dev/VeryLongFileNameIndeed.ts",
    8,
  );
  Assert.equals("tiny budget fits", tiny.length <= 8, true);
  Assert.equals(
    "tiny budget falls back to fit",
    tiny.startsWith("VeryLon"),
    true,
  );

  const separators: string = CodeHudText.path("//////////", 3);
  Assert.equals("only separators fits", separators.length <= 3, true);
}
