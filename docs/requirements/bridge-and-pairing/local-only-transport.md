# Local-Only Transport

## The connection ends on the wearer's own machine {#bridge-local-connection}

The transport crosses the link between the wearable and the machine that holds the repository, and stops there. That constraint is what keeps the protocol small and what keeps the product free of hosting costs.

### The bridge runs where the repository is {#bridge-runs-where-repository-is}

A coding agent is a process on a filesystem, so whatever opens and closes it lives on that same filesystem. The wearable connects to that process, is told which harnesses the machine can offer and which sessions are already running, and chooses among them.

A connecting device declares its display geometry before anything else, because no content can be composed without it.

The bridge is a process the user starts, not software the product installs into their system. It must be startable with a single command on a machine that already has the harness, and must not require a build step, a service account, or a configuration file to reach a working state.

### The trust boundary is one machine on one network {#bridge-local-trust-boundary}

The product introduces no account system and no external identity provider. A single pairing token, issued when the bridge starts, is the only credential, and its scope is one bridge process reachable over one local network.

What the token defends against is another device on the same network connecting by accident. It is not a defense against a hostile party on that network, and the product does not claim otherwise.

Reaching the bridge from outside that network is the user's own affair, through whatever private network they already run. The product must work unchanged when the wearable's route to the bridge is such a network rather than a local segment, and must never require a publicly reachable address to exist.

### Refusals are explained in one place {#bridge-single-rejection-channel}

A bad token, an unknown session, a protocol mismatch, and a harness that would not launch are all reported to the wearer the same way, because when nothing is happening there must be exactly one place to look.

The explanation must be short enough to read on the display. A wearer who cannot reach the host machine still has to learn why they are stuck.

### The client outlives its connection {#bridge-client-survives-backgrounding}

The wearable's client is hosted by an operating system that will stop a backgrounded process to save power, and agent turns routinely run longer than a wearer looks at anything. A turn that finishes while the client is asleep must still reach the wearer.

The product must therefore hold its connection in a way the host system will not reclaim during normal use, and must state plainly what the user has to permit for that to hold. Silent death during a long turn is the failure that makes the product untrustworthy, because the wearer cannot distinguish it from an agent that is still thinking.
