# `@codehud/client`

The device-host side of the connection: attach, fold, compose, answer.

## Why it exists

The bridge owns the sessions; this owns what one device knows about them. A fold per session, the counter each fold has reached, and the answers the wearer has given.

It talks to the bridge through **the bridge's own interface** rather than through a transport. In a running system that is a remote-call driver; in a test it can be a bridge connection handed over directly. That is what lets the whole path — client, bridge, registry, adapter — be crossed once without a socket.

## Public surface

| Export | Shape | What it does |
| --- | --- | --- |
| `CodeHudSessionClient` | class | One device's view of every session it watches |

```typescript
const client = new CodeHudSessionClient({ bridge, token, descriptor, context });
await client.connect();                       // and re-attach whatever is running
const id = await client.open({ kind: "claude-code", directory, policy });
client.frame(id);                             // what the wearer would see
```

## The lowest counter still needed, not the highest held

A fold that has taken counters 0 through 4 attaches from **5**. The two numbers differ by one, and the wrong choice either re-folds an observation or silently skips one.

Only the second is dangerous — re-delivery is idempotent by design. Which is exactly why the counter is asserted **on the number** rather than through the display: a fold that walks its counter backwards produces the right frame and the wrong amount of traffic, and nothing downstream would ever notice.

## Settling on delivery, not on consequence

An approval clears from the display as soon as the bridge has taken the answer, rather than when the harness reports what it did with it. The specification asks for exactly that: a request stays in front of the wearer *until its answer has been delivered*.

The difference is a wearer staring at a question they have already answered while the agent thinks about it.

An answer that **fails** to reach the bridge leaves the approval where it was, because the wearer still owes it.

## A transport that stopped answering is an observation, not a remark

The host machine goes to sleep and the bridge goes with it. The device reconnects a bounded number of times — retrying a dead machine forever is a display that lies about being connected — and then has to say so.

Saying so is not enough. Driven by taking a real bridge away and waiting the attempts out, the wearer was left looking at the agent's last words at an ambient grade, under an instruction they could no longer give, with the only contradiction printed *beside* the frame rather than in it. On glasses there is no beside.

`ICodeHudAgentEvent.IError` already names three things that can fail: "The harness, the **transport**, or the adapter." So `lost` folds that observation into every session this device holds instead of growing a special case, and the whole display path applies without being told about this situation at all — the reducer moves to a fault, the composer grades it a demand, the notifier routes it like anything a wearer must see.

It is stamped past whatever each fold has taken, because the replay guard discards an observation at or below the counter already folded and this one has no counter of its own. Nothing follows it: the transport that would have delivered a later observation is precisely what failed.

## Contract traceability

Every export cites the requirement and specification it realizes. Run `pnpm run evidence` from the workspace root.
