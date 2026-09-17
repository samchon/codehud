# Device Abstraction

## Absorbing the difference between devices {#glasses-device-absorption}

The supported range runs from a two-line monochrome waveguide to a device with a real framebuffer. One interaction design has to survive that whole span.

### A device declares its own geometry {#glasses-declared-geometry}

Each device adapter declares how many characters fit on a line and how many lines are visible at once. Characters rather than pixels, because every layout decision the product makes is a decision about how much text fits, and a device with a framebuffer still has to answer that question before it can lay anything out.

Two lines is a real shipping value, not a degenerate one, and the display design must hold at that value. An adapter that declares its geometry optimistically produces text the wearer cannot read, so the declared numbers must be what is actually legible.

### Capability is negotiated, never assumed {#glasses-negotiated-capability}

Microphone, speaker, camera, touch surface, and head motion are each absent on some shipping device. The product asks what a device offers and composes the interaction from that, rather than assuming a hardware profile.

One capability is not negotiable. Because speech is the only instruction channel, a device with no route to the wearer's voice cannot be driven by this product and must be rejected at connection time with that reason stated, rather than connecting into a surface that can display but never obey.

A missing capability is a supported mode, not a fault. A device without a camera simply never offers to attach a photograph.

### Voice is first-class; everything else is optional {#glasses-input-vocabulary}

The input vocabulary is reported in terms every supported device can produce, and speech is its only required member. Recognized speech arrives as interim results followed by a final one, because a wearer will not trust a recognizer they cannot watch keeping up, and only a final result may act.

Touch and head gestures are optional accelerators for what speech can already do. No interaction may exist that is reachable only through them, and no device may be required to report them. Where they are present, a light single contact must never carry a negative or destructive meaning, because an accidental denial or interruption costs as much as an accidental approval.

Input carries no coordinates. None of the supported devices agree on a coordinate space and no interaction in this product needs one.

### An adapter renders and reports; it does not interpret {#glasses-adapter-renders-only}

A device adapter draws the content it is handed and reports the input it observes. It decides the meaning of neither.

Composing, shortening, or rearranging display content is not an adapter's authority, and neither is deciding what a gesture or an utterance means. If the same content rendered differently on two vendors' hardware, the interaction could not be tested anywhere except on all of it at once.

The one optimization an adapter owns is refusing to redraw content identical to what is already on screen. A waveguide redrawn on every streamed token is unreadable.
