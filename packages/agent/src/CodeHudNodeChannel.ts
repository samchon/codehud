import type { ChildProcessWithoutNullStreams } from "node:child_process";

import type { ICodeHudHarnessChannel } from "./ICodeHudHarnessChannel";

/**
 * A running harness process, reached through Node.
 *
 * Deliberately thin, and the only file in this adapter that knows a process
 * exists. Every rule about what the harness's output means lives in the
 * normalizer, and every rule about what a wearer's instruction becomes lives in
 * the session; both are exercised against this seam rather than against a pipe.
 *
 * What it does own is the framing, and that is a rule like any other. The
 * harness writes one JSON object per line, but a pipe delivers bytes, so a line
 * can arrive in pieces or several can arrive together, and a chunk boundary is
 * not a line boundary. Getting that wrong produces a parse error on perfectly
 * good output, or loses a line that was never malformed — which is what it did:
 * this file's own documentation said no test was needed while naming the one
 * rule that lives nowhere else, and the rule was wrong at the end of the
 * stream.
 *
 * @evidence requirements/agent-control/harness-abstraction.md#agent-session-lifetime Reaches the running harness process, so a session can drive one without knowing it is a process.
 * @evidence specifications/agent-harness/normalized-stream.md#spec-agent-session-open Carries the observation stream, instruction delivery, and termination the session surface is defined over.
 * @author Samchon
 */
export class CodeHudNodeChannel implements ICodeHudHarnessChannel {
  private buffer: string = "";
  private ended: boolean = false;

  /** Constructs a channel over one spawned harness. */
  public constructor(private readonly child: ChildProcessWithoutNullStreams) {}

  /**
   * Lines the harness printed, reassembled and parsed.
   *
   * A chunk that does not end on a newline leaves a partial line buffered for
   * the next one. A line that will not parse is skipped rather than thrown:
   * the harness is a third-party binary that also writes diagnostics, and one
   * unreadable line is not a reason to end a session the wearer is watching.
   */
  public get lines(): AsyncIterable<unknown> {
    const child: ChildProcessWithoutNullStreams = this.child;
    const self: CodeHudNodeChannel = this;
    return {
      [Symbol.asyncIterator]: async function* (): AsyncGenerator<unknown> {
        /**
         * One line, or nothing when there was no line there.
         *
         * `undefined` is the sentinel and is unambiguous: JSON has no literal
         * for it, so a line the harness meant to send can never parse to it.
         * `null`, `0`, `false` and `""` can, and are lines.
         *
         * The trim is not what makes a `

` ending work — a carriage return
         * is JSON whitespace and the parser skips it. What it decides is a
         * byte-order mark, which is not, and which on Windows would otherwise
         * make a harness's first line unreadable.
         */
        const take = (line: string): unknown => {
          const flat: string = line.trim();
          if (flat.length === 0) return undefined;
          try {
            return JSON.parse(flat);
          } catch {
            return undefined;
          }
        };
        for await (const chunk of child.stdout) {
          self.buffer += String(chunk);
          for (;;) {
            const at: number = self.buffer.indexOf("\n");
            if (at === -1) break;
            const line: string = self.buffer.slice(0, at);
            self.buffer = self.buffer.slice(at + 1);
            const parsed: unknown = take(line);
            if (parsed !== undefined) yield parsed;
          }
        }
        // What the process left without a newline after it. A harness that
        // writes its last line and exits owes nothing more, and the byte it did
        // not write carries no information — but that last line is the one that
        // ends the turn on both harnesses, so dropping it produced every
        // observation of a turn and then no result at all: a display resting on
        // the last thing the agent said, about work that had finished.
        const rest: unknown = take(self.buffer);
        self.buffer = "";
        if (rest !== undefined) yield rest;
      },
    };
  }

  /** Writes one line to the harness. */
  public write(value: unknown): Promise<void> {
    if (this.ended === true)
      return Promise.reject(new Error("the harness process has ended"));
    return new Promise<unknown>((resolve, reject) => {
      this.child.stdin.write(`${JSON.stringify(value)}\n`, (error) =>
        error === null || error === undefined
          ? resolve(undefined)
          : reject(error),
      );
    }).then((): void => undefined);
  }

  /**
   * Ends the process, and succeeds for one already ended.
   *
   * Closes the input first, which is how a harness reading streamed input is
   * asked to finish what it has. The signal follows only if it is still there,
   * because killing a process that was about to exit cleanly loses whatever it
   * had left to say.
   */
  public async close(): Promise<void> {
    if (this.ended === true) return;
    this.ended = true;
    this.child.stdin.end();
    if (this.child.exitCode === null && this.child.signalCode === null)
      this.child.kill();
  }
}
