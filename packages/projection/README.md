# `@codehud/projection`

The projection boundary: the reducer that folds a coding agent's observations into state, and the composer that turns that state into the content one device should show.

## Why it exists

An agent produces thousands of tokens per turn. A wearable display carries two lines and holds a wearer's attention for about two seconds. Closing that gap is the product, and this package is where it happens.

## Public surface

| Export | Shape | What it does |
| --- | --- | --- |
| `CodeHudReducer` | class | Folds one observation into the state |
| `CodeHudComposer` | class | Projects the state onto one device's geometry |
| `CodeHudContext` | namespace | The frozen default configuration, and a section-wise merge |
| `CodeHudText` | namespace | Fitting text to a display measured in characters |

`CodeHudText` is public rather than internal to the composer. A device adapter rendering something the composer did not produce, a pairing code or a connection failure, needs the same fitting rules, and a second implementation of them would be a second set of truncation bugs.

```typescript
import {
  CodeHudComposer,
  CodeHudContext,
  CodeHudReducer,
} from "@codehud/projection";

const context = CodeHudContext.create({ history: 32 });
const reducer = new CodeHudReducer(context);
const composer = new CodeHudComposer(context);

let state = reducer.initialize();
for (const observation of stream) state = reducer.reduce(state, observation);

const frame = composer.compose(state, device.descriptor.geometry);
```

## Configuration, not literals

Both stages take an `ICodeHudContext`: how much history to retain, the consent vocabulary and its confidence floor, and every word the display originates rather than reports. That is why they are classes rather than namespaces despite being pure. A standing label baked into the composer is a product decision a wearer cannot see, a translator cannot reach, and a test cannot vary.

`CodeHudContext.DEFAULT` is frozen and `CodeHudContext.create()` merges by section, so stating one word of the vocabulary keeps the rest of it.

The consent tokens in the default are placeholders in the honest sense: ordinary English words chosen so the composer has something to render, not words chosen for acoustic distance in the wearer's language. That choice is an open question the consent requirement states, and no default can settle it.

## Two stages, deliberately separate

`CodeHudReducer` folds observations into `ICodeHudState`. It reads no column count, no clock, no random source, and no input or output, so a recorded observation stream replays to the same state every time. That purity is what makes the most important logic in the product testable with no hardware and no socket.

`CodeHudComposer` projects that state against one device's geometry. It is the only place in the repository that knows a display is two lines wide.

The split is what lets two devices attach to one session, share the state, and each render what their own surface can carry.

## Invariants worth knowing

- Composed content always fits the geometry it was given, at every content kind and down to a single row. An adapter draws it without measuring anything.
- Where the situation needs more room than the device has, the spoken hint is dropped before a line of content is.
- Folding an observation the state has already seen returns the state unchanged, so a reconnecting device replays safely.
- A late observation never rewinds the display.
- Moving the review cursor toward newer content while already following it does nothing, rather than pinning the display where the wearer did not ask it to stop.

## A consent configuration that cannot guard is refused

The consent words and the confidence floor are the wearer's configuration, and a configuration that cannot do its job used to be obeyed rather than questioned.

A floor of zero is the quiet one. It admits every recognition the engine produced, however unsure, so the approval path is wide open and nothing anywhere says the guard is off — the shape this repository has produced twice before, a configured check whose selector matches nothing and reports the same green as one that matches everything. Above one is the opposite and just as quiet: nothing can ever be approved, with the product working exactly as configured.

The three words fail loudly instead, and still too late. Two that are equal make either of them ambiguous forever; one that is already a command shadows it, and an affirmative of `stop` costs a wearer their approval and their brake at once. Loud, but loud after they are already walking.

So they are checked where the configuration is stated. `unusable` returns the reason rather than a boolean, because each of these is something whoever wrote the configuration has to fix and a caller told only "no" would have to guess which.

What that leaves reachable is the routing rule itself: an utterance matching two commands is reported and never guessed. A *configuration* can no longer reach it. A grammar that grew a phrase under two commands could, which is why nothing in it may.

## A recognizer that cannot say how sure it is

Consent takes a confidence floor, and a recognition arriving without a confidence at all is refused rather than admitted for want of a number: an engine that cannot say how sure it is cannot be used to authorize something irreversible.

The platform makes that reachable. Android documents `CONFIDENCE_SCORES` as "optional and might not be provided", so a device can be handed an engine that never reports one, and on that device every approval is refused — correctly, and indistinguishably from a noisy room. A wearer saying *allow* into it will say it again, because nothing has told them there is anything else to try.

So the router counts. One missing number is an utterance and says nothing; a run of them is the engine, and only the second is a fact a wearer can act on — a different engine, or somewhere they can type. A single confidence ever seen settles it the other way and permanently, because the question is whether the recognizer *can* report rather than whether it did this time.

It reports rather than acts. What a device does about it is the device's, and what the product should degrade to is a specification question that noticing does not answer.

## Grades decide whether a display lights up

Three, and nothing between:

| Grade | Wake a sleeping display | Speak | What it is for |
| --- | --- | --- | --- |
| demand | yes | yes | an approval that blocked a session, a fault that ended one |
| notice | yes | no | a finished turn |
| ambient | no | no | progress within a turn |

What `CodeHudNotifier` returns is an **upper bound**, not an instruction. A device that cannot speak does less; nothing may do more.

Two rules here were specified and not implemented until the notifier went in, and both had tests asserting the violation:

- **A demand frame states the session's directory**, always — shortened from the left so the distinguishing trailing segments survive. An approval whose target repository is unknown is not answerable, because "allow" means something different in each checkout. Where there is room for one line the identity shares it with the question rather than either being dropped.
- **Streaming prose is ambient, not notice.** It had been graded notice, which permits waking a sleeping display — once per sentence, for an agent writing a paragraph. That is the behaviour the three grades exist to prevent.

## Quiet mode defers, and never answers

Quiet removes waking and speech from every grade, demand included. It changes **presentation only**: a suppressed approval still blocks its session, stays pending, and stays the wearer's to answer.

Suppressed demand items accumulate in arrival order and come back together when quiet ends. None is dropped, coalesced, or resolved.

That last word is the point. A system that quietly denied would be answering on the wearer's behalf, and the wrong answer cannot be undone. Nothing here resolves an approval by elapsed time, and nothing ever will.

## Contract traceability

Every export cites the requirement and specification it realizes. Run `pnpm run evidence` from the workspace root.
