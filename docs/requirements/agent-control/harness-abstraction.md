# Harness Abstraction

## Absorbing the difference between harnesses {#agent-harness-absorption}

Claude Code speaks newline-delimited JSON; Codex speaks a stateful JSON-RPC protocol. Neither vocabulary may reach the wearable display.

### Normalized observation {#agent-normalized-observation}

Each harness adapter must translate the raw output it receives into the product's common observation vocabulary. That vocabulary contains only situations a wearer would act on differently; a distinction the harness makes internally, but which never changes what the wearer does, is absorbed by the adapter rather than added as a member.

An observation must identify itself without relying on arrival order. A wearer who walks out of range and returns has to be able to determine what they missed.

### Harness discovery {#agent-harness-discovery}

The product must tell the wearer which harnesses the host machine can offer. A harness that is not installed, or cannot be executed, must still be reported together with the reason; it must not be quietly dropped from the list.

The wearer acts on that reason later, at a keyboard, so the reason must name the executable that actually failed rather than the harness family.

### Session lifetime {#agent-session-lifetime}

A conversation with a harness is a resource that is explicitly opened and closed. Whoever opens it must state the working directory, and the product must never infer it. A coding agent pointed at the wrong repository is the failure with the largest blast radius in this product.

Continuing an existing conversation is the normal wearable case rather than an exception. A wearer expects the context they had when they stood up from the desk, not a fresh one.
