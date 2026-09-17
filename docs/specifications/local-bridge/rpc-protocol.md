# Remote-Call Protocol

## The bridge surface {#bridge-surface-contract}

The bridge exposes operations the client calls and consumes a narrow surface the client exposes back. The contract is stated as two remote interfaces rather than a message catalogue, because every exchange here is either a request with a result or a delivered observation.

### The bridge is a local process exposing two interfaces {#spec-bridge-duplex-surface}

<!-- @evidence requirements/bridge-and-pairing/local-only-transport.md#bridge-runs-where-repository-is Refines where the bridge runs into a duplex remote-call surface hosted by a single-command process on the repository machine. -->

The bridge process runs on the machine holding the repository and is started by one command that requires no build step, no service account, and no configuration file to reach a working state.

It exposes operations to the client: enumerate discovered harnesses, open a session, attach to a running session from a stated observation counter, deliver an instruction to a session, and close a session. The client exposes one operation back: accept a normalized observation.

Session ownership stays with the bridge. Opening returns a session identifier; every subsequent operation names it, because one connection carries several sessions.

A connecting client declares its display geometry before any other operation succeeds, since no content can be composed without it.

### One token, one process, one network {#spec-bridge-pairing-token}

<!-- @evidence requirements/bridge-and-pairing/local-only-transport.md#bridge-local-trust-boundary Refines the local trust boundary into a single pairing credential with a stated scope and no public-address requirement. -->

The bridge issues one pairing token at startup and presents it in a form a wearer can transfer to the client without typing. The token is the only credential in the protocol and authorizes for the lifetime of that bridge process.

The token's stated scope is preventing accidental connection by another device that can already reach the host. It is not a defense against a hostile party with network access, and the system claims no such property.

The contract requires no publicly reachable address. A client reaching the bridge across a private network the user already operates is the same contract, unchanged, and the system never requires a relay, tunnel, or hosted ingress to exist.

### One refusal channel {#spec-bridge-refusal-channel}

<!-- @evidence requirements/bridge-and-pairing/local-only-transport.md#bridge-single-rejection-channel Refines the single rejection channel into a uniform failure result across credential, session, version, and launch failures. -->

An invalid token, an unknown session identifier, an incompatible protocol revision, and a harness that would not launch are all reported as the same kind of failure, carrying the identifier of the refused request when it had one and a message short enough to read on the display.

Protocol revision is stated by both ends rather than assumed, and a mismatch is refused with an explanation rather than by attempting a partial exchange.

### Liveness is a declared obligation of the client host {#spec-bridge-client-liveness}

<!-- @evidence requirements/bridge-and-pairing/local-only-transport.md#bridge-client-survives-backgrounding Refines surviving backgrounding into a liveness obligation on the client host plus a required disclosure of what the user must permit. -->

The client holds its connection in a manner its host operating system does not reclaim while the client is not in the foreground, for the full duration of an agent turn.

Where the host requires the user to grant something for that to hold, the system states what and reports whether it currently holds. A client that cannot guarantee liveness reports that condition rather than presenting itself as connected, because a wearer cannot distinguish a dead client from a thinking agent.

On reconnection the client resumes from its last held observation counter rather than from the beginning.
