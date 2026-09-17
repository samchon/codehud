import {
  CodeHudClaudeAdapter,
  CodeHudCodexAdapter,
  type ICodeHudHarnessChannel,
} from "@codehud/agent";
import type {
  ICodeHudAgentAdapter,
  ICodeHudAgentDescriptor,
} from "@codehud/interface";
import { TestValidator } from "@nestia/e2e";

import { Codex } from "../internal/codex";

/**
 * Resuming opens the conversation that was named, not a new one wearing its
 * name.
 *
 * Handoff is the promise that a session started while walking can be picked up
 * at a desk and the other way round — "the same work, not a copy of it". Every
 * other part of it was in place: the harness's own identifier is carried on the
 * session observation, the bridge advertises it, and two surfaces can answer
 * one approval. The adapter then sent `thread/start` whether or not it had been
 * handed an identifier, kept the one it was given only as a fallback for the
 * reply, and reported the result as resumed.
 *
 * That defect passes every check written against the surrounding contract. The
 * session exists, it is addressable, it has a thread identifier, and it says it
 * was resumed. What it does not have is the work. A wearer learns this from a
 * conversation that has forgotten what they were doing.
 *
 * The protocol is explicit that these are different methods, and its own
 * documentation says to "prefer using thread_id whenever possible":
 *
 * ```text
 * thread/start   → new conversation, no identifier accepted
 * thread/resume  → threadId required, overrides optional
 * ```
 *
 * Both requests are judged here against the schema the installed binary
 * generates for itself, rather than against a shape written beside the code
 * that produces it. Measured beside this: a fresh `codex app-server` lists
 * threads written by earlier ones — five of this repository's own capture runs
 * came back from `thread/list`, originator `codehud` — while `thread/loaded/list`
 * on that same fresh process is empty. Persistence is on disk and liveness is
 * per process, which is why a resume reaches work no bridge is holding.
 *
 * Scenarios:
 *
 * 1. A fresh open starts a thread and names no prior conversation.
 * 2. An open carrying a prior conversation resumes it by identifier, and never
 *    starts a thread.
 * 3. Both requests are ones the server would accept, per its own schema.
 * 4. The session's stated overrides travel with a resume as with a start, since
 *    the policy in force is the one the wearer stated for the work in hand.
 * 5. Turns are excluded from the resume, because the display is built from the
 *    observation stream rather than from the opening reply.
 * 6. The other harness resumes by the same identifier, so handoff means the
 *    same thing on both.
 */
export async function test_agent_codex_resume(): Promise<void> {
  class Channel implements ICodeHudHarnessChannel {
    public readonly written: Record<string, unknown>[] = [];
    public get lines(): AsyncIterable<unknown> {
      return {
        [Symbol.asyncIterator]: async function* (): AsyncGenerator<unknown> {
          // Nothing: this case is about what the client says, not what it hears.
        },
      };
    }
    public async write(value: unknown): Promise<void> {
      this.written.push(value as Record<string, unknown>);
    }
    public async close(): Promise<void> {}
  }

  const descriptor: ICodeHudAgentDescriptor = {
    kind: "codex",
    title: "Codex",
    executable: "/usr/bin/codex",
  };
  const policy: ICodeHudAgentAdapter.IPolicy = {
    actions: { read: "unattended", write: "attended" },
  };
  const opened = async (
    props: Partial<ICodeHudAgentAdapter.IOpenProps>,
  ): Promise<{ method: string; params: Record<string, unknown> }> => {
    const channel: Channel = new Channel();
    const adapter: CodeHudCodexAdapter = new CodeHudCodexAdapter(descriptor, {
      platform: "linux",
      id: () => "s1",
      channel: () => channel,
    });
    await adapter.open({ directory: "/repo", policy, ...props });
    const request = channel.written[1] as {
      method?: string;
      params?: Record<string, unknown>;
    };
    return { method: request.method ?? "", params: request.params ?? {} };
  };

  const fresh = await opened({});
  TestValidator.equals(
    "a fresh open starts a thread",
    fresh.method,
    "thread/start",
  );
  TestValidator.equals(
    "and names no prior conversation",
    fresh.params["threadId"],
    undefined,
  );

  const again = await opened({
    resume: "01a0b02c-d409-7ca0-96a6-3db790fb15d7",
  });
  TestValidator.equals(
    "an open carrying one resumes it instead",
    again.method,
    "thread/resume",
  );
  TestValidator.equals(
    "by the identifier the harness itself uses",
    again.params["threadId"],
    "01a0b02c-d409-7ca0-96a6-3db790fb15d7",
  );
  TestValidator.equals(
    "and never starts a thread as well",
    [fresh.method, again.method].filter((name) => name === "thread/start")
      .length,
    1,
  );

  // 3. Both are requests the server would accept, judged by its own schema.
  for (const sent of [fresh, again]) {
    const schema: Codex.ISchema | undefined =
      Codex.THREADS[sent.method]?.params;
    if (schema === undefined) throw new Error(`no schema for ${sent.method}`);
    TestValidator.equals(
      `${sent.method} is a request the server would accept`,
      Codex.admits(schema, sent.params, schema),
      [],
    );
  }

  // 4. The overrides travel with both.
  for (const [name, expected] of [
    ["cwd", "/repo"],
    ["approvalPolicy", "untrusted"],
    ["sandbox", "read-only"],
    ["approvalsReviewer", "user"],
  ] as const)
    TestValidator.equals(
      `a resumed thread states its ${name} as a fresh one does`,
      [fresh.params[name], again.params[name]],
      [expected, expected],
    );

  const chosen = await opened({ resume: "native-7", model: "gpt-5-codex" });
  TestValidator.equals(
    "and a chosen model reaches a resume too",
    chosen.params["model"],
    "gpt-5-codex",
  );

  // 5. History is not hydrated into the opening reply.
  TestValidator.equals(
    "a resume excludes the turns it would otherwise carry",
    again.params["excludeTurns"],
    true,
  );
  TestValidator.equals(
    "which a fresh open has no occasion to say",
    fresh.params["excludeTurns"],
    undefined,
  );

  // 6. The other harness resumes by the same identifier.
  const claude: string[] = CodeHudClaudeAdapter.args({
    directory: "/repo",
    policy,
    resume: "01a0b02c-d409-7ca0-96a6-3db790fb15d7",
  });
  TestValidator.equals(
    "Claude Code is handed the same conversation identifier",
    claude[claude.indexOf("--resume") + 1],
    "01a0b02c-d409-7ca0-96a6-3db790fb15d7",
  );
  TestValidator.equals(
    "and resumes nothing when nothing was named",
    CodeHudClaudeAdapter.args({ directory: "/repo", policy }).includes(
      "--resume",
    ),
    false,
  );
}
