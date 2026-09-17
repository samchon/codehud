import type { ICodeHudFrame } from "@codehud/interface";
import { CodeHudTerminalCanvas } from "@codehud/simulator";
import { TestValidator } from "@nestia/e2e";

/**
 * The simulator draws at the declared geometry, and never hides an overflow.
 *
 * A simulator exists to make a wearable's constraints visible on a desk. Its
 * one obligation is therefore not to be more forgiving than the device: a box
 * that quietly absorbed a line too long, or that took the terminal's width
 * instead of the declared one, would grant confidence in a layout nobody had
 * checked. That is worse than having no simulator.
 *
 * The composer is supposed to have fitted the text already, so anything
 * arriving too long is a defect upstream. This marks it rather than trimming
 * it, because a defect that is trimmed is a defect that ships.
 *
 * Scenarios:
 *
 * 1. Every line of the drawing is the same width, so the box means something.
 * 2. The box is the declared width, not the width of what it was given.
 * 3. Exactly as many content rows as the geometry declares, padded when the
 *    frame supplies fewer and never more when it supplies more.
 * 4. A line longer than the declared width is marked, not silently cut.
 * 5. A line exactly at the width is left alone, the boundary between the two.
 * 6. The hint gets its own compartment, and costs one of the declared rows.
 *    The composer reserves a row for it before deciding how much content fits,
 *    so a canvas that drew it as an extra would show three lines on a two-line
 *    device. That defect was here, and looking at the output is what found it:
 *    every assertion passed while the box was a row too tall.
 * 7. A frame with no hint has no compartment for one, rather than an empty one.
 * 8. The grade is stated under the box, because a simulator that did not show
 *    it could not be used to check the notification rules at all.
 */
export async function test_device_terminal(): Promise<void> {
  const frame = (props: Partial<ICodeHudFrame> = {}): ICodeHudFrame => ({
    kind: "permission",
    urgency: "demand",
    lines: [{ text: "Write src/index.ts", tone: "alert" }],
    key: "k",
    ...props,
  });

  const drawn: string[] = CodeHudTerminalCanvas.draw(frame(), {
    columns: 24,
    rows: 2,
    colored: false,
  });

  TestValidator.equals(
    "every line is the same width",
    new Set(drawn.map((line) => line.length)).size,
    1,
  );
  TestValidator.equals(
    "and that width is the declared one plus its two borders",
    drawn[0]!.length,
    26,
  );

  const body: string[] = drawn.filter((line) => line.startsWith("│"));
  TestValidator.equals("as many rows as were declared", body.length, 2);
  TestValidator.predicate(
    "the first holding what the frame said",
    body[0]!.includes("Write src/index.ts"),
  );
  TestValidator.equals(
    "and the second padded rather than absent",
    body[1],
    `│${" ".repeat(24)}│`,
  );

  // An overflow is a defect upstream, and is shown as one.
  const long: string = CodeHudTerminalCanvas.pad("x".repeat(40), 24);
  TestValidator.equals(
    "an overflowing line is cut to the width",
    long.length,
    24,
  );
  TestValidator.predicate(
    "and marked, not silently trimmed",
    long.endsWith("!"),
  );
  TestValidator.equals(
    "a line exactly at the width is untouched",
    CodeHudTerminalCanvas.pad("y".repeat(24), 24),
    "y".repeat(24),
  );
  TestValidator.equals(
    "and a newline never breaks the box",
    CodeHudTerminalCanvas.pad("a\nb", 4),
    "a b ",
  );

  const hinted: string[] = CodeHudTerminalCanvas.draw(
    frame({ hint: "Say Allow or Deny" }),
    { columns: 24, rows: 2, colored: false },
  );
  TestValidator.predicate(
    "a hint gets its own compartment",
    hinted.some((line) => line.startsWith("├")) &&
      hinted.some((line) => line.includes("Say Allow or Deny")),
  );
  TestValidator.equals(
    "and costs one of the declared rows rather than being drawn below them",
    hinted.filter((line) => line.startsWith("│")).length,
    2,
  );
  TestValidator.equals(
    "so the same geometry always draws the same number of rows",
    hinted.filter((line) => line.startsWith("│")).length,
    drawn.filter((line) => line.startsWith("│")).length,
  );
  TestValidator.equals(
    "and a frame without one has no compartment for it",
    drawn.some((line) => line.startsWith("├")),
    false,
  );

  TestValidator.predicate(
    "the grade is stated, so the notification rules are visible here",
    drawn[drawn.length - 1]!.includes("demand"),
  );

  // More lines than rows: the geometry wins, because the device would.
  const crowded: string[] = CodeHudTerminalCanvas.draw(
    frame({
      lines: [
        { text: "one", tone: "primary" },
        { text: "two", tone: "primary" },
        { text: "three", tone: "primary" },
      ],
    }),
    { columns: 24, rows: 2, colored: false },
  );
  TestValidator.equals(
    "a frame with more lines than rows is cut to the rows",
    crowded.filter((line) => line.startsWith("│")).length,
    2,
  );
  TestValidator.equals(
    "and the ones that did not fit are gone rather than wrapped",
    crowded.some((line) => line.includes("three")),
    false,
  );
}
