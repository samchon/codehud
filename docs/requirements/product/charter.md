# Product Charter

## What the product does {#product-purpose}

The product lets a developer keep driving the coding agent already running in their own repository after they have walked away from the keyboard. It is not a chat assistant moved onto a wearable; it is supervision and control of a long-running, approval-demanding agent harness from a wearable surface.

### Wearing a coding agent {#product-wearable-coding-agent}

Using the glasses alone, a wearer must be able to read the agent's progress, answer an approval request, issue a new instruction, and stop a turn in flight. If any one of those four requires reaching for a phone screen or reopening a desktop terminal, the product does not hold.

Reading is done with the eyes and instructing is done with the voice. The display is a surface to be read and reviewed, never one to be operated, and the product accepts no typed input anywhere.

The product does not move more output onto the wearable surface than a wearer can read. The reduction that closes the gap between what an agent produces and what a wearable display can carry is the body of the product; transport and vendor connectivity are the plumbing that makes the reduction possible.

### Two adapter axes {#product-two-adapter-axes}

The product has two independent axes of substitution: which coding agent harness is driven, and which manufacturer's wearable device is rendered to. The two axes must not know about each other, and adding a member to one axis must cost exactly one adapter on that axis.

If supporting a new harness forces a change to display logic, or supporting a new device forces a change to harness interpretation, the abstraction has failed.

### No hosted server {#product-no-hosted-server}

The product requires no server operated by a third party. The coding agent runs on the machine that holds the repository, and the wearable reaches that machine directly over the same local network. Neither source code, nor prompts, nor approval decisions cross the internet because of this product.

This boundary is not relaxed for convenience features. A capability that only works with a hosted relay is out of scope.

It also decides which harness surface the product drives. Both vendors offer a hosted agent that would need no machine of the user's own, and both were rejected for the same two reasons: the hosted surfaces bill per token rather than against the subscription the user already holds, and only one of the two enforces an approval gate on the agent's own actions. Approval is the feature this product exists to deliver, so the product drives the local harness, where both vendors gate properly and the wearer's existing plan applies.

## What the product does not do {#product-exclusions}

### It does not replace the agent {#product-not-an-agent}

The product calls no model of its own and runs no tool on its own judgement. Judgement belongs entirely to the harness the user chose; the product normalizes that harness's observations for display and carries the wearer's instructions back.
