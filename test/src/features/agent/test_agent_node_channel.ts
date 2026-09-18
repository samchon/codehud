import { CodeHudNodeChannel } from "@codehud/agent";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { Readable } from "node:stream";

import { Assert } from "../internal/assert";

/**
 * The framing between a pipe and a line, which is a rule and lives only here.
 *
 * `CodeHudNodeChannel` is the one file in the harness adapter that knows a
 * process exists, and its own documentation used to say that no test was needed
 * because every rule lives in the normalizer and the session. Both halves of
 * that sentence were written down together with the rule it overlooked: a
 * harness writes one JSON object per line, a pipe delivers bytes, and a chunk
 * boundary is not a line boundary. Nothing else in the repository reassembles
 * them.
 *
 * It was wrong at the end of the stream. A final line with no newline after it
 * stayed in the buffer and went out with the loop, and that line is the one
 * that ends a turn on both harnesses — `result` on Claude Code,
 * `turn/completed` on Codex. Every observation of the turn arrived and then no
 * result at all: a display resting on the last thing the agent said, about work
 * that had already finished, with nothing to say what had happened.
 *
 * Driven against a fake process rather than a real one. What is being checked
 * is arithmetic on a buffer, and spawning something to produce bytes would make
 * the case slower, flakier, and no more truthful.
 *
 * Scenarios:
 *
 * 1. A line split across two chunks is one line, not two fragments and not a
 *    parse failure.
 * 2. Several lines in one chunk are several lines.
 * 3. A blank line and a line that will not parse are skipped, and the ones
 *    after them still arrive — a harness also writes diagnostics, and one
 *    unreadable line is not a reason to end a session a wearer is watching.
 * 4. A byte-order mark at the head of a line does not make it unreadable. This
 *    is the one input the trim decides, and finding that out took a mutation
 *    that stayed green: a `\r\n` ending survives whether or not anything trims
 *    it, because a carriage return is JSON whitespace and `JSON.parse` skips
 *    it. A BOM is not, and throws. On Windows that is the difference between
 *    reading a harness's first line and silently skipping it — which on both
 *    families is the line that opens the session.
 * 5. A final line with no trailing newline arrives. This is the regression.
 * 6. A JSON value that is falsy is still a line: `null`, `0` and `false` are
 *    what a harness sends when it means them, and a framing that tested the
 *    parsed value for truth would swallow all three.
 * 7. An instruction is written as one line with one newline, and writing after
 *    the channel is closed is refused rather than dropped.
 * 8. Closing twice ends the input once, and a process that has already exited
 *    is not signalled — killing something that was about to exit cleanly loses
 *    whatever it had left to say.
 */
export async function test_agent_node_channel(): Promise<void> {
  /** Records what was written, and how the process was ended. */
  interface IFake {
    child: ChildProcessWithoutNullStreams;
    written: string[];
    ended: number;
    killed: number;
  }

  const fake = (chunks: readonly string[], exited: boolean = false): IFake => {
    const state: IFake = {
      child: undefined as unknown as ChildProcessWithoutNullStreams,
      written: [],
      ended: 0,
      killed: 0,
    };
    state.child = {
      stdout: Readable.from(chunks.map((c) => Buffer.from(c))),
      stdin: {
        write: (
          value: string,
          done: (error: Error | null) => void,
        ): boolean => {
          state.written.push(value);
          done(null);
          return true;
        },
        end: (): void => {
          state.ended += 1;
        },
      },
      exitCode: exited === true ? 0 : null,
      signalCode: null,
      kill: (): boolean => {
        state.killed += 1;
        return true;
      },
    } as unknown as ChildProcessWithoutNullStreams;
    return state;
  };

  const drain = async (chunks: readonly string[]): Promise<unknown[]> => {
    const channel: CodeHudNodeChannel = new CodeHudNodeChannel(
      fake(chunks).child,
    );
    const seen: unknown[] = [];
    for await (const line of channel.lines) seen.push(line);
    return seen;
  };

  // 1-4. What a pipe does to lines.
  Assert.equals(
    "a line split across chunks is one line",
    await drain(['{"a":', "1}\n"]),
    [{ a: 1 }],
  );
  Assert.equals(
    "several lines in one chunk are several lines",
    await drain(['{"a":1}\n{"a":2}\n']),
    [{ a: 1 }, { a: 2 }],
  );
  Assert.equals(
    "a blank line and an unreadable one are skipped, and what follows still arrives",
    await drain(["\n", "starting up…\n", '{"a":3}\n']),
    [{ a: 3 }],
  );
  Assert.equals(
    "a CRLF ending is read, though JSON's own whitespace is what allows it",
    await drain(['{"a":1}\r\n{"a":2}\r\n']),
    [{ a: 1 }, { a: 2 }],
  );
  Assert.equals(
    "and a byte-order mark in front of a line does not make it unreadable",
    await drain(['\uFEFF{"a":1}\n{"a":2}\n']),
    [{ a: 1 }, { a: 2 }],
  );

  // 5. The regression: the line that ends the turn.
  Assert.equals(
    "a final line with no newline after it still arrives",
    await drain(['{"type":"assistant"}\n{"type":"result"}']),
    [{ type: "assistant" }, { type: "result" }],
  );
  Assert.equals(
    "and a stream that is only that line is not an empty stream",
    await drain(['{"type":"result"}']),
    [{ type: "result" }],
  );

  // 6. A falsy line is a line.
  Assert.equals(
    "null, zero and false are lines the harness meant to send",
    await drain(["null\n", "0\n", "false\n", '""\n']),
    [null, 0, false, ""],
  );

  // 7. What goes the other way.
  const writing: IFake = fake([]);
  const channel: CodeHudNodeChannel = new CodeHudNodeChannel(writing.child);
  await channel.write({ type: "user", text: "carry on" });
  Assert.equals(
    "an instruction is one line with one newline",
    writing.written,
    ['{"type":"user","text":"carry on"}\n'],
  );
  await channel.close();
  await Assert.throws("writing after closing is refused", () =>
    channel.write({ type: "user", text: "too late" }),
  );
  Assert.equals(
    "and nothing more reached the process",
    writing.written.length,
    1,
  );

  // 8. Ending, once, and without a signal that is not needed.
  Assert.equals("closing ends the input once", writing.ended, 1);
  Assert.equals("and signals a process that is still there", writing.killed, 1);
  await channel.close();
  Assert.equals("closing again ends nothing further", writing.ended, 1);

  const gone: IFake = fake([], true);
  const finished: CodeHudNodeChannel = new CodeHudNodeChannel(gone.child);
  await finished.close();
  Assert.equals(
    "a process that has already exited is not signalled",
    gone.killed,
    0,
  );
}
