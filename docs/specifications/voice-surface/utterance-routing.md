# Utterance Routing

## What becomes of an utterance {#voice-routing-contract}

Every recognized utterance takes exactly one of three routes, and the route is decided before any network call.

### No text entry surface exists {#spec-voice-no-text-entry}

<!-- @evidence requirements/voice-interaction/spoken-control.md#voice-no-keyboard Refines the no-keyboard boundary into the absence of any character-accepting contract on any surface. -->

No contract in the system accepts a character sequence originating from wearer keystrokes, on the wearable, on the host that carries the client, or on the machine running the bridge. The only wearer-originated text in the system is a finalized speech recognition result.

Speech capture is push-to-talk: recognition begins on an explicit wearer action and ends on a stated terminating condition. There is no always-listening mode and no wake word that can start a turn unattended.

### Routing is a stated rule, not an inference {#spec-voice-deterministic-routing}

<!-- @evidence requirements/voice-interaction/spoken-control.md#voice-command-versus-prompt Refines the command-versus-prompt distinction into a deterministic routing rule evaluated without a model call. -->

A finalized utterance is matched against a fixed command grammar. A match routes to the client; a non-match routes to the agent as a prompt. The match is computed locally and deterministically, with no model invocation, no network call, and no dependence on session content.

The command grammar is finite and enumerable, and the system states it in full when the wearer asks what they can say. Adding a command is a change to this specification, not a runtime behavior.

An utterance that matches ambiguously is not resolved by guessing; the system reports the ambiguity and asks for one of the candidate commands.

### Locally answerable questions never reach the agent {#spec-voice-local-query}

<!-- @evidence requirements/voice-interaction/spoken-control.md#voice-local-query Refines client-answerable questions into a class of commands resolved entirely from reducer state. -->

A defined subset of the command grammar is answered from the state the client already holds: what the agent is doing, how long the current turn has run, which session is in focus, what the last result was, and repetition of content already received.

These consume no agent turn, no network round trip, and no money, and they are answerable while the bridge is unreachable. Routing such a question to the agent is a defect.

### No contract requires a wearer to pronounce an identifier {#spec-voice-no-identifier-dictation}

<!-- @evidence requirements/voice-interaction/spoken-control.md#voice-no-spelling Refines the never-spell requirement into a prohibition on contracts whose inputs are exact strings the wearer must produce. -->

No command in the grammar takes a filesystem path, a branch name, a commit identifier, or a symbol name as a spoken parameter the wearer must produce exactly. Where an operation needs such a string, the system offers a spoken selection among candidates it already holds, addressed by ordinal or by a short distinguishing word.

Prompts are carried to the agent verbatim; locating the subject of an instruction is the agent's work, not the recognizer's.

### Consent requires acoustic distance and a confidence floor {#spec-voice-consent-integrity}

<!-- @evidence requirements/voice-interaction/spoken-control.md#voice-consent-integrity Refines consent integrity into vocabulary selection, a confidence threshold, and a second differently-worded confirmation. -->

The affirmative and negative consent tokens are selected for acoustic distance from each other and from common conversational speech, and they are not general-purpose words that could appear inside a prompt.

A recognition result below a stated confidence threshold is treated as the absence of an answer: the request stays pending and the system re-requests. It is never resolved toward either answer, and silence is never an answer.

A result that reports no confidence at all is treated the same way. The threshold is a claim the recognizer makes about itself, and a recognizer that makes none cannot be used for consent; admitting its answers would leave the threshold guarding only the devices that already measure themselves.

An action classified as doubly-confirmed requires a second confirmation whose wording differs from the first, so that a single misrecognition cannot satisfy both. A repetition of the same token does not satisfy the second confirmation.
