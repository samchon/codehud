import {
  CodeHudClaudeSession,
  CodeHudCodexSession,
  type ICodeHudHarnessChannel,
} from "@codehud/agent";
import type { ICodeHudAgentEvent, ICodeHudState } from "@codehud/interface";
import { CodeHudContext, CodeHudReducer } from "@codehud/projection";

import { Assert } from "../internal/assert";

/**
 * A harness that dies says so, because nothing else was going to.
 *
 * `ICodeHudAgentEvent.IError` is defined as "the session itself breaking, and a
 * fatal instance means no further event will arrive". The Codex normalizer
 * emitted one for the server's `error` notification. The Claude normalizer
 * emitted one never, and neither session emitted one when its channel's output
 * simply stopped — which is what a harness process being killed looks like from
 * inside this adapter.
 *
 * `CodeHudSessionRegistry.pump` is written against the opposite assumption, and
 * says so in its own catch: "The adapter owns reporting a harness that died, and
 * does so as an error observation on this same stream." The stream did not carry
 * it, so the bridge stayed deliberately silent about something nobody was
 * reporting.
 *
 * What the wearer got, before this:
 *
 * ```text
 * claude, process died mid-turn -> session, message   activity: working
 * codex,  process died mid-turn -> session            activity: idle
 * ```
 *
 * A display saying an agent is working on something, and no agent. This product
 * exists to supervise a long-running agent from a surface where a wearer cannot
 * check anything else; one that died and still looks alive is the failure it is
 * for preventing. Codex's `idle` is quieter and no better: the wearer speaks to
 * a session that cannot answer, and finds out one delivery failure at a time.
 *
 * **Measured rather than assumed.** The rule "a stream that ends on its own is a
 * harness that is gone" is only true if the process does not exit when a turn
 * ends. Driven against the real binary: `claude 2.1.274` with `--print
 * --input-format stream-json --output-format stream-json` was still running two
 * seconds after its first `result` and took a second turn on the same stdin. So
 * an unexplained end of stream is death rather than completion, and reporting it
 * costs a wearer nothing on an ordinary turn.
 *
 * Scenarios:
 *
 * 1. A Claude stream that stops mid-turn ends with a fatal error, and the fold
 *    moves out of `working` into a fault a wearer can see.
 * 2. A Codex stream that stops does the same, rather than resting at idle. Its
 *    `error` notification is a different thing: that one reports a protocol
 *    failure from a process that is still there.
 * 3. A session ended on purpose reports nothing. A wearer who stopped their own
 *    work is not told it broke.
 * 4. The error is fatal, which is what tells a client to offer a restart rather
 *    than keep folding a dead session, and it clears anything the wearer was
 *    being asked — a question nobody is waiting on is worse than no question.
 * 5. The adapter's own counter stays contiguous across it, because the
 *    observation is stamped where every other one is.
 */
export async function test_agent_dead_harness(): Promise<void> {
  /** A channel whose output stops without ceremony, like a killed process. */
  class Channel implements ICodeHudHarnessChannel {
    public constructor(private readonly feed: readonly unknown[]) {}
    public get lines(): AsyncIterable<unknown> {
      const feed: readonly unknown[] = this.feed;
      return {
        [Symbol.asyncIterator]: async function* (): AsyncGenerator<unknown> {
          for (const line of feed) yield line;
        },
      };
    }
    public async write(): Promise<void> {}
    public async close(): Promise<void> {}
  }

  const folded = (events: readonly ICodeHudAgentEvent[]): ICodeHudState => {
    const reducer: CodeHudReducer = new CodeHudReducer(CodeHudContext.DEFAULT);
    let state: ICodeHudState = reducer.initialize();
    for (const event of events) state = reducer.reduce(state, event);
    return state;
  };

  // 1. Claude Code, stopped in the middle of saying something.
  const claude: CodeHudClaudeSession = new CodeHudClaudeSession(
    "s1",
    new Channel([
      { type: "system", subtype: "init", session_id: "abc", model: "opus" },
      {
        type: "assistant",
        message: { content: [{ type: "text", text: "working on it" }] },
      },
    ]),
    { now: () => 0 },
  );
  const spoken: ICodeHudAgentEvent[] = [];
  for await (const event of claude.events) spoken.push(event);
  Assert.equals(
    "the stream ends with the session breaking, not with prose",
    spoken.map((event) => event.type),
    ["session", "message", "error"],
  );
  Assert.equals(
    "and the display leaves working for a fault the wearer can see",
    folded(spoken).activity,
    "fault",
  );

  // 2. Codex, stopped before it said anything at all.
  const codex: CodeHudCodexSession = new CodeHudCodexSession(
    "s2",
    new Channel([
      { method: "thread/started", params: { thread: { id: "t1" } } },
      { method: "turn/started", params: { turn: { model: "gpt" } } },
    ]),
    { thread: "t1", directory: "/repo", now: () => 0 },
  );
  const quiet: ICodeHudAgentEvent[] = [];
  for await (const event of codex.events) quiet.push(event);
  Assert.equals(
    "the same, rather than a session that looks like it never began",
    quiet.map((event) => event.type),
    ["session", "error"],
  );
  Assert.equals(
    "and a fold that says so instead of resting at idle",
    folded(quiet).activity,
    "fault",
  );

  // 3-4. What it says, and what it does not say.
  const broke: ICodeHudAgentEvent.IError = spoken[
    spoken.length - 1
  ] as ICodeHudAgentEvent.IError;
  Assert.equals(
    "the error is fatal, which is what asks a client for a restart",
    { fatal: broke.fatal, message: broke.message },
    { fatal: true, message: "the harness stopped" },
  );

  const asked: CodeHudClaudeSession = new CodeHudClaudeSession(
    "s3",
    new Channel([
      { type: "system", subtype: "init", session_id: "abc", model: "opus" },
      {
        type: "control_request",
        request_id: "r1",
        request: {
          subtype: "can_use_tool",
          tool_name: "Write",
          input: { file_path: "/repo/a.ts" },
        },
      },
    ]),
    { now: () => 0 },
  );
  const pending: ICodeHudAgentEvent[] = [];
  for await (const event of asked.events) pending.push(event);
  Assert.equals(
    "a question nobody is left to answer does not stay in front of the wearer",
    {
      pending: folded(pending).pending?.request,
      activity: folded(pending).activity,
    },
    { pending: undefined, activity: "fault" },
  );

  // 3. A session the wearer ended is not a session that broke.
  const stopping: CodeHudClaudeSession = new CodeHudClaudeSession(
    "s4",
    new Channel([
      { type: "system", subtype: "init", session_id: "abc", model: "opus" },
    ]),
    { now: () => 0 },
  );
  await stopping.close();
  const ending: ICodeHudAgentEvent[] = [];
  for await (const event of stopping.events) ending.push(event);
  Assert.equals(
    "a session ended on purpose reports nothing about it",
    ending.map((event) => event.type),
    ["session"],
  );

  // 5. The counter the adapter promises.
  Assert.equals(
    "the counter still ascends by one and never skips",
    spoken.map((event) => event.sequence),
    spoken.map((_, index) => index),
  );
}
