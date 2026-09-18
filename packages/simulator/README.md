# `@codehud/simulator`

A terminal standing in for a pair of glasses.

## Why it exists

To make a wearable's constraints visible on a desk. Its one obligation is therefore **not to be more forgiving than the device**: a box that quietly absorbed an overlong line, or that took the terminal's width instead of the declared one, would grant confidence in a layout nobody had checked. That is worse than having no simulator.

```text
 Terminal simulator · listening
┌────────────────────────────────────────┐
│Write packages/agent/src/index.ts       │
├────────────────────────────────────────┤
│Say Allow or Deny                       │
└────────────────────────────────────────┘
 demand · permission
```

The border is the point. It makes the declared geometry visible, so a line that fits in the box is a line that fits on the glasses.

## Public surface

| Export | Shape | What it does |
| --- | --- | --- |
| `CodeHudTerminalCanvas` | namespace | Frame plus geometry to characters. Pure |
| `CodeHudTerminalGlasses` | class | The adapter: draws, sleeps, reads typed speech |
| `CodeHudDeskAction` | namespace | What a routed utterance does to the session. Pure |
| `CodeHudDeskCommand` | class | The desk host: a socket, a session, and this adapter |

An overflow is **marked, not trimmed**. The composer is supposed to have fitted the text already, so anything arriving too long is a defect upstream, and a defect that is trimmed is a defect that ships.

The hint costs one of the declared rows, because that is how the composer counts it. This was wrong at first — the canvas drew it below the rows, so a two-line device showed three lines — and every assertion passed while it was. **Looking at the output is what found it**, which is the entire argument for having a simulator.

## Running it

```bash
pnpm run bridge                                        # in one terminal
pnpm run desk -- "ws://…:37219/?token=…" --cd /repo    # in another
```

The address is the pairing payload the bridge printed, taken verbatim because it
is the same string a phone would scan. `--columns` and `--rows` state the
geometry to simulate, and the box is drawn at exactly that.

This package therefore holds two things that must not be confused. The adapter
renders what it is handed and reports what it observes, and knows nothing about
harnesses, folds, or instructions. The host knows both ends by necessity — it
opens a session and carries answers back — and is the desk-shaped sibling of the
phone shell, not part of the device axis.

Until it existed, the client, the router, the notifier, and this adapter each
had full coverage and no caller: the parts had been proven to fit and had never
been assembled, and a person could not use CodeHUD at all.

## Typed input, and what it cannot prove

The specification is absolute: no contract in the system accepts a character sequence originating from wearer keystrokes, anywhere. This adapter reads typed lines.

It does not break that rule, because what it **emits** is a finalized speech recognition result — the only wearer-originated text the system admits. The keyboard is a recognizer's front end, standing where a microphone stands on hardware, and no contract downstream learns the difference.

What that substitution excludes is a limit on what this simulator can prove, and is worth stating rather than discovering later:

- **Confidence is always certain.** A keyboard does not mishear, so the consent floor is never exercised here. A session run entirely in this simulator has tested nothing about the rule protecting approvals from misrecognition.
- **There is no push-to-talk.** A typed line arrives whether or not capture was started, so the capture discipline the specification fixes is likewise untested here.

A simulator that hid either would be worse than none, because it would produce confidence in a path nobody had checked.

## Contract traceability

Every export cites the requirement and specification it realizes. Run `pnpm run evidence` from the workspace root.
