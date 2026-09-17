# `@codehud/bridge`

The local bridge: one process on the machine holding the repository, one pairing code, and every running session.

## Why it exists

A coding agent is a process on a filesystem, so whatever opens and closes it has to live on that same filesystem. The bridge is that thing. It is not a server in the product sense: it listens on a port the user already controls, contacts nothing, and requires no publicly reachable address to be useful.

Everything a device can observe is decided here. The two adapter axes stay unaware of each other, and this package sits on the harness side: it references no display geometry beyond carrying what a device declared, and composes nothing.

## Public surface

| Export | Shape | What it does |
| --- | --- | --- |
| `CodeHudBridgeServer` | class | Listens, issues the pairing code, wires each connection |
| `CodeHudBridgeConnection` | class | One connected device, and the gate in front of it |
| `CodeHudSessionRegistry` | class | Every running session, what it produced, and who is watching |
| `CodeHudBridgeFailure` | namespace | Builds the one refusal, and recognizes it on arrival |
| `CodeHudPairingToken` | namespace | Issues, compares, and encodes the credential |
| `ICodeHudSessionSubscriber` | interface | The seam between session bookkeeping and the transport |

```typescript
import { CodeHudBridgeServer } from "@codehud/bridge";

const bridge = new CodeHudBridgeServer({ adapters, probe });
await bridge.open(37219);
console.log(bridge.pairing("192.168.0.14", 37219));
// ws://192.168.0.14:37219/?token=…
```

## Detaching is not closing

The rule the product rests on. A wearer walks out of range in the middle of a turn; the harness on their machine has no idea and must not be told. A session's lifetime is bound to the bridge process and to an explicit close instruction, never to a connection.

So losing a device removes it from the fan-out and does nothing else. The harness keeps running, observations keep accumulating, and a pending approval stays pending. Observations are retained from the first, so a returning device is served from whatever counter it names, and several devices may watch one session at once, each served independently.

## Ordering is load-bearing, not tidiness

A client discards any observation whose counter is at or below the highest it has already folded. That guard is what makes replay safe, and it is also what makes ordering non-negotiable: a live observation overtaking a replayed one does not arrive early and get sorted out later, it makes the client discard everything the replay was for. A device that reattached to catch up would end up holding less than it started with.

The bridge therefore stamps the counter itself, so a harness with no session concept of its own still replays correctly, and serializes delivery per device so that a catch-up burst cannot be overtaken by the live stream behind it.

## One unreachable device stalls nothing

Glasses that went out of range do not close politely, they stop answering. The bridge is the sole consumer of the harness's observations, so a delivery failure that propagated would stop the agent's whole stream behind a device nobody is wearing. A rejected delivery drops that device and reaches nothing else.

This is not theoretical tidiness. With the swallow removed, the unhandled rejection takes the process down, which in production means every session for every device ends because one pair of glasses went out of range.

## Refusals are plain values, measured against the transport

An invalid credential, a disagreeing protocol revision, an unknown session, and a harness that would not launch are one shape with four causes, because when nothing is happening there has to be exactly one place for a wearer to look.

The shape is a plain object rather than an `Error` subclass, and that was measured against tgrid 1.2.1 with a real server and client rather than assumed:

```text
throw new Error("token is not valid")
  -> { name, stack, message }          arrives as a plain object, stack included
throw { cause: "token", message: "…" }
  -> { cause, message }                exactly the contract, nothing else
```

A rejection never arrives as the class it left as, so the client half cannot use `instanceof` and checks the contract fields instead. Throwing an `Error` would also ship the bridge's internal paths to someone's glasses on every refused request.

The revision is checked before the credential, so a device too old to have formed a correct token learns the actual problem. A connection is accepted at the transport level and judged at the protocol level, so a wrong pairing code produces something a display can render rather than a socket closed under it with a status number.

## What the pairing code claims, and what it does not

The token defends against another device on a network the user already operates connecting by accident. It is not a defense against a hostile party with access to that network, and nothing here claims one.

It is issued once per process and lives as long as that process, so nothing has to be revoked. The pairing payload carries the address as well as the credential, because a device needs both and a wearer scanning a code can supply neither.

## Testing without a socket or a harness

`CodeHudSessionRegistry` and `CodeHudBridgeConnection` take every collaborator through a constructor, so retention, replay, ordering, the fan-out, the gate, and all four refusals are exercised in memory. `CodeHudBridgeServer` is the only file that knows what a socket is, and it holds no rule of its own.

Two things the suite learned the hard way, both recorded in the fixtures:

- A stand-in device must **yield** before recording, the way a real delivery crosses a socket. One that returned without suspending preserved ordering by accident, and the ordering case passed against a bridge whose serialization had been deleted.
- Even latency proves nothing either, because turns are handed out in the order they were asked for. The fixture makes older deliveries slower than newer ones, which is the shape a real catch-up has and the only shape that discriminates.

## Contract traceability

Every export cites the requirement and specification it realizes. Run `pnpm run evidence` from the workspace root.
