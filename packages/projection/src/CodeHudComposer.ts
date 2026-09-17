import type {
  ICodeHudAgentPermission,
  ICodeHudFrame,
  ICodeHudGlassesDescriptor,
  ICodeHudState,
} from "@codehud/interface";

import { CodeHudText } from "./CodeHudText";

/**
 * Projects reducer state onto the display of one particular device.
 *
 * The only place in the product that knows a display is two lines wide. Keeping
 * it separate from the fold is what lets a phone, a pair of glasses, and a
 * terminal simulator watch one session and each show the version of it their
 * surface can carry.
 *
 * Total on its inputs: the frame it returns always fits the geometry it was
 * given, at every content kind and down to a single row, so an adapter draws it
 * without measuring anything.
 *
 * @evidence requirements/head-up-display/glanceable-rendering.md#hud-prefitted-frame Produces content already fitted to the declared geometry, deciding what to drop rather than leaving an adapter to clip.
 * @evidence requirements/head-up-display/glanceable-rendering.md#hud-urgency Assigns every frame one of three grades, with the approval request and the fatal fault at the highest.
 * @evidence requirements/head-up-display/glanceable-rendering.md#hud-reviewable-history Renders the retained history at the cursor, recomputing the window rather than assuming a scroll container.
 * @evidence specifications/display-projection/frame-and-state.md#spec-projection-frame-fits Implements the column and row invariant over lines plus the optional hint.
 * @evidence specifications/display-projection/frame-and-state.md#spec-projection-urgency-grade Implements the mandatory grade and the content key an adapter compares to skip a redundant draw.
 * @evidence specifications/display-projection/frame-and-state.md#spec-projection-review-traversal Implements the cursor traversal with no device scroll primitive assumed.
 * @author Samchon
 */
export namespace CodeHudComposer {
  /**
   * Builds the frame a device should currently show.
   *
   * Never returns content exceeding the geometry. Where the situation needs
   * more room than the device has, the hint is dropped before a line is, since
   * a wearer who cannot read the subject of an approval cannot answer it
   * whether or not they know the words.
   */
  export const compose = (
    state: ICodeHudState,
    geometry: ICodeHudGlassesDescriptor.IGeometry,
  ): ICodeHudFrame => {
    if (state.fault !== undefined) return fault(state.fault, geometry);
    if (state.pending !== undefined) return permission(state.pending, geometry);
    if (state.review.active === true) return review(state, geometry);
    switch (state.activity) {
      case "connecting":
        return finish("status", "ambient", [
          line("Connecting", "secondary", geometry),
        ]);
      case "thinking":
      case "working":
        return progress(state, geometry);
      case "done":
        return result(state, geometry);
      case "waiting":
      case "idle":
      case "fault":
        return idle(state, geometry);
    }
  };

  const permission = (
    pending: NonNullable<ICodeHudState["pending"]>,
    geometry: ICodeHudGlassesDescriptor.IGeometry,
  ): ICodeHudFrame => {
    const { hint, room } = layout(
      geometry,
      utterances(pending.options, geometry),
    );
    const lines: ICodeHudFrame.ILine[] = [
      line(pending.title, "alert", geometry),
    ];
    if (room >= 2 && pending.detail !== undefined)
      lines.push(line(pending.detail, "secondary", geometry));
    return finish("permission", "demand", lines.slice(0, room), hint);
  };

  const progress = (
    state: ICodeHudState,
    geometry: ICodeHudGlassesDescriptor.IGeometry,
  ): ICodeHudFrame => {
    const { hint, room } = layout(
      geometry,
      geometry.rows >= 3
        ? CodeHudText.fit("Say stop", geometry.columns)
        : undefined,
    );

    if (state.message.trim().length !== 0)
      return finish(
        "stream",
        "notice",
        CodeHudText.tail(state.message, geometry.columns, room).map((text) => ({
          text,
          tone: "primary" as const,
        })),
        hint,
      );

    const running: ICodeHudState.IEntry | undefined = state.history[0];
    const lines: ICodeHudFrame.ILine[] = [
      line(
        running?.title ??
          (state.activity === "thinking" ? "Thinking" : "Working"),
        "primary",
        geometry,
      ),
    ];
    if (room >= 2 && state.session !== undefined)
      lines.push(directory(state.session.directory, geometry));
    return finish("status", "ambient", lines.slice(0, room), hint);
  };

  const result = (
    state: ICodeHudState,
    geometry: ICodeHudGlassesDescriptor.IGeometry,
  ): ICodeHudFrame => {
    const last: NonNullable<ICodeHudState["last"]> | undefined = state.last;
    if (last === undefined) return idle(state, geometry);
    const failed: boolean = last.outcome === "error";
    const lines: ICodeHudFrame.ILine[] = [
      line(last.summary, failed ? "alert" : "primary", geometry),
    ];
    if (geometry.rows >= 2)
      lines.push(
        line(
          `${verdict(last.outcome)} · ${CodeHudText.elapsed(last.elapsed)}`,
          "muted",
          geometry,
        ),
      );
    return finish(
      "result",
      failed ? "demand" : "notice",
      lines.slice(0, geometry.rows),
    );
  };

  const review = (
    state: ICodeHudState,
    geometry: ICodeHudGlassesDescriptor.IGeometry,
  ): ICodeHudFrame => {
    const entry: ICodeHudState.IEntry | undefined =
      state.history[state.review.offset];
    if (entry === undefined) return idle(state, geometry);

    const { hint, room } = layout(
      geometry,
      geometry.rows >= 3
        ? CodeHudText.fit("Say back, forward, or latest", geometry.columns)
        : undefined,
    );
    const lines: ICodeHudFrame.ILine[] = [
      line(entry.title, entry.failed ? "alert" : "primary", geometry),
    ];
    if (room >= 2)
      lines.push(
        line(
          `${state.review.offset + 1} of ${state.history.length}`,
          "muted",
          geometry,
        ),
      );
    return finish("review", "ambient", lines.slice(0, room), hint);
  };

  const idle = (
    state: ICodeHudState,
    geometry: ICodeHudGlassesDescriptor.IGeometry,
  ): ICodeHudFrame => {
    const lines: ICodeHudFrame.ILine[] = [];
    if (state.session !== undefined)
      lines.push(directory(state.session.directory, geometry));
    if (geometry.rows >= 2 && state.last !== undefined)
      lines.push(line(state.last.summary, "muted", geometry));
    if (lines.length === 0) lines.push(line("Ready", "muted", geometry));
    return finish("idle", "ambient", lines.slice(0, geometry.rows));
  };

  const fault = (
    message: string,
    geometry: ICodeHudGlassesDescriptor.IGeometry,
  ): ICodeHudFrame =>
    finish("fault", "demand", [line(message, "alert", geometry)]);

  /**
   * Builds the spoken hint for a pending approval, when both answers exist.
   *
   * Names the labels the harness reported rather than a fixed pair, because the
   * options are data and a wearer answering with a word the harness does not
   * offer has not answered. The persisting option is never named, since it must
   * not be the easiest answer to give.
   */
  const utterances = (
    options: ICodeHudAgentPermission[],
    geometry: ICodeHudGlassesDescriptor.IGeometry,
  ): string | undefined => {
    const yes: ICodeHudAgentPermission | undefined = options.find(
      (o) => o.affirmative === true && o.persistent === false,
    );
    const no: ICodeHudAgentPermission | undefined = options.find(
      (o) => o.affirmative === false,
    );
    if (yes === undefined || no === undefined) return undefined;
    const full: string = `Say ${yes.label} or ${no.label}`;
    return full.length <= geometry.columns
      ? full
      : CodeHudText.fit(`${yes.label} / ${no.label}`, geometry.columns);
  };

  /**
   * Decides whether the hint survives, and how many rows remain for content.
   *
   * A hint costs a whole row, so on a single-row device it is dropped rather
   * than squeezed. A wearer who cannot read the subject of an approval cannot
   * answer it whether or not they know the words.
   *
   * Returning the pair together is what makes the row invariant structural
   * rather than a rule three call sites have to remember separately. The
   * earlier shape clamped the room to at least one row and left the hint in
   * place, which let a pending approval emit two rows onto a one-row display.
   */
  const layout = (
    geometry: ICodeHudGlassesDescriptor.IGeometry,
    candidate: string | undefined,
  ): { hint: string | undefined; room: number } =>
    candidate === undefined || geometry.rows < 2
      ? { hint: undefined, room: geometry.rows }
      : { hint: candidate, room: geometry.rows - 1 };

  const verdict = (outcome: "success" | "error" | "interrupted"): string =>
    outcome === "success"
      ? "Done"
      : outcome === "interrupted"
        ? "Stopped"
        : "Failed";

  const directory = (
    value: string,
    geometry: ICodeHudGlassesDescriptor.IGeometry,
  ): ICodeHudFrame.ILine => ({
    text: CodeHudText.path(value, geometry.columns),
    tone: "muted",
  });

  const line = (
    text: string,
    tone: ICodeHudFrame.ILine.Tone,
    geometry: ICodeHudGlassesDescriptor.IGeometry,
  ): ICodeHudFrame.ILine => ({
    text: CodeHudText.fit(text, geometry.columns),
    tone,
  });

  const finish = (
    kind: ICodeHudFrame.Kind,
    urgency: ICodeHudFrame.Urgency,
    lines: ICodeHudFrame.ILine[],
    hint?: string,
  ): ICodeHudFrame => ({
    key: [
      kind,
      urgency,
      ...lines.map((l) => `${l.tone}:${l.text}`),
      hint ?? "",
    ].join(""),
    kind,
    lines,
    hint,
    urgency,
  });
}
