/**
 * Text fitting for displays measured in characters rather than pixels.
 *
 * Every helper takes a column budget and returns something that provably fits
 * it. Nothing here hands a caller a string it would have to clip, because a
 * clipped line and a finished line look identical on a waveguide.
 *
 * Public rather than internal to the composer. A device adapter that has to
 * render something the composer did not produce, a pairing code or a connection
 * failure, needs the same fitting rules, and a second implementation of them
 * would be a second set of truncation bugs.
 *
 * @evidence requirements/head-up-display/glanceable-rendering.md#hud-prefitted-frame Produces text already fitted to the device, which is what lets a frame arrive needing no clipping.
 * @evidence specifications/display-projection/frame-and-state.md#spec-projection-frame-fits Implements the three fitting rules the specification names: marked truncation, path elision from the left, and tail retention for streaming prose.
 * @author Samchon
 */
export namespace CodeHudText {
  /**
   * Marker appended to text that had to be cut.
   *
   * One character rather than three dots, because a two-line display cannot
   * spare two columns to say that it ran out of columns.
   */
  export const ELLIPSIS = "…";

  /**
   * Cuts text to a column budget, marking it when anything was lost.
   *
   * Collapses interior whitespace first. Streamed agent output arrives with
   * newlines and runs of spaces that mean nothing on a single-line display and
   * would otherwise spend the budget on emptiness.
   */
  export const fit = (text: string, columns: number): string => {
    if (columns <= 0) return "";
    const flat: string = text.replace(/\s+/gu, " ").trim();
    if (flat.length <= columns) return flat;
    if (columns === 1) return ELLIPSIS;
    return flat.slice(0, columns - 1) + ELLIPSIS;
  };

  /**
   * Shortens a filesystem path from the left, keeping the parts that identify.
   *
   * The tail of a path tells a wearer which file an approval would modify; the
   * head is almost always a home directory they already know. So leading
   * segments are dropped rather than trailing characters.
   */
  export const path = (value: string, columns: number): string => {
    if (columns <= 0) return "";
    const flat: string = value.replace(/\\/gu, "/");
    if (flat.length <= columns) return flat;

    const segments: string[] = flat.split("/").filter((s) => s.length !== 0);
    const taken: string[] = [];
    let width: number = ELLIPSIS.length;
    for (let i: number = segments.length - 1; i >= 0; --i) {
      const next: number = width + segments[i]!.length + 1;
      if (next > columns) break;
      taken.unshift(segments[i]!);
      width = next;
    }
    if (taken.length === 0) return fit(segments.at(-1) ?? flat, columns);
    return ELLIPSIS + "/" + taken.join("/");
  };

  /**
   * Wraps text into lines of a column budget, keeping only the newest ones.
   *
   * Streaming prose is read from the bottom: the wearer wants the words that
   * just arrived, not the opening of a paragraph that already scrolled past the
   * two lines they have.
   */
  export const tail = (
    text: string,
    columns: number,
    rows: number,
  ): string[] => {
    if (rows <= 0 || columns <= 0) return [];
    const flat: string = text.replace(/\s+/gu, " ").trim();
    if (flat.length === 0) return [];

    const lines: string[] = [];
    let current: string = "";
    for (const word of flat.split(" ")) {
      if (current.length === 0) current = word;
      else if (current.length + 1 + word.length <= columns)
        current = current + " " + word;
      else {
        lines.push(current);
        current = word;
      }
      while (current.length > columns) {
        lines.push(current.slice(0, columns));
        current = current.slice(columns);
      }
    }
    if (current.length !== 0) lines.push(current);
    return lines.slice(-rows);
  };

  /**
   * Renders a millisecond duration in the coarsest unit that stays honest.
   *
   * A wearer compares an elapsed time to their own patience and never to
   * another measurement, so precision beyond one significant unit is display
   * width spent on nothing.
   */
  export const elapsed = (ms: number): string => {
    const total: number = Math.max(0, Math.round(ms / 1000));
    if (total < 60) return `${total}s`;
    const minutes: number = Math.floor(total / 60);
    if (minutes < 60) return `${minutes}m ${total % 60}s`;
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  };
}
