import {
  CodeHudCodexAdapter,
  CodeHudCodexSession,
  type ICodeHudHarnessChannel,
} from "@codehud/agent";
import type {
  ICodeHudAgentAdapter,
  ICodeHudAgentDescriptor,
  ICodeHudAgentEvent,
} from "@codehud/interface";
import { TestValidator } from "@nestia/e2e";

import { Codex } from "../internal/codex";

/**
 * An answer reaches the server in the server's own words, and only when asked.
 *
 * This protocol has two decision vocabularies. The legacy `execCommandApproval`
 * takes `approved` and `denied`; the method a real turn uses takes `accept` and
 * `decline`. Answering the modern request in the legacy words is refused
 * silently: the command does not run, the turn continues, and nothing says why.
 * This repository has already produced a fixture named `approve` that approved
 * nothing for exactly that reason, so the rule is pinned here rather than
 * trusted.
 *
 * Correlation is two spaces, not one. Requests this session makes carry
 * identifiers the server answers; requests the server makes carry identifiers
 * this session answers. Mixing them would pair an answer with the wrong
 * question, so an answer is checked to reuse the server's identifier and an
 * instruction to mint its own.
 *
 * Scenarios:
 *
 * 1. An answer quoting the identifier the server asked under is written as a
 *    JSON-RPC result carrying that identifier and the server's own word.
 * 2. Allow and deny are distinguished by the option's declared affirmative
 *    property, never by reading a label.
 * 3. An answer quoting an unknown identifier is refused, and nothing is written.
 * 4. The same answer twice is refused the second time.
 * 5. An instruction is a request with an identifier of the session's own, not a
 *    reply to anything, and it names the thread the server opened.
 * 6. The terminal observation clears what was pending.
 * 7. Closing is idempotent; sending afterwards is refused rather than dropped.
 * 8. Opening announces the client, starts a thread in the wearer's directory,
 *    and states `approvalsReviewer: "user"` rather than relying on the default.
 */
export async function test_agent_codex_pairing(): Promise<void> {
  class Channel implements ICodeHudHarnessChannel {
    public readonly written: Record<string, unknown>[] = [];
    public closed: number = 0;
    public constructor(private readonly feed: Codex.IMessage[] = []) {}
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
    public async close(): Promise<void> {
      this.closed += 1;
    }
  }

  const drain = async (
    stream: Codex.IMessage[],
  ): Promise<{ session: CodeHudCodexSession; channel: Channel }> => {
    const channel: Channel = new Channel(stream);
    const session: CodeHudCodexSession = new CodeHudCodexSession(
      "s1",
      channel,
      {
        thread: "thread-fallback",
        directory: "/repo",
        now: () => 0,
      },
    );
    for await (const event of session.events)
      if (event.type === "permission") break;
    return { session, channel };
  };

  const asked: number =
    Codex.sent(Codex.APPROVE).find(
      (line) => line.method === "item/commandExecution/requestApproval",
    )?.id ?? -1;
  TestValidator.predicate("a real request was captured", asked >= 0);

  const allowed = await drain(Codex.APPROVE);
  await allowed.session.send({
    type: "decision",
    request: String(asked),
    option: "accept",
  });
  TestValidator.equals(
    "answering what was asked writes one reply",
    allowed.channel.written.length,
    1,
  );
  TestValidator.equals(
    "as a result carrying that identifier and the server's own word",
    allowed.channel.written[0],
    { jsonrpc: "2.0", id: asked, result: { decision: "accept" } },
  );

  const refused = await drain(Codex.APPROVE);
  await refused.session.send({
    type: "decision",
    request: String(asked),
    option: "decline",
  });
  TestValidator.equals(
    "a negative option declines, in the server's word",
    (refused.channel.written[0] as { result: { decision: string } }).result
      .decision,
    "decline",
  );

  const unknown = await drain(Codex.APPROVE);
  await TestValidator.error("an unrecognized identifier is refused", () =>
    unknown.session.send({
      type: "decision",
      request: "9999",
      option: "accept",
    }),
  );
  TestValidator.equals(
    "and nothing is written",
    unknown.channel.written.length,
    0,
  );

  const twice = await drain(Codex.APPROVE);
  await twice.session.send({
    type: "decision",
    request: String(asked),
    option: "accept",
  });
  await TestValidator.error("the same approval is not answered twice", () =>
    twice.session.send({
      type: "decision",
      request: String(asked),
      option: "decline",
    }),
  );
  TestValidator.equals(
    "so only the first answer was written",
    twice.channel.written.length,
    1,
  );

  const prompting = await drain(Codex.APPROVE);
  await prompting.session.send({ type: "prompt", text: "keep going" });
  const instruction = prompting.channel.written[0] as {
    method?: string;
    id?: number;
    params?: { threadId?: string };
  };
  TestValidator.equals(
    "an instruction is a request of its own",
    instruction.method,
    "turn/start",
  );
  // Two instructions, because "different from the one the server used" is too
  // weak to catch a counter that never advances: any constant satisfies it.
  await prompting.session.send({ type: "prompt", text: "and again" });
  const second = prompting.channel.written[1] as { id?: number };
  TestValidator.predicate(
    "with an identifier the session minted rather than one it was given",
    typeof instruction.id === "number" && instruction.id !== asked,
  );
  TestValidator.predicate(
    "and a fresh one each time, so two questions are never the same question",
    typeof second.id === "number" && second.id !== instruction.id,
  );
  TestValidator.equals(
    "naming the thread the server opened",
    instruction.params?.threadId,
    Codex.sent(Codex.APPROVE).find((line) => line.method === "thread/started")
      ?.params?.thread?.id,
  );

  const finished: Channel = new Channel(Codex.APPROVE);
  const session: CodeHudCodexSession = new CodeHudCodexSession("s1", finished, {
    thread: "thread-fallback",
    directory: "/repo",
    now: () => 0,
  });
  const seen: ICodeHudAgentEvent[] = [];
  for await (const event of session.events) seen.push(event);
  TestValidator.predicate("the turn ran to its end", seen.length > 0);
  await TestValidator.error("an answer after the turn ended is refused", () =>
    session.send({
      type: "decision",
      request: String(asked),
      option: "accept",
    }),
  );
  TestValidator.equals("and is not written", finished.written.length, 0);

  await session.close();
  await session.close();
  TestValidator.equals(
    "closing twice reaches the channel once",
    finished.closed,
    1,
  );
  await TestValidator.error("and sending afterwards is refused", () =>
    session.send({ type: "prompt", text: "too late" }),
  );

  // Opening: what the server is told before any instruction exists.
  const opening: Channel = new Channel();
  const descriptor: ICodeHudAgentDescriptor = {
    kind: "codex",
    title: "Codex",
    executable: "/usr/bin/codex",
  };
  const adapter: CodeHudCodexAdapter = new CodeHudCodexAdapter(descriptor, {
    platform: "linux",
    id: () => "s2",
    channel: (file, args) => {
      TestValidator.equals("the server is started as an app server", args, [
        "app-server",
      ]);
      TestValidator.equals(
        "using the resolved executable",
        file,
        "/usr/bin/codex",
      );
      return opening;
    },
  });
  const policy: ICodeHudAgentAdapter.IPolicy = {
    actions: { write: "confirmed" },
  };
  await adapter.open({ directory: "/repo", policy });

  TestValidator.equals(
    "the client announces itself first",
    (opening.written[0] as { method?: string }).method,
    "initialize",
  );
  const start = opening.written[1] as {
    method?: string;
    params?: Record<string, unknown>;
  };
  TestValidator.equals("then starts a thread", start.method, "thread/start");
  TestValidator.equals(
    "in the directory the wearer named",
    start.params?.["cwd"],
    "/repo",
  );
  TestValidator.equals(
    "asking about everything",
    start.params?.["approvalPolicy"],
    "untrusted",
  );
  TestValidator.equals(
    "and routing approvals to the wearer rather than trusting the default",
    start.params?.["approvalsReviewer"],
    "user",
  );
  TestValidator.equals(
    "with a sandbox the policy implies",
    start.params?.["sandbox"],
    "read-only",
  );
  TestValidator.equals(
    "which opens only for an unattended write",
    CodeHudCodexAdapter.sandbox({ actions: { write: "unattended" } }),
    "workspace-write",
  );
}
