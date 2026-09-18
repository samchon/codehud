import type { ICodeHudFrame } from "@codehud/interface";
import { CodeHudTerminalGlasses } from "@codehud/simulator";

import { Assert } from "../internal/assert";

/**
 * A device draws what changed, and nothing else.
 *
 * The adapter contract states this of every implementation, and names it the
 * only optimization an adapter may make for itself:
 *
 * > Implementations compare `ICodeHudFrame.key` against the frame already on
 * > screen and skip the draw when they match.
 *
 * It is not a saving. A turn streams prose token by token, and every token
 * produces a frame; an adapter that drew each one would flicker a waveguide
 * continuously on hardware, and here would print one box per token until the
 * scrollback a wearer is meant to read back through is the thing burying what
 * they wanted. This adapter was the only one in the repository and did not do
 * it.
 *
 * The two forgettings matter as much as the comparison. Sleeping and beginning
 * capture both change what a display shows without changing the frame, so an
 * adapter that remembered the old key across either would skip the next draw
 * and show nothing — which is precisely what waking exists to prevent.
 *
 * The keys here are opaque strings rather than the composer's own, because
 * opaque is what they are to an adapter: the contract has a device compare them
 * and never read them, and a case that built real ones would be testing the
 * composer's digest a second time.
 *
 * Scenarios:
 *
 * 1. The first frame is drawn.
 * 2. The same frame again is not, however many times it arrives.
 * 3. A frame differing in content is drawn, the negative twin.
 * 4. A frame differing only in grade is drawn too, since the grade is part of
 *    what a wearer reads and therefore part of the key the composer built.
 * 5. A sleeping display draws nothing at all.
 * 6. Reconnecting does not wake a sleeping display, and waking redraws what was
 *    suppressed rather than treating it as unchanged. The two are separate
 *    operations because on hardware they are separate things: a host that
 *    reconnected to light a display would end a session to draw a line.
 * 7. Beginning capture redraws for the same reason, because the title says so.
 */
export async function test_device_redraw(): Promise<void> {
  const written: string[] = [];
  const glasses: CodeHudTerminalGlasses = new CodeHudTerminalGlasses({
    geometry: { columns: 24, rows: 2, colored: false },
    lines: {
      [Symbol.asyncIterator]: async function* (): AsyncGenerator<string> {
        // Nothing: this case is about drawing, not about listening.
      },
    },
    write: (line: string) => written.push(line),
  });
  const frame = (props: Partial<ICodeHudFrame> = {}): ICodeHudFrame => ({
    kind: "status",
    urgency: "ambient",
    lines: [{ text: "Working", tone: "primary" }],
    key: "first",
    ...props,
  });
  const drawn = async (value: ICodeHudFrame): Promise<number> => {
    const before: number = written.length;
    await glasses.render(value);
    return written.length - before;
  };

  await glasses.connect();
  Assert.predicate("the first frame is drawn", (await drawn(frame())) > 0);
  Assert.equals("the same frame again is not", await drawn(frame()), 0);
  Assert.equals(
    "however many times it arrives",
    (await drawn(frame())) + (await drawn(frame())),
    0,
  );

  const moved: ICodeHudFrame = frame({
    lines: [{ text: "Working harder", tone: "primary" }],
    key: "second",
  });
  Assert.predicate("a frame that differs is drawn", (await drawn(moved)) > 0);

  const graded: ICodeHudFrame = frame({
    lines: [{ text: "Working harder", tone: "primary" }],
    urgency: "demand",
    key: "third",
  });
  Assert.predicate(
    "and so is one that differs only in grade",
    (await drawn(graded)) > 0,
  );

  // Sleeping, and what a display owes when it wakes. The frame is deliberately
  // the one already on screen: a display that blanked and then skipped the
  // redraw as unchanged would wake to nothing, which is the whole failure.
  Assert.equals(
    "the graded frame is now what is shown",
    await drawn(graded),
    0,
  );
  await glasses.sleep();
  Assert.equals("a sleeping display draws nothing", await drawn(graded), 0);
  await glasses.connect();
  Assert.equals(
    "reconnecting is not waking, because the display is not the transport",
    await drawn(graded),
    0,
  );
  await glasses.wake();
  Assert.predicate(
    "waking redraws the unchanged frame rather than showing nothing",
    (await drawn(graded)) > 0,
  );

  await glasses.listen();
  Assert.predicate(
    "beginning capture redraws it again, because the display now says so",
    (await drawn(graded)) > 0,
  );
}
