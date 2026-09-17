# Turn and Approval

## What control the wearer keeps {#agent-wearer-control}

A wearable surface offers far less than a desktop terminal. The product must let the wearer genuinely control the agent from inside that smaller set.

### What a wearer may send {#agent-wearer-commands}

The set of instructions a wearer can send to the agent must be closed, and each member must complete in one gesture or one confirmed sentence. An instruction that requires repeated editing, or assembling a free-form command, does not belong to the set.

The camera on a wearable is an input path a desktop terminal cannot match, so a wearer must be able to attach what they are looking at to an instruction.

### An approval request blocks the agent {#agent-permission-blocking}

When the agent asks for approval, the turn does not proceed until the wearer answers. The product must announce this ahead of every other display, and must keep it visible until an answer is sent.

An approval request must be paired with its answer by a request identifier. Requests can arrive back to back, so an answer must never be applied on the assumption that the most recent request is still the current one.

### Approval options are data {#agent-permission-options}

Harnesses differ in how many answers they offer and what each one means, so the options must be data an adapter reports rather than a fixed enumeration. Each option must state for itself whether it lets the agent proceed and whether it also persists to later requests of the same shape.

A persisting consent cannot have its scope read on a wearable display, so it must be shown distinctly and must not be bound to the easiest gesture.

### Approvals have a budget, and it is small {#agent-approval-budget}

A harness left at its default settings asks for approval every few minutes. A wearer cannot walk, cook, or hold a conversation while stopping that often, so the default configuration makes the product unusable even though every individual prompt is correct.

Opening a session must therefore carry a policy that decides which classes of action proceed unattended and which reach the wearer. Reads proceed; writes, executions, and anything that leaves the machine reach the wearer; destructive actions reach the wearer and demand a second confirmation.

The policy is a property of the session rather than a global setting, because the right answer differs between a scratch repository and one that deploys. A wearer must be able to state it when they start the work and must be able to see which policy a running session is under.

### How a turn ends {#agent-turn-outcome}

When a turn ends the product must say in one line what changed. A wearer who spent ten minutes on something else must be able to look up, read that one line, and know where things stand.

A turn the wearer stopped must be distinguishable from one that failed. Reporting a wearer's own gesture as an error destroys their sense of control.
