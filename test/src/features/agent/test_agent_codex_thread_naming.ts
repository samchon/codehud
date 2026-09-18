import {
  CodeHudCodexSession,
  type ICodeHudHarnessChannel,
} from "@codehud/agent";
import type { ICodeHudAgentEvent } from "@codehud/interface";
import { TestValidator } from "@nestia/e2e";

import { Assert } from "../internal/assert";

/**
 * An instruction waits for the thread it is addressed to.
 *
 * This server names its thread in a *notification*, not in a reply. Between the
 * process starting and that notification arriving there is nothing an
 * instruction can be addressed to, and `turn/start` with an empty `threadId` is
 * discarded in silence: the turn never runs, no observation ever arrives, and
 * the display sits on *Connecting* for as long as the wearer is willing to wait.
 *
 * It was not a narrow window. A desk host reads a line the instant it has one,
 * so a wearer who spoke while the server was still starting got exactly that —
 * and driven against the real binary with no pause at all, a session produced
 * **zero** observations where it now produces a whole turn. Codex could not be
 * driven through the bridge by anyone who did not happen to wait first.
 *
 * Scenarios:
 *
 * 1. An instruction sent before the server has named its thread is not written.
 * 2. When the notification arrives, that instruction goes out addressed to the
 *    name the server chose.
 * 3. A session told its thread up front — a resume, or an opening that read the
 *    reply — never waits at all.
 * 4. A session whose observations nobody reads refuses rather than hanging. The
 *    identifier can only come from that stream, so a wearer is owed an answer
 *    instead of a promise that never settles.
 */
export async function test_agent_codex_thread_naming(): Promise<void> {
  /** A channel that yields its lines only when the case says so. */
  class Channel implements ICodeHudHarnessChannel {
    public readonly written: Record<string, unknown>[] = [];
    private release: ((value: undefined) => void) | null = null;
    private readonly held: Promise<undefined> = new Promise<undefined>(
      (resolve) => {
        this.release = resolve;
      },
    );

    public constructor(private readonly feed: readonly unknown[]) {}

    public get lines(): AsyncIterable<unknown> {
      const held: Promise<undefined> = this.held;
      const feed: readonly unknown[] = this.feed;
      return {
        [Symbol.asyncIterator]: async function* (): AsyncGenerator<unknown> {
          await held;
          for (const line of feed) yield line;
        },
      };
    }

    public async write(value: unknown): Promise<void> {
      this.written.push(value as Record<string, unknown>);
    }

    public async close(): Promise<void> {}

    /** Lets the server speak. */
    public speak(): void {
      this.release?.(undefined);
      this.release = null;
    }
  }

  const started: unknown = {
    method: "thread/started",
    params: { thread: { id: "01a0-the-server-named-this" } },
  };

  // 1-2. The wearer spoke first.
  const channel: Channel = new Channel([started]);
  const session: CodeHudCodexSession = new CodeHudCodexSession("s1", channel, {
    thread: "",
    directory: "/repo",
    now: () => 0,
    naming: 2_000,
  });
  const seen: ICodeHudAgentEvent[] = [];
  void (async (): Promise<void> => {
    for await (const event of session.events) seen.push(event);
  })();

  const sending: Promise<void> = session.send({
    type: "prompt",
    text: "reply with pong",
  });
  await new Promise<undefined>((resolve) => {
    setTimeout(() => resolve(undefined), 10);
  });
  TestValidator.equals(
    "nothing is written while there is nothing to address it to",
    channel.written.length,
    0,
  );

  channel.speak();
  await sending;
  TestValidator.equals(
    "and then it goes out, addressed to the name the server chose",
    (channel.written[0] as { params?: { threadId?: string } }).params?.threadId,
    "01a0-the-server-named-this",
  );
  TestValidator.equals(
    "as a turn rather than anything else",
    (channel.written[0] as { method?: string }).method,
    "turn/start",
  );

  // 3. A session that was told up front does not wait for anything.
  const resumed: Channel = new Channel([]);
  const known: CodeHudCodexSession = new CodeHudCodexSession("s2", resumed, {
    thread: "thread-from-a-resume",
    directory: "/repo",
    now: () => 0,
    naming: 2_000,
  });
  await known.send({ type: "prompt", text: "carry on" });
  TestValidator.equals(
    "an instruction on a named thread is written immediately",
    (resumed.written[0] as { params?: { threadId?: string } }).params?.threadId,
    "thread-from-a-resume",
  );

  // 4. Nobody reading, so nothing to learn from.
  const unread: Channel = new Channel([started]);
  const orphan: CodeHudCodexSession = new CodeHudCodexSession("s3", unread, {
    thread: "",
    directory: "/repo",
    now: () => 0,
    naming: 20,
  });
  await Assert.throws(
    "a session nobody is reading refuses rather than hanging",
    () => orphan.send({ type: "prompt", text: "anyone there" }),
  );
  TestValidator.equals(
    "and wrote nothing on the way to refusing",
    unread.written.length,
    0,
  );
}
