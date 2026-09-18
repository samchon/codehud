import {
  CodeHudClaudeAdapter,
  type ICodeHudHarnessChannel,
} from "@codehud/agent";
import type {
  ICodeHudAgentAdapter,
  ICodeHudAgentDescriptor,
} from "@codehud/interface";

import { Assert } from "../internal/assert";

/**
 * The harness is launched so that it asks, and told who is answering first.
 *
 * Three things together are what make a gated action stop and ask a wearer, and
 * one of them is a flag value the command line's own help does not list. This
 * case exists because that combination is invisible: drop any part of it and
 * nothing errors, nothing hangs, and every gated tool is refused where no
 * wearer can see it. The agent appears to sabotage its own work.
 *
 * Scenarios:
 *
 * 1. Streamed input, the stdio permission sentinel, and manual permission mode
 *    are all present, because without all three the harness never asks.
 * 2. Partial messages are on, which is what lets prose reach the display while
 *    it is still being written.
 * 3. A resume identifier and a model are passed when the wearer chose them, and
 *    omitted entirely when they did not, rather than sent empty.
 * 4. The host declares itself before the conversation starts. A caller that
 *    sends an instruction the moment open returns cannot get ahead of it,
 *    because the handshake is awaited inside the open.
 * 5. The session is opened in the directory the wearer named.
 * 6. A harness that will not accept the declaration fails the open, and the
 *    channel is closed rather than left running. A launch failure is reported
 *    where the wearer asked, not as a fatal observation a moment later.
 * 7. A Windows shim is launched through the command processor, the same rewrite
 *    discovery uses, since the adapter launches what discovery resolved.
 */
export async function test_agent_claude_launch(): Promise<void> {
  const descriptor: ICodeHudAgentDescriptor = {
    kind: "claude-code",
    title: "Claude Code",
    executable: "/usr/bin/claude",
  };
  const policy: ICodeHudAgentAdapter.IPolicy = {
    actions: { write: "confirmed" },
  };

  class Channel implements ICodeHudHarnessChannel {
    public readonly written: unknown[] = [];
    public closed: number = 0;
    public constructor(private readonly refuse: boolean = false) {}
    public get lines(): AsyncIterable<unknown> {
      return {
        [Symbol.asyncIterator]: async function* (): AsyncGenerator<unknown> {
          // Nothing arrives; this case is about the launch, not the stream.
        },
      };
    }
    public async write(value: unknown): Promise<void> {
      if (this.refuse === true) throw new Error("the harness would not listen");
      this.written.push(value);
    }
    public async close(): Promise<void> {
      this.closed += 1;
    }
  }

  const launch = async (
    props: Partial<ICodeHudAgentAdapter.IOpenProps> = {},
    refuse: boolean = false,
  ): Promise<{
    channel: Channel;
    file: string;
    args: string[];
    directory: string;
  }> => {
    const channel: Channel = new Channel(refuse);
    let seen: { file: string; args: string[]; directory: string } = {
      file: "",
      args: [],
      directory: "",
    };
    const adapter: CodeHudClaudeAdapter = new CodeHudClaudeAdapter(descriptor, {
      platform: "linux",
      id: () => "s1",
      channel: (file, args, directory) => {
        seen = { file, args, directory };
        return channel;
      },
    });
    await adapter.open({ directory: "/repo", policy, ...props });
    return { channel, ...seen };
  };

  const plain = await launch();
  const flag = (name: string): string | undefined =>
    plain.args[plain.args.indexOf(name) + 1];

  Assert.equals("input is streamed", flag("--input-format"), "stream-json");
  Assert.equals("output is streamed", flag("--output-format"), "stream-json");
  Assert.equals(
    "and this process is named as the one that answers",
    flag("--permission-prompt-tool"),
    "stdio",
  );
  Assert.equals(
    "with nothing pre-approved",
    flag("--permission-mode"),
    "manual",
  );
  Assert.predicate(
    "prose arrives while it is being written",
    plain.args.includes("--include-partial-messages"),
  );
  Assert.predicate(
    "and the stream carries more than the final answer",
    plain.args.includes("--verbose"),
  );
  Assert.equals(
    "the session runs where the wearer said",
    plain.directory,
    "/repo",
  );

  Assert.equals(
    "nothing is resumed unless asked",
    plain.args.includes("--resume"),
    false,
  );
  Assert.equals(
    "and no model is forced",
    plain.args.includes("--model"),
    false,
  );

  const chosen = await launch({ resume: "native-7", model: "opus" });
  Assert.equals(
    "a resumed conversation is named",
    chosen.args[chosen.args.indexOf("--resume") + 1],
    "native-7",
  );
  Assert.equals(
    "and so is a chosen model",
    chosen.args[chosen.args.indexOf("--model") + 1],
    "opus",
  );

  Assert.equals(
    "the host declares itself before anything else",
    plain.channel.written[0],
    {
      type: "control_request",
      request_id: "initialize-s1",
      request: { subtype: "initialize", hooks: {} },
    },
  );
  Assert.equals(
    "and that is all the open sent",
    plain.channel.written.length,
    1,
  );

  const broken: Channel = new Channel(true);
  const refusing: CodeHudClaudeAdapter = new CodeHudClaudeAdapter(descriptor, {
    platform: "linux",
    id: () => "s2",
    channel: () => broken,
  });
  await Assert.throws("a harness that will not listen fails the open", () =>
    refusing.open({ directory: "/repo", policy }),
  );
  Assert.equals("and is not left running", broken.closed, 1);

  const shimmed: CodeHudClaudeAdapter = new CodeHudClaudeAdapter(
    { ...descriptor, executable: "C:\\npm\\claude.cmd" },
    {
      platform: "win32",
      id: () => "s3",
      channel: (file, args) => {
        Assert.equals("a Windows shim goes through cmd.exe", file, "cmd.exe");
        Assert.predicate(
          "carrying the shim and its arguments",
          args.includes("C:\\npm\\claude.cmd") && args.includes("--print"),
        );
        return new Channel();
      },
    },
  );
  await shimmed.open({ directory: "/repo", policy });
}
