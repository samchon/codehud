import type {
  ICodeHudAgentPermission,
  ICodeHudContext,
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
 * A class rather than a namespace because every word the display originates
 * comes from a configuration rather than from a literal here. What fills a
 * narrow screen when the agent has reported nothing is a product decision a
 * wearer will hear hundreds of times, and burying it in this file would make
 * it untranslatable and invisible.
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
export class CodeHudComposer {
  /** Constructs a composer bound to one configuration. */
  public constructor(private readonly context: ICodeHudContext) {}

  /**
   * Builds the frame a device should currently show.
   *
   * Never returns content exceeding the geometry. Where the situation needs
   * more room than the device has, the hint is dropped before a line is, since
   * a wearer who cannot read the subject of an approval cannot answer it
   * whether or not they know the words.
   */
  public compose(
    state: ICodeHudState,
    geometry: ICodeHudGlassesDescriptor.IGeometry,
  ): ICodeHudFrame {
    if (state.fault !== undefined) return this.fault(state.fault, geometry);
    if (state.pending !== undefined)
      return this.permission(state.pending, geometry);
    if (state.review.active === true) return this.review(state, geometry);
    switch (state.activity) {
      case "connecting":
        return this.finish("status", "ambient", [
          this.line(this.context.vocabulary.connecting, "secondary", geometry),
        ]);
      case "thinking":
      case "working":
        return this.progress(state, geometry);
      case "done":
        return this.result(state, geometry);
      case "waiting":
      case "idle":
      case "fault":
        return this.idle(state, geometry);
    }
  }

  private permission(
    pending: NonNullable<ICodeHudState["pending"]>,
    geometry: ICodeHudGlassesDescriptor.IGeometry,
  ): ICodeHudFrame {
    const { hint, room } = this.layout(
      geometry,
      this.utterances(pending.options, geometry),
    );
    const lines: ICodeHudFrame.ILine[] = [
      this.line(pending.title, "alert", geometry),
    ];
    if (room >= 2 && pending.detail !== undefined)
      lines.push(this.line(pending.detail, "secondary", geometry));
    return this.finish("permission", "demand", lines.slice(0, room), hint);
  }

  private progress(
    state: ICodeHudState,
    geometry: ICodeHudGlassesDescriptor.IGeometry,
  ): ICodeHudFrame {
    const { hint, room } = this.layout(
      geometry,
      geometry.rows >= 3
        ? CodeHudText.fit(this.context.vocabulary.interrupt, geometry.columns)
        : undefined,
    );

    if (state.message.trim().length !== 0)
      return this.finish(
        "stream",
        "notice",
        CodeHudText.tail(state.message, geometry.columns, room).map((text) => ({
          text,
          tone: "primary" as const,
        })),
        hint,
      );

    const running: ICodeHudState.IEntry | undefined = state.history[0];
    const standing: string =
      state.activity === "thinking"
        ? this.context.vocabulary.thinking
        : this.context.vocabulary.working;
    const lines: ICodeHudFrame.ILine[] = [
      this.line(running?.title ?? standing, "primary", geometry),
    ];
    if (room >= 2 && state.session !== undefined)
      lines.push(this.directory(state.session.directory, geometry));
    return this.finish("status", "ambient", lines.slice(0, room), hint);
  }

  private result(
    state: ICodeHudState,
    geometry: ICodeHudGlassesDescriptor.IGeometry,
  ): ICodeHudFrame {
    const last: NonNullable<ICodeHudState["last"]> | undefined = state.last;
    if (last === undefined) return this.idle(state, geometry);
    const failed: boolean = last.outcome === "error";
    const lines: ICodeHudFrame.ILine[] = [
      this.line(last.summary, failed ? "alert" : "primary", geometry),
    ];
    if (geometry.rows >= 2)
      lines.push(
        this.line(
          `${this.verdict(last.outcome)} · ${CodeHudText.elapsed(last.elapsed)}`,
          "muted",
          geometry,
        ),
      );
    return this.finish(
      "result",
      failed ? "demand" : "notice",
      lines.slice(0, geometry.rows),
    );
  }

  private review(
    state: ICodeHudState,
    geometry: ICodeHudGlassesDescriptor.IGeometry,
  ): ICodeHudFrame {
    const entry: ICodeHudState.IEntry | undefined =
      state.history[state.review.offset];
    if (entry === undefined) return this.idle(state, geometry);

    const { hint, room } = this.layout(
      geometry,
      geometry.rows >= 3
        ? CodeHudText.fit(this.context.vocabulary.review, geometry.columns)
        : undefined,
    );
    const lines: ICodeHudFrame.ILine[] = [
      this.line(entry.title, this.emphasis(entry), geometry),
    ];
    if (room >= 2)
      lines.push(
        this.line(
          `${state.review.offset + 1} ${this.context.vocabulary.within} ${state.history.length}`,
          "muted",
          geometry,
        ),
      );
    return this.finish("review", "ambient", lines.slice(0, room), hint);
  }

  private idle(
    state: ICodeHudState,
    geometry: ICodeHudGlassesDescriptor.IGeometry,
  ): ICodeHudFrame {
    const lines: ICodeHudFrame.ILine[] = [];
    if (state.session !== undefined)
      lines.push(this.directory(state.session.directory, geometry));
    if (geometry.rows >= 2 && state.last !== undefined)
      lines.push(this.line(state.last.summary, "muted", geometry));
    if (lines.length === 0)
      lines.push(this.line(this.context.vocabulary.ready, "muted", geometry));
    return this.finish("idle", "ambient", lines.slice(0, geometry.rows));
  }

  private fault(
    message: string,
    geometry: ICodeHudGlassesDescriptor.IGeometry,
  ): ICodeHudFrame {
    return this.finish("fault", "demand", [
      this.line(message, "alert", geometry),
    ]);
  }

  /**
   * Builds the spoken hint for a pending approval, when both answers exist.
   *
   * Names the labels the harness reported rather than the configured consent
   * tokens, because the options are data and a wearer answering with a word the
   * harness does not offer has not answered. The persisting option is never
   * named, since it must not be the easiest answer to give.
   */
  private utterances(
    options: ICodeHudAgentPermission[],
    geometry: ICodeHudGlassesDescriptor.IGeometry,
  ): string | undefined {
    const yes: ICodeHudAgentPermission | undefined = options.find(
      (o) => o.affirmative === true && o.persistent === false,
    );
    const no: ICodeHudAgentPermission | undefined = options.find(
      (o) => o.affirmative === false,
    );
    if (yes === undefined || no === undefined) return undefined;
    const { say, or } = this.context.vocabulary;
    const full: string = `${say} ${yes.label} ${or} ${no.label}`;
    return full.length <= geometry.columns
      ? full
      : CodeHudText.fit(`${yes.label} / ${no.label}`, geometry.columns);
  }

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
  private layout(
    geometry: ICodeHudGlassesDescriptor.IGeometry,
    candidate: string | undefined,
  ): { hint: string | undefined; room: number } {
    return candidate === undefined || geometry.rows < 2
      ? { hint: undefined, room: geometry.rows }
      : { hint: candidate, room: geometry.rows - 1 };
  }

  /**
   * How much weight a reviewed entry carries.
   *
   * A wearer walking back through a turn on a monochrome two-line display has
   * only the text and its emphasis to tell a turn summary from a tool call.
   * Emphasis carries that rather than a leading marker, because a marker would
   * cost a column on the surface that has fewest of them.
   */
  private emphasis(entry: ICodeHudState.IEntry): ICodeHudFrame.ILine.Tone {
    if (entry.failed === true) return "alert";
    switch (entry.kind) {
      case "result":
        return "primary";
      case "message":
        return "secondary";
      case "tool":
        return "muted";
    }
  }

  private verdict(outcome: "success" | "error" | "interrupted"): string {
    const { succeeded, stopped, failed } = this.context.vocabulary;
    return outcome === "success"
      ? succeeded
      : outcome === "interrupted"
        ? stopped
        : failed;
  }

  private directory(
    value: string,
    geometry: ICodeHudGlassesDescriptor.IGeometry,
  ): ICodeHudFrame.ILine {
    return {
      text: CodeHudText.path(value, geometry.columns),
      tone: "muted",
    };
  }

  private line(
    text: string,
    tone: ICodeHudFrame.ILine.Tone,
    geometry: ICodeHudGlassesDescriptor.IGeometry,
  ): ICodeHudFrame.ILine {
    return {
      text: CodeHudText.fit(text, geometry.columns),
      tone,
    };
  }

  private finish(
    kind: ICodeHudFrame.Kind,
    urgency: ICodeHudFrame.Urgency,
    lines: ICodeHudFrame.ILine[],
    hint?: string,
  ): ICodeHudFrame {
    return {
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
    };
  }
}
