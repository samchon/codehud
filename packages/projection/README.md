# `@codehud/projection`

The projection boundary: the reducer that folds a coding agent's observations into state, and the composer that turns that state into the content one device should show.

## Why it exists

An agent produces thousands of tokens per turn. A wearable display carries two lines and holds a wearer's attention for about two seconds. Closing that gap is the product, and this package is where it happens.

## Two stages, deliberately separate

`CodeHudReducer` folds observations into `ICodeHudState`. It reads no column count, no clock, no random source, and no input or output, so a recorded observation stream replays to the same state every time. That purity is what makes the most important logic in the product testable with no hardware and no socket.

`CodeHudComposer` projects that state against one device's geometry. It is the only place in the repository that knows a display is two lines wide.

The split is what lets two devices attach to one session, share the state, and each render what their own surface can carry.

## Invariants worth knowing

- Composed content always fits the geometry it was given, at every content kind and down to a single row. An adapter draws it without measuring anything.
- Where the situation needs more room than the device has, the spoken hint is dropped before a line of content is.
- Folding an observation the state has already seen returns the state unchanged, so a reconnecting device replays safely.
- A late observation never rewinds the display.

## Contract traceability

Every export cites the requirement and specification it realizes. Run `pnpm run evidence` from the workspace root.
