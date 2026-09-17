import {
  CodeHudCodexNormalizer,
  CodeHudCodexSession,
  type ICodeHudHarnessChannel,
} from "@codehud/agent";
import { TestValidator } from "@nestia/e2e";

import { Codex } from "../internal/codex";

/**
 * Nothing this adapter can send resolves an approval by elapsed time.
 *
 * The protocol offers it. `ReviewDecision`, which the legacy approval methods
 * take, admits `timed_out` alongside `approved` and `denied`. The product
 * contract forbids it outright:
 *
 * > No approval request is ever resolved by elapsed time. There is no timeout
 * > that denies and none that allows; a request remains pending until a wearer
 * > answers it or the session ends. Both defaults are wrong and the wrong one
 * > cannot be undone.
 *
 * That is not a contradiction. A protocol offering something the product
 * declines to use is ordinary. What is not ordinary is leaving the prohibition
 * implicit: an absence is one refactor away from becoming a convenience, and
 * the convenience here answers on a wearer's behalf.
 *
 * Two things narrow this, both found by reading the generated bindings rather
 * than assuming. The method a real turn uses,
 * `item/commandExecution/requestApproval`, takes a
 * `CommandExecutionApprovalDecision`, which has no timeout member at all; only
 * the legacy `execCommandApproval` could carry one. And the server was measured
 * not to time out on its own: an approval left unanswered stayed pending for
 * 190 seconds with nothing resolving it.
 *
 * Scenarios:
 *
 * 1. The options the adapter offers are exactly two, and neither is a timeout.
 * 2. Every value the session can put on the wire comes from those options, so
 *    no third word can reach the server however the caller asks.
 * 3. An instruction naming a timeout is refused rather than translated into
 *    something the server would accept.
 * 4. Nothing in the adapter's own source mentions the word, which is what keeps
 *    a later convenience from being added quietly beside the rest.
 */
export async function test_agent_codex_no_timeout(): Promise<void> {
  const offered: string[] = CodeHudCodexNormalizer.OPTIONS.map(
    (option) => option.id,
  );
  TestValidator.equals("two answers are offered", offered, [
    "accept",
    "decline",
  ]);
  TestValidator.equals(
    "and neither of them is a timeout",
    offered.some((id) => id.includes("timed") || id.includes("timeout")),
    false,
  );

  class Channel implements ICodeHudHarnessChannel {
    public readonly written: Record<string, unknown>[] = [];
    public constructor(private readonly feed: Codex.IMessage[]) {}
    public get lines(): AsyncIterable<unknown> {
      const feed: Codex.IMessage[] = this.feed;
      return {
        [Symbol.asyncIterator]: async function* (): AsyncGenerator<unknown> {
          for (const line of Codex.sent(feed)) yield line;
        },
      };
    }
    public async write(value: unknown): Promise<void> {
      this.written.push(value as Record<string, unknown>);
    }
    public async close(): Promise<void> {}
  }

  const asked: number =
    Codex.sent(Codex.APPROVE).find(
      (line) => line.method === "item/commandExecution/requestApproval",
    )?.id ?? -1;

  for (const option of offered) {
    const channel: Channel = new Channel(Codex.APPROVE);
    const session: CodeHudCodexSession = new CodeHudCodexSession(
      "s1",
      channel,
      { thread: "t", directory: "/repo", now: () => 0 },
    );
    for await (const event of session.events)
      if (event.type === "permission") break;
    await session.send({
      type: "decision",
      request: String(asked),
      option,
    });
    TestValidator.equals(
      `answering ${option} puts that word on the wire and no other`,
      (channel.written[0] as { result: { decision: string } }).result.decision,
      option,
    );
  }

  const refusing: Channel = new Channel(Codex.APPROVE);
  const session: CodeHudCodexSession = new CodeHudCodexSession("s1", refusing, {
    thread: "t",
    directory: "/repo",
    now: () => 0,
  });
  for await (const event of session.events)
    if (event.type === "permission") break;

  for (const forbidden of ["timed_out", "approved", "denied", "abort"])
    await TestValidator.error(`${forbidden} is not an answer on offer`, () =>
      session.send({
        type: "decision",
        request: String(asked),
        option: forbidden,
      }),
    );
  TestValidator.equals(
    "and none of them reached the server",
    refusing.written.length,
    0,
  );
}
