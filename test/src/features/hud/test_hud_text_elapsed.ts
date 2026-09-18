import { CodeHudText } from "@codehud/projection";

import { Assert } from "../internal/assert";

/**
 * `elapsed` renders a duration in the coarsest unit that stays honest.
 *
 * A wearer compares an elapsed time to their own patience and never to another
 * measurement, so precision past one significant unit is display width spent on
 * nothing.
 *
 * Scenarios:
 *
 * 1. Sub-minute durations render in seconds, rounded rather than truncated.
 * 2. Exactly one minute crosses into the minute form, the lower boundary.
 * 3. Sub-hour durations carry the remaining seconds.
 * 4. Exactly one hour crosses into the hour form, the upper boundary.
 * 5. Multi-hour durations carry the remaining minutes and drop seconds, since
 *    nobody reads seconds off an hour-long turn.
 * 6. A negative duration clamps to zero rather than rendering a minus sign,
 *    which can happen when a host clock is adjusted mid-turn.
 */
export async function test_hud_text_elapsed(): Promise<void> {
  Assert.equals("zero", CodeHudText.elapsed(0), "0s");
  Assert.equals("rounds up", CodeHudText.elapsed(4_600), "5s");
  Assert.equals("rounds down", CodeHudText.elapsed(4_400), "4s");
  Assert.equals("just under a minute", CodeHudText.elapsed(59_000), "59s");

  Assert.equals("exactly a minute", CodeHudText.elapsed(60_000), "1m 0s");
  Assert.equals("minutes and seconds", CodeHudText.elapsed(200_000), "3m 20s");
  Assert.equals(
    "just under an hour",
    CodeHudText.elapsed(3_599_000),
    "59m 59s",
  );

  Assert.equals("exactly an hour", CodeHudText.elapsed(3_600_000), "1h 0m");
  Assert.equals("hours and minutes", CodeHudText.elapsed(3_840_000), "1h 4m");

  Assert.equals("negative clamps", CodeHudText.elapsed(-5_000), "0s");
}
