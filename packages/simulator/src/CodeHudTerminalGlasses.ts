import type {
  ICodeHudFrame,
  ICodeHudGlassesAdapter,
  ICodeHudGlassesDescriptor,
  ICodeHudGlassesInput,
} from "@codehud/interface";

import { CodeHudTerminalCanvas } from "./CodeHudTerminalCanvas";

/**
 * A terminal standing in for a pair of glasses.
 *
 * A class, and a facade controller: it owns a stream of lines, a rendering
 * destination, and the sleeping state. Every rule about *how* a frame is drawn
 * lives in {@link CodeHudTerminalCanvas} and is pure; what is left here is the
 * stream, the console, and the one comparison the adapter contract permits an
 * adapter to make for itself.
 *
 * ## Typed input, and why it does not break the no-keyboard rule
 *
 * The specification is absolute: no contract in the system accepts a character
 * sequence originating from wearer keystrokes, anywhere. This adapter reads
 * lines a person typed.
 *
 * It does not break the rule, because what it emits is a finalized speech
 * recognition result — the only wearer-originated text the system admits. The
 * keyboard here is a recognizer's front end, standing where a microphone stands
 * on real hardware. No contract downstream learns the difference, and none is
 * offered a character sequence as such.
 *
 * What this **does** exclude is worth stating plainly, because it is a limit on
 * what the simulator can prove rather than a technicality:
 *
 * - **Confidence is always certain.** A keyboard does not mishear. So the
 *   consent floor is never exercised here, and a session run entirely in this
 *   simulator has tested nothing about the rule that protects approvals from
 *   misrecognition. That rule is exercised by the router's own cases and by
 *   hardware, never by this.
 * - **There is no push-to-talk.** Recognition here begins when a line is typed
 *   rather than on an explicit wearer action with a terminating condition, so
 *   the capture discipline the specification fixes is likewise untested here.
 *
 * A simulator that hid either of those would be worse than no simulator, since
 * it would produce confidence in a path nobody had checked.
 *
 * @evidence requirements/glasses-device/device-abstraction.md#glasses-declared-geometry Declares a geometry and renders within it, so the declaration is what the display is judged against.
 * @evidence specifications/device-surface/capability-and-input.md#spec-device-character-geometry Implements a device whose declared columns and rows are the ones actually drawn.
 * @evidence specifications/voice-surface/utterance-routing.md#spec-voice-no-text-entry Emits typed lines as finalized recognition results rather than as character input, and records what that substitution cannot exercise.
 * @author Samchon
 */
export class CodeHudTerminalGlasses implements ICodeHudGlassesAdapter {
  private asleep: boolean = false;
  private listening: boolean = false;

  /**
   * The key of what this terminal last drew.
   *
   * Empty before anything has been drawn, which no frame's key can equal: a
   * key always carries at least a kind and a grade.
   */
  private shown: string = "";

  /** Constructs a simulator at a stated geometry. */
  public constructor(private readonly props: CodeHudTerminalGlasses.IProps) {}

  /** What this device claims to be, and what it can do. */
  public get descriptor(): ICodeHudGlassesDescriptor {
    return {
      vendor: "CodeHUD",
      model: "Terminal simulator",
      geometry: this.props.geometry,
      capability: {
        microphone: true,
        speaker: false,
        camera: false,
        touchpad: false,
        motion: false,
      },
    };
  }

  /**
   * Lines a person typed, presented as finalized recognition results.
   *
   * Confidence is stated as certain, because a keyboard does not mishear. That
   * is a fact about this simulator rather than a claim about recognition, and
   * it is why the consent floor cannot be exercised here.
   */
  public get inputs(): AsyncIterable<ICodeHudGlassesInput> {
    const lines: AsyncIterable<string> = this.props.lines;
    return {
      [Symbol.asyncIterator]:
        async function* (): AsyncGenerator<ICodeHudGlassesInput> {
          for await (const line of lines) {
            const text: string = line.trim();
            if (text.length === 0) continue;
            yield { type: "speech", text, final: true, confidence: 1 };
          }
        },
    };
  }

  /**
   * Nothing to open: a terminal is already there.
   *
   * Deliberately not a wake. Transport and display are the same thing here and
   * nowhere else, and an adapter that lit its display on connect would let a
   * host get away with reconnecting to show a line — which on hardware ends a
   * session to draw one.
   */
  public async connect(): Promise<void> {}

  /** Nothing to close either. */
  public async disconnect(): Promise<void> {
    this.listening = false;
  }

  /**
   * Draws one frame, unless the display is asleep.
   *
   * A sleeping display shows nothing, which is the behaviour a device adapter
   * has to have for the notification grades to mean anything: if a sleeping
   * simulator drew anyway, the difference between a grade that may wake it and
   * one that may not would be invisible here.
   */
  public async render(frame: ICodeHudFrame): Promise<void> {
    if (this.asleep === true) return;
    // The comparison the adapter contract requires of every implementation,
    // and the only optimization it permits. A terminal has no screen to read
    // back, so what is already shown is the last thing written; without this a
    // streaming turn prints one box per token and the scrollback a wearer is
    // meant to read becomes the thing hiding what they wanted.
    if (frame.key === this.shown) return;
    this.shown = frame.key;
    for (const line of CodeHudTerminalCanvas.draw(frame, this.props.geometry, {
      title: `${this.descriptor.model}${this.listening === true ? " · listening" : ""}`,
    }))
      this.props.write(line);
  }

  /**
   * Puts the display to sleep, so a grade that may not wake it shows nothing.
   *
   * Forgets what was drawn as well. A display that woke to find the frame
   * unchanged would skip the draw and show nothing at all, which is the one
   * outcome waking exists to prevent.
   */
  public async sleep(): Promise<void> {
    this.asleep = true;
    this.shown = "";
  }

  /**
   * Lights the display again.
   *
   * Forgets the last key for the same reason sleeping does: a display that went
   * dark and then skipped the next draw as unchanged would wake to nothing,
   * which is the one outcome waking exists to prevent.
   */
  public async wake(): Promise<void> {
    this.asleep = false;
    this.shown = "";
  }

  /**
   * Begins capture.
   *
   * Marked in the title rather than enforced. There is no push-to-talk here: a
   * typed line arrives whether or not this was called, which is one of the two
   * things this simulator cannot exercise.
   */
  public async listen(): Promise<void> {
    this.asleep = false;
    this.listening = true;
    // Capture is marked in the title, so what is drawn changes even when the
    // frame does not. Forgetting the last key is what lets the next draw say
    // so instead of being skipped as unchanged.
    this.shown = "";
  }
}
export namespace CodeHudTerminalGlasses {
  /** What the simulator needs to stand in for a device. */
  export interface IProps {
    /** The geometry being simulated, which is what frames are judged against. */
    geometry: ICodeHudGlassesDescriptor.IGeometry;

    /** Lines a person typed. */
    lines: AsyncIterable<string>;

    /** Where a drawn line goes. */
    write: (line: string) => void;
  }
}
