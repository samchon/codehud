import type {
  ICodeHudFrame,
  ICodeHudGlassesDescriptor,
} from "@codehud/interface";

/**
 * Draws a frame the way a pair of glasses would, into characters.
 *
 * A namespace: every function here is a pure function of a frame and a
 * geometry. That is the whole reason the simulator is worth having. A display
 * that renders correctly on a desk is not proof that a wearable will, but a
 * display whose drawing rules are wrong on a desk is proof that it will not,
 * and finding that out costs a test rather than a device.
 *
 * It draws a border, which a real display does not have. The border is the
 * point: it makes the declared geometry visible, so a reader can see that a
 * line which fits in the box is a line that fits on the glasses. Without it the
 * terminal's own width would silently stand in for the device's.
 *
 * @evidence requirements/glasses-device/device-abstraction.md#glasses-declared-geometry Renders at the declared geometry rather than at the terminal's, making the declaration the thing under test.
 * @evidence specifications/device-surface/capability-and-input.md#spec-device-character-geometry Draws within the declared columns and rows, so a frame that overflows is visible rather than absorbed.
 * @author Samchon
 */
export namespace CodeHudTerminalCanvas {
  /**
   * The lines a terminal prints for one frame.
   *
   * The hint occupies one of the declared rows rather than arriving below them.
   * That is how the composer counts it — it reserves a row before deciding how
   * much content fits — and a canvas that drew it as an extra row would show
   * three lines on a two-line device. A simulator more forgiving than the
   * hardware is the one failure it cannot afford, because everything it is used
   * to check would be checked against the wrong shape.
   *
   * Every returned line is exactly the same width, because a box whose sides do
   * not line up is a box a reader stops trusting to mean anything.
   */
  export const draw = (
    frame: ICodeHudFrame,
    geometry: ICodeHudGlassesDescriptor.IGeometry,
    props: IProps = {},
  ): string[] => {
    const width: number = Math.max(1, geometry.columns);
    const total: number = Math.max(0, geometry.rows);
    const content: number =
      frame.hint === undefined ? total : Math.max(0, total - 1);
    const rows: string[] = [];
    for (let i: number = 0; i < content; ++i)
      rows.push(pad(frame.lines[i]?.text ?? "", width));

    const top: string = `┌${"─".repeat(width)}┐`;
    const bottom: string = `└${"─".repeat(width)}┘`;
    const body: string[] = rows.map((row) => `│${row}│`);
    const hint: string[] =
      frame.hint === undefined ? [] : [`│${pad(frame.hint, width)}│`];

    return [
      ...(props.title === undefined ? [] : [label(props.title, width)]),
      top,
      ...body,
      ...(hint.length === 0 ? [] : [`├${"─".repeat(width)}┤`, ...hint]),
      bottom,
      ...(props.status === false ? [] : [status(frame, width)]),
    ];
  };

  /**
   * Cuts or pads one line to exactly the declared width.
   *
   * Cutting is a last resort and a visible failure: the composer is supposed to
   * have fitted the text already, so anything arriving too long means that
   * fitting is wrong. It is marked rather than silently trimmed, because a
   * simulator that quietly hides an overflow is a simulator that lets the
   * overflow ship.
   */
  export const pad = (text: string, width: number): string => {
    const flat: string = text.replace(/[\r\n]+/gu, " ");
    if (flat.length === width) return flat;
    if (flat.length < width) return flat + " ".repeat(width - flat.length);
    return width <= 1 ? "!" : `${flat.slice(0, width - 1)}!`;
  };

  /** The line under the box, naming the grade the frame carries. */
  export const status = (frame: ICodeHudFrame, width: number): string =>
    pad(` ${frame.urgency} · ${frame.kind}`, width + 2);

  /** The line above the box, naming what is being simulated. */
  export const label = (title: string, width: number): string =>
    pad(` ${title}`, width + 2);

  /** What to draw besides the frame itself. */
  export interface IProps {
    /** A name for the device being stood in for. */
    title?: string;

    /** Whether to print the grade line; false for a quieter transcript. */
    status?: boolean;
  }
}
