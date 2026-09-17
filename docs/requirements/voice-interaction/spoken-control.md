# Spoken Control

## Speech is the only instruction channel {#voice-sole-instruction-channel}

A wearer's hands are busy, their pockets are closed, and the display is two lines of green. Every instruction this product accepts arrives as speech. The display exists to be read, not operated.

### No keyboard, ever {#voice-no-keyboard}

The product offers no text entry of any kind: no on-lens keyboard, no phone-side compose box, no character picker. A wearer who cannot say a thing cannot send it.

This is a boundary rather than a limitation to be engineered around later. A text field is the failure mode this product exists to avoid: the moment a wearer must look down and type, the desktop terminal they already own is the better tool.

Dictation is push-to-talk rather than always-on. A coding agent triggered by overheard conversation is a hazard, and a wearer must be able to speak near the device without addressing it.

### Fixed commands and free prompts are different things {#voice-command-versus-prompt}

Two kinds of utterance reach the product and they must not be confused. A fixed command operates the client itself: switch session, scroll, stop, repeat, answer an approval. A free prompt is content for the agent.

The product must distinguish them by a stated, learnable rule rather than by inferring intent with a model. Classifying every utterance through a language model adds a round trip and a bill to operations that should be instant and free, and it makes the failure mode unpredictable: the same words would sometimes operate the client and sometimes reach the agent.

The fixed command vocabulary must be small enough for a wearer to hold in their head, and the product must state it on request.

### Questions the client can answer itself {#voice-local-query}

"What is it doing?", "How long has this been running?", "Read that again", "Which session am I on?" are answered from what the client already holds. They must never be sent to the agent.

Sending them costs a turn, costs money, adds seconds of latency, and pollutes the conversation with questions that were never about the code. A wearer who asks what is happening is asking the product, not the agent.

### A wearer must never have to spell {#voice-no-spelling}

Dictating identifiers, paths, and symbol names is the hardest thing to ask of a speech recognizer, and it is worst exactly where this product's users live: a mixed-language sentence containing an English path inside a Korean instruction.

The product's answer is not a better recognizer. It is that a wearer states intent and the agent locates the subject. Instructions are expressed as goals ("fix the test that broke in the reducer"), and the product must not build any interaction that requires a wearer to pronounce a path, a branch name, a commit hash, or a symbol.

Where an exact string is unavoidable, the product must offer it as a spoken choice among candidates the client already knows rather than asking the wearer to produce it.

### Misrecognized consent must be impossible {#voice-consent-integrity}

An approval answered by voice is one recognition error away from authorizing something destructive. This is the single highest-severity failure in the product.

Consent vocabulary must be chosen for acoustic distance rather than brevity, so that the affirmative and the negative cannot be confused with each other or with ordinary speech. Recognition below a stated confidence threshold must be treated as no answer at all and re-requested, never resolved by guessing.

Destructive actions must require a second, differently worded confirmation. A single utterance must never be sufficient to delete, overwrite history, force-push, or expose a credential.
