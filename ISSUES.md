# Issue Register

Staging list for `samchon/glasses` GitHub issues. Every item here is an open agenda item produced by the design pass that settled the local-harness, voice-only architecture. Nothing in this file is a decision. Decisions live in `docs/requirements/` and `docs/specifications/`.

Labels used below: `hardware` (needs the physical device), `decision` (a fork nobody has settled), `core` (pure TypeScript), `native` (Kotlin / React Native), `infra`, `risk` (an unverified assumption that could invalidate design).

---

## A. Hardware verification (needs a Rokid device)

These cannot be settled from documentation. Every one of them is currently an assumption.

### A1. Measure Custom View Scene patch throughput `hardware`
Does `updateCustomView` sustain a token-rate text stream, or does it rate-limit? The whole streaming display design assumes it does. Measure patch latency and maximum sustained patch rate; establish the coalescing interval the reducer must impose.
Blocks: `#spec-projection-frame-fits` realization.

### A2. Choose CXR-M or CXR-L, and pay that path's cost `hardware` `decision`
CXR-L requires the Hi Rokid app installed on the phone (package check → `AuthorizationActivity` → `bindService`). CXR-M requires a Rokid developer `clientSecret`/`accessKey` plus an AES serial-number handshake. Decide which dependency the product accepts, and register for developer credentials if CXR-M.

### A3. Confirm glasses microphone audio reaches the phone `hardware`
`AudioStreamListener` appears in the CXR-M key-class list but the streaming contract is undocumented. Confirm the phone receives glasses-captured audio, and record format, sample rate, and latency. **If this fails, the entire voice-only product fails.** There is no other instruction channel.
Blocks: `#spec-device-capability-channels` (microphone is the mandatory channel).

### A4. Evaluate `onAiKeyDown` as push-to-talk `hardware`
It is the only input event CXR-M delivers to the phone. Measure press-to-capture latency, repeat behaviour, and whether the built-in assistant intercepts the key first.
Blocks: `#spec-voice-no-text-entry` (push-to-talk requires an explicit wearer action).

### A5. Find a text-to-speech path that is not the AI Scene `hardware`
`sendTtsContent` pushes text into Rokid's own assistant UI, which the product does not control. Determine whether a custom app can play synthesized speech on the glasses speakers, or whether speech must come from the phone.
Blocks: `#spec-notification-grade-permissions` (demand grade may speak).

### A6. Verify display wake and sleep control `hardware`
The micro-LED panel is controlled phone-side; Android `PowerManager` on the glasses does not govern it. Confirm brightness and screen-off-timeout control, and measure wake latency.
Blocks: `#spec-notification-grade-permissions`.

### A7. Measure the real usable geometry `hardware`
The AIUI design system documents a 448 px canvas at 120–352 px height, but the Custom View path is a different renderer. Measure actual legible columns and rows at each usable text size, monocular green.
Blocks: `#spec-device-character-geometry`.

### A8. Determine whether the reflection workarounds are still required `hardware` `risk`
Two shipped projects read private fields out of obfuscated AARs: `CxrApi.I` for the serial number, and a `ServiceConnection` field scan on `CXRLink`. Establish whether current SDK versions still require this. If yes, pin the AAR version and add a hardware smoke test, because no unit test can detect the breakage.

### A9. Confirm temple gestures are unreachable from the phone `hardware`
The research says CXR-M exposes no touch listener and gestures reach only code running on the glasses. Confirm directly. This decides whether a second APK is ever needed.

---

## B. Undecided forks

### B1. Select the speech-to-text engine `decision` `risk`
On-device versus cloud, Korean accuracy, latency budget, cost, and behaviour on mixed Korean-English utterances. Cloud STT contradicts nothing in the charter (the wearer's own phone calling a recognizer is not a hosted product server) but it is a dependency and a bill.
Blocks: B2, and `#spec-voice-consent-integrity` (a confidence threshold requires an engine that reports confidence).

### B2. Fix the consent vocabulary and confidence threshold `decision`
Choose affirmative and negative tokens by acoustic distance from each other and from ordinary speech, in Korean and English. Set the confidence floor below which a recognition is treated as no answer. Choose the differently-worded second confirmation for destructive actions.
Realizes: `#spec-voice-consent-integrity`.

### B3. Fix the command grammar `decision`
Enumerate every fixed command: session switch, review navigation, interrupt, repeat, state queries, approval answers. Must be small enough to memorize and stated in full on request.
Realizes: `#spec-voice-deterministic-routing`, `#spec-voice-local-query`.

### B4. Map permission policy onto each harness `decision`
`#spec-agent-permission-policy` defines three classes. Determine how each maps onto Claude Code's permission modes and allowlists, and onto Codex's approval configuration, so the same spoken policy means the same thing on both.

### B5. Decide how a wearer names a session aloud `decision`
Directory basename, an assigned ordinal, or a wearer-chosen alias. Constrained by `#spec-voice-no-identifier-dictation`: the wearer must not have to pronounce a path.

### B6. Select the text-to-speech engine `decision`
Depends on A5. On-device versus cloud; latency matters more than quality for a one-line demand alert.

### B7. Confirm voice-only review is sufficient `decision`
If spoken review navigation is adequate, the product ships one APK and roughly 300 lines of Kotlin. If touch scrolling is required, a second on-glasses APK is required and the Kotlin surface grows by an order of magnitude. Settle after A9 and B3.

---

## C. Core implementation (pure TypeScript)

### C1. Replace `IBridgeMessage` with TGrid provider interfaces `core`
The nine-member wire union is obsolete; the contract is now two remote interfaces. Delete `packages/interface/src/bridge/IBridgeMessage.ts` and define the bridge-side and client-side provider contracts.
Realizes: `#spec-bridge-duplex-surface`.

### C2. Rewrite `IGlassesInput` with speech as the required member `core`
Current shape treats touch as primary. Speech becomes required; touch and head gestures become optional accelerators.
Realizes: `#spec-device-input-vocabulary`.

### C3. Promote `IGlassesAdapter.listen()` to mandatory `core`
And add connection-time refusal when the microphone channel is absent.
Realizes: `#spec-device-capability-channels`.

### C4. Add the permission policy to `IAgentAdapter.IOpenProps` `core`
Currently only `directory`, `resume`, `model`.
Realizes: `#spec-agent-permission-policy`.

### C5. Add a review cursor to `IHudState` and `HudComposer` `core`
Bounded retained history plus a cursor; composition recomputes the visible window rather than assuming a scroll container.
Realizes: `#spec-projection-review-traversal`.

### C6. Convert `IHudFrame.footer` from gesture legend to spoken hint `core`
Realizes: `#spec-projection-frame-fits` (footer only when an input is bound).

### C7. Claude Code adapter `core`
`claude -p --input-format stream-json --output-format stream-json --verbose --session-id`; normalize `system` / `assistant` / `user` / `result` / `stream_event` / `control_request` into `IAgentEvent`; route approvals through `control_request`.
Realizes: `#spec-agent-event-vocabulary`, `#spec-agent-permission-pairing`.

### C8. Codex adapter `core`
`codex app-server` JSON-RPC over stdio. Approvals via `item/commandExecution/requestApproval` and `item/permissions/requestApproval`.
Realizes: the same units as C7 on the second axis member.

### C9. Harness discovery `core`
Probe both families, report the unavailable ones with an executable-level reason.
Realizes: `#spec-agent-probe-result`.

### C10. Bridge process `core`
TGrid server, QR pairing token, session multiplexing, per-session observation retention for replay, single refusal channel.
Realizes: `#spec-bridge-pairing-token`, `#spec-bridge-refusal-channel`, `#spec-session-detach-semantics`.

### C11. Session client `core`
Attach from a held counter, idempotent fold, reconnection, optimistic approval settle.
Realizes: `#spec-session-replay-convergence`.

### C12. Voice router `core`
Deterministic local matcher over the command grammar; local-query resolution from reducer state; ambiguity reported rather than guessed.
Realizes: `#spec-voice-deterministic-routing`, `#spec-voice-local-query`.

### C13. Notification grades and quiet mode `core`
Grade permission table, session addressing on demand frames, deferred delivery, no timeout resolution.
Realizes: all four `#spec-notification-*` units.

### C14. Terminal simulator `core`
A `IGlassesAdapter` that draws in a shell at a configurable geometry. Typed input stands in for speech **in the simulator only**. This is the one place `#spec-voice-no-text-entry` does not apply, and the exclusion must be recorded as such.

### C15. Session handoff `core`
Expose harness session identifiers so a terminal can resume what the glasses started, and discover terminal-started sessions from the glasses.
Realizes: `#spec-session-handoff-identity`.

---

## D. Native implementation

### D1. React Native / Expo shell `native`
Hosts the core packages, holds the TGrid connection, owns permissions.

### D2. Foreground service `native`
Plus the battery-optimization exclusion flow, and reporting whether liveness currently holds.
Realizes: `#spec-bridge-client-liveness`.

### D3. Rokid device adapter `native`
Thin Kotlin module over the CXR AAR: connect, disconnect, render, sleep, plus the declared channel operations. No composition, no interpretation.
Realizes: `#spec-device-adapter-authority`.

### D4. `IHudFrame` to Custom View JSON converter `core`
Deliberately **not** Kotlin. Generating the Android-flavoured layout tree and the patch array is a pure function and belongs in TypeScript, so the native module stays a transport shim.

---

## E. Infrastructure and quality

### E1. Settle the evidence tooling `infra` `decision`
`@ttsc/evidence` is TypeScript plus Markdown only. Kotlin enters with D3, so the graph must move to `@wrtnlabs/evidence` (kotlin adapter confirmed present). `evidence.config.ts` is already staged for it; the `@ttsc/lint` hygiene rules (`evidence/singular`, `evidence/documented`, `evidence/todo`) stay either way. Confirm after B7: if the native surface stays at roughly 300 lines of transport shim with no logic, covering it with tests and CI instead is defensible.

### E2. Widen the evidence graph from type to property granularity `infra`
The claim currently selects `symbol: ["type"]`. A contracts package earns property-level citation; do it once the requirement set stops moving.

### E3. Repair the test package `infra`
`@nestia/e2e` v12 uses `TestValidator.equals(title, x, y)`, not the curried form; `DynamicExecutor`'s execution record has no `time`; `@types/node` is not resolving in `test/tsconfig.json`.

### E4. CI `infra`
Build, test, prettier check, and the evidence run on every push.

### E5. `AGENTS.md` and `CLAUDE.md` `infra`
Project identity, attitude, and a skill index, following the house layout. `CLAUDE.md` already points at it.

### E6. Root `README.md` `infra`

---

## F. Unverified assumptions

### F1. Verify TGrid runs on React Native `risk`
`WebSocketConnector` branches on `is_node()` and otherwise uses `self.WebSocket`. React Native shims `process` without `process.versions.node`, so the branch should be correct, and RN provides a W3C `WebSocket`, but whether `self` resolves in the RN global scope is unconfirmed. Worst case is a one-line `global.self = global` shim; confirm before building on it.

### F2. Measure latency over a private network `risk`
Approval round-trip time when the phone reaches the bridge over a mesh VPN rather than the local segment. A two-second glance budget does not survive a slow round trip.

### F3. Measure Korean consent misrecognition in the field `risk`
B2 chooses the vocabulary from theory. The rate that matters is the measured one, while walking, outdoors, with traffic.

### F4. Establish behaviour when the host machine sleeps `risk`
The bridge dies with the machine. Decide what the wearer sees, and whether the product should ask the user to change power settings or simply report the condition.
