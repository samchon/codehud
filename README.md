# CodeHUD

Drive Claude Code and Codex from smart glasses. Speech is the only instruction channel, the display is read and reviewed but never operated, and the agent runs on the machine that holds your repository rather than in anyone's cloud.

> **Status: early.** The whole product runs on a desk today: a terminal stands in for the glasses, drives a real Claude Code or Codex session through the bridge over a real socket, shows the approval, and takes the answer. There is no glasses application yet. See [What works today](#what-works-today).

## What it is

A wearer looks up mid-sentence, sees that their agent wants to write a file, says "allow", and looks away. That interaction is the product. Everything else — transport, discovery, session bookkeeping — is plumbing under it.

Two things follow from that, and they shape the whole design:

**A coding agent is a process on a filesystem.** Whatever opens and closes it has to live on that filesystem too. So there is a small bridge process on your development machine, and the glasses talk to it over your own network. No hosted server, no account, no relay. The bridge contacts nothing.

**Two seconds of attention is the entire budget.** The reduction that turns a firehose of agent output into one readable line is not a presentation layer bolted on at the end. It is the product, and it is a pure function of the observation stream, which is why it can be tested without a device.

## What works today

Two terminals. In the first:

```bash
pnpm install
pnpm run bridge
```

```text
ws://192.168.0.14:37219/?token=…
  [a scannable pairing code]
  claude-code: /usr/local/bin/claude
  codex: /usr/local/bin/codex
```

In the second, paste that address. It is the same string a phone would scan:

```bash
pnpm run desk -- "ws://192.168.0.14:37219/?token=…" --cd /path/to/repo
```

Then type. What you type stands in for what you would say — the terminal is a
recognizer's front end, not a keyboard the product admits — and what comes back
is what a wearer would see, at the geometry you asked for:

```text
> Create a file named third.txt containing exactly: three

┌────────────────────────────────────────┐
│Write deskrun/third.txt                 │
│…/scratchpad/deskrun                    │
├────────────────────────────────────────┤
│Say Allow or Deny                       │
└────────────────────────────────────────┘
 demand · permission

> allow

┌────────────────────────────────────────┐
│I created `third.txt` in the working di…│
│Done · 8s                               │
│                                        │
└────────────────────────────────────────┘
 notice · result

> how long
8s
```

That last line cost no agent turn, no round trip, and no money: a question the
device can answer from what it already holds never reaches the agent.

Something that cannot be undone takes two words, and the second is a different
word:

```text
┌────────────────────────────────────────┐
│Bash ls -la fourth.txt && rm fourth.txt…│
├────────────────────────────────────────┤
│Say Allow or Deny                       │
└────────────────────────────────────────┘
        ↓ allow
┌────────────────────────────────────────┐
│Confirm: Bash ls -la fourth.txt && rm f…│
├────────────────────────────────────────┤
│Say Confirm or Deny                     │
└────────────────────────────────────────┘
        ↓ confirm   … and only then is the file gone
```

Repeating *allow* does not confirm, because one misrecognition must not be able
to satisfy both asks. The command above is the one that taught us to read a
chain rather than its head: it was classified by `ls` until a real file was
deleted on one word.

Both harness adapters have been driven against their real binaries. Claude Code:
a gated write stopped, asked, and went through on *allow*. Codex: the same over
JSON-RPC, and an approval left unanswered stayed pending for 190 seconds with
nothing resolving it. Prose streaming, tool phases, approval vocabularies, and
refusal handling are checked against captured output and against the schema the
Codex binary generates for itself, rather than against invented input.

What is not built: the glasses application and the phone companion. Everything
between a device and a harness exists and is exercised; what is missing is the
hardware at one end, and the questions only hardware can answer are
[open issues](https://github.com/samchon/codehud/issues) rather than guesses in
the source.

## How it fits together

```text
glasses ──voice──┐
                 │   (device axis: not yet implemented)
                 ▼
        ┌─────────────────┐        ┌──────────────────┐
        │  session client │◀──────▶│   local bridge   │
        └─────────────────┘  TGrid └──────────────────┘
                  (this connection is crossed, end to end, in the suite)
                 │                          │
                 ▼                          ▼
          projection                 harness adapters
       (fold + compose)          (Claude Code, Codex)
                                           │
                                           ▼
                                   the agent process
```

| Package | What it holds |
| --- | --- |
| [`@codehud/interface`](packages/interface) | The shared vocabulary. Pure types, no runtime dependency |
| [`@codehud/projection`](packages/projection) | The fold and the composer. Pure, deterministic, replayable |
| [`@codehud/agent`](packages/agent) | Harness discovery, and both harness adapters |
| [`@codehud/bridge`](packages/bridge) | The local process: transport, pairing, session multiplexing |
| [`@codehud/client`](packages/client) | The device's view: attach, fold, compose, answer |
| [`@codehud/simulator`](packages/simulator) | A terminal standing in for glasses, and the desk host that runs it |
| [`@codehud/codex-protocol`](packages/codex-protocol) | Codex protocol types, generated by the `codex` binary itself |

The two adapter axes — harness and device — never import each other. Exactly one layer knows both, and that is the projection boundary.

## How this repository is built

Three habits, and they are not decoration.

**Nothing about a vendor is asserted from memory.** Every SDK capability, flag, and protocol shape here was read out of an installed binary or measured against a running one, and recorded with the version it came from. It has repeatedly mattered: the flag that makes Claude Code ask a wearer for permission is a value its own `--help` does not list, and finding it reversed a conclusion this repository had already published.

**A check is not a check until it has been made to fail.** Before a test, a lint rule, or a CI job is believed, the thing it protects is broken on purpose and the red is observed. That rule has caught tests that could not fail, a cache that was never restoring, and a configuration comment claiming to prevent something it did not prevent.

**Every public contract cites what it realizes.** 36 requirement units, 36 specification units, and the exports that implement them, checked as a graph:

```bash
pnpm run evidence     # 116/116 units covered
```

## Commands

| | |
| --- | --- |
| `pnpm run build` | Compile every package |
| `pnpm run test` | Run the suite; needs no build |
| `pnpm run evidence` | Check the requirement-to-code graph |
| `pnpm run bridge` | Start the local bridge |
| `pnpm run desk` | Run the device half in a terminal, against a bridge |
| `pnpm run format` | Format |

## Documentation

- [`docs/requirements`](docs/requirements) — what the product promises
- [`docs/specifications`](docs/specifications) — how each promise is refined into a contract
- Each package's `README.md` — what it does and what was measured to make it work

## License

MIT
