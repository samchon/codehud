# Capability and Input

## The surface declaration contract {#device-surface-declaration}

What a device adapter must state when it connects, and what those statements oblige elsewhere.

### Geometry is declared in characters {#spec-device-character-geometry}

<!-- @evidence requirements/glasses-device/device-abstraction.md#glasses-declared-geometry Refines geometry declaration into a three-value structure of columns, rows, and color availability. -->

A device identifier carries a manufacturer key, a model key, and the display geometry. Geometry is the number of characters that fit on one line, the number of lines visible at once, and whether more than one ink color is available.

Pixel dimensions are not part of geometry. A device with a framebuffer converts to columns and rows at the text size it has chosen and declares those. The declared values are the ones that are actually legible, because an optimistic declaration produces unreadable output.

Two rows is a valid declaration, and the projection boundary produces every content kind at that value.

### Capability is five independent channels {#spec-device-capability-channels}

<!-- @evidence requirements/glasses-device/device-abstraction.md#glasses-negotiated-capability Refines capability negotiation into five independent channel declarations with one mandatory channel and optional adapter operations. -->

Capability is the availability of five channels: microphone, speaker, camera, touch surface, and head motion. Each is independent, and one being available implies nothing about another.

The microphone channel is mandatory. A device that declares it unavailable is refused at connection time with that reason stated, because speech is the only instruction channel and a device that cannot hear cannot be obeyed.

An adapter exposes no operation corresponding to a channel it did not declare, and callers check the declaration before reaching for one. The absence of a channel is never reported as an error at call time.

### Input is a three-member union with one required member {#spec-device-input-vocabulary}

<!-- @evidence requirements/glasses-device/device-abstraction.md#glasses-input-vocabulary Refines the input vocabulary into a closed union whose speech member is required and whose gesture members are optional accelerators. -->

Input is a closed discriminated union of recognized speech, touch gesture, and head gesture. No member carries coordinates.

Speech is reported as interim results followed by exactly one final result, and only a final result may act. Every operation the system offers is reachable through speech alone.

Touch and head gestures are optional accelerators bound only to operations speech already reaches. Where a touch surface is present, a single light contact carries no negative, destructive, or interrupting meaning; those meanings bind to a sustained contact. Head gestures are never the sole route to an approval answer.

### The limit of adapter authority {#spec-device-adapter-authority}

<!-- @evidence requirements/glasses-device/device-abstraction.md#glasses-adapter-renders-only Refines the render-only rule into an upper bound on the adapter's operation set. -->

A device adapter's operations are limited to transport connect and disconnect, drawing the content it was handed, putting the display to sleep, and the optional operations matching the channels it declared. Composing, eliding, rearranging display content, and assigning meaning to input or to an utterance are not the adapter's authority.

The adapter compares handed content against what it currently shows and skips a redundant draw. That is the only adapter-side optimization permitted, and it never alters the content itself.
