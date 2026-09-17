import type { IHudFrame } from "../hud/IHudFrame";
import type { IGlassesDescriptor } from "./IGlassesDescriptor";
import type { IGlassesInput } from "./IGlassesInput";

/**
 * Everything the project needs to know about one pair of glasses.
 *
 * The second adapter axis. An implementation owns a vendor transport and
 * nothing else: it draws the frames it is handed and reports the input it
 * observes, and decides the meaning of neither. If the same frame rendered
 * differently on two vendors' hardware, the interaction could not be tested
 * anywhere except on all of it at once.
 *
 * Speech capture is mandatory rather than optional. Speech is the only
 * instruction channel, so a device that cannot hear can display but never obey,
 * and connecting one produces a surface that looks live and cannot be driven.
 *
 * @evidence requirements/glasses-device/device-abstraction.md#glasses-adapter-renders-only Bounds the adapter to transport, drawing, sleep, and its declared channels, with no composition or interpretation.
 * @evidence specifications/device-surface/capability-and-input.md#spec-device-adapter-authority Types the upper bound on the adapter operation set the specification fixes.
 * @author Samchon
 */
export interface IGlassesAdapter {
  /** What this device is and what it can do. */
  readonly descriptor: IGlassesDescriptor;

  /**
   * Input as the wearer produces it, speech and gestures on one stream.
   *
   * A single stream rather than per-modality streams, because the client acts
   * on whichever answer arrives first and must not race two subscriptions.
   */
  readonly inputs: AsyncIterable<IGlassesInput>;

  /**
   * Establishes the vendor transport and readies the display.
   *
   * Resolves only once a frame would actually be seen, so the first frame is
   * never lost to a display that had not woken yet.
   *
   * Rejects when the device declares no microphone, naming that as the reason.
   * The refusal happens here rather than at the first failed instruction,
   * because a wearer must learn the device is undrivable before they rely on
   * it.
   */
  connect(): Promise<void>;

  /**
   * Tears the transport down and releases the device.
   *
   * Idempotent, since both the wearer and a shutdown handler may reach for it.
   */
  disconnect(): Promise<void>;

  /**
   * Draws one frame, replacing whatever was shown.
   *
   * Implementations compare {@link IHudFrame.key} against the frame already on
   * screen and skip the draw when they match. That comparison is the only
   * adapter-side optimization permitted, and it never alters the frame.
   */
  render(frame: IHudFrame): Promise<void>;

  /**
   * Puts the display to sleep without dropping the transport.
   *
   * Separate from disconnecting because the display is the expensive part: a
   * device stays paired and reachable for hours while showing nothing.
   */
  sleep(): Promise<void>;

  /**
   * Starts speech recognition and reports results on {@link inputs}.
   *
   * Mandatory, because speech is the only instruction channel. Recognition is
   * push-to-talk rather than always-on: a coding agent triggered by overheard
   * conversation is a hazard, not a feature.
   */
  listen(): Promise<void>;

  /**
   * Speaks text aloud.
   *
   * Present only where the device declared a speaker. Resolves when playback
   * finishes, so a caller can avoid talking over itself.
   */
  speak?(text: string): Promise<void>;

  /**
   * Takes one photograph through the device camera.
   *
   * Present only where the device declared a camera. Returns a `data:` URL
   * ready to attach to a prompt.
   */
  capture?(): Promise<string>;
}
