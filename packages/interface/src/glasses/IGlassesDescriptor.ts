/**
 * What a particular pair of glasses is and what it can do.
 *
 * The reducer composes against this and nothing else, which is what lets one
 * head-up display design survive the gap between a monocular two-line waveguide
 * and a device with a real framebuffer.
 *
 * @evidence requirements/glasses-device/device-abstraction.md#glasses-declared-geometry Exposes the manufacturer, model, and display extent a device must declare before any content can be composed for it.
 * @evidence specifications/device-surface/capability-and-input.md#spec-device-character-geometry Types the declaration the specification requires, in characters rather than pixels.
 * @author Samchon
 */
export interface IGlassesDescriptor {
  /**
   * Manufacturer key, such as `rokid`.
   *
   * Lowercase and stable. Used to select an adapter and to key any
   * vendor-specific workaround that cannot be expressed as a capability.
   */
  vendor: string;

  /**
   * Model key within the vendor.
   *
   * Two models from one vendor routinely differ in display geometry, so the
   * pair rather than the vendor alone identifies a rendering target.
   */
  model: string;

  /** Shape of the surface frames are rendered onto. */
  geometry: IGlassesDescriptor.IGeometry;

  /** Input and output channels the device actually offers. */
  capability: IGlassesDescriptor.ICapability;
}
export namespace IGlassesDescriptor {
  /**
   * Usable extent of the head-up display, in characters.
   *
   * Characters rather than pixels because every layout decision the reducer
   * makes is about how much text fits, and a device that renders a bitmap
   * still has to answer that question before it can lay one out. A device with
   * a framebuffer converts at the text size it has chosen and declares that.
   *
   * @evidence requirements/glasses-device/device-abstraction.md#glasses-declared-geometry Exposes the column, row, and color facts a device declares, which the display design must hold at two rows.
   * @evidence specifications/device-surface/capability-and-input.md#spec-device-character-geometry Types the three declared values and excludes pixel dimensions from the contract.
   */
  export interface IGeometry {
    /**
     * Characters that fit on one line at the display's chosen size.
     *
     * The reducer truncates and elides against this, so an adapter that
     * declares it optimistically produces text the wearer cannot read.
     */
    columns: number;

    /**
     * Lines visible at once.
     *
     * Two is a real value, not a degenerate one: several shipping devices
     * offer exactly that, and the composition rules are designed around it.
     */
    rows: number;

    /**
     * Whether the display can render more than one ink color.
     *
     * A monochrome waveguide expresses urgency through wording and position,
     * since it cannot express it through color.
     */
    colored: boolean;
  }

  /**
   * Channels a device offers beyond the display itself.
   *
   * Four of the five are optional on some shipping device, so the product asks
   * what a device offers rather than assuming a hardware profile. The
   * microphone is not optional: speech is the only instruction channel, so a
   * device that declares no microphone is refused at connection time.
   *
   * @evidence requirements/glasses-device/device-abstraction.md#glasses-negotiated-capability Exposes the five independently negotiated channels and the one that is mandatory.
   * @evidence specifications/device-surface/capability-and-input.md#spec-device-capability-channels Types the channel declaration the specification makes the basis of adapter operation availability.
   */
  export interface ICapability {
    /**
     * Whether the device can capture the wearer's speech.
     *
     * Mandatory. A device declaring `false` here is refused at connection
     * time with that reason stated, rather than connecting into a surface that
     * can display but never obey.
     */
    microphone: boolean;

    /**
     * Whether the device can play synthesized speech.
     *
     * The escape hatch for content that will not fit the display, and the only
     * route a demand-grade alert has to reach a wearer who is not looking.
     */
    speaker: boolean;

    /**
     * Whether the device can take a photograph.
     *
     * The input modality a desktop terminal cannot match, and the reason a
     * prompt carries images at all.
     */
    camera: boolean;

    /**
     * Whether the device reports discrete touch gestures.
     *
     * An accelerator only. Every operation it reaches is also reachable by
     * speech, because most shipping devices deliver no touch event to the
     * host that runs the client.
     */
    touchpad: boolean;

    /**
     * Whether the device reports head motion as gestures.
     *
     * An accelerator only, and never the sole route to an approval answer.
     */
    motion: boolean;
  }
}
