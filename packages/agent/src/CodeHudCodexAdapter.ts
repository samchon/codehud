import type {
  ICodeHudAgentAdapter,
  ICodeHudAgentDescriptor,
  ICodeHudAgentSession,
} from "@codehud/interface";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

import { CodeHudCodexSession } from "./CodeHudCodexSession";
import { CodeHudNodeChannel } from "./CodeHudNodeChannel";
import { CodeHudNodeRunner } from "./CodeHudNodeRunner";
import type { ICodeHudHarnessChannel } from "./ICodeHudHarnessChannel";

/**
 * Launches `codex app-server` and opens a thread on it.
 *
 * A class, and a facade controller for the second harness family. Opening is
 * three exchanges rather than one: the server is told who is connecting, a
 * thread is started with the policy the wearer's session runs under, and only
 * then is there something to address instructions to.
 *
 * All three are awaited inside the open, so a caller that sends an instruction
 * the moment it returns cannot get ahead of them, and a server that refuses any
 * of them fails the open rather than becoming a session that reports a fatal
 * observation a moment later.
 *
 * @evidence requirements/agent-control/harness-abstraction.md#agent-session-lifetime Opens a harness session against a stated working directory, optionally resuming, and reports a launch failure as a failure of the open.
 * @evidence requirements/agent-control/turn-and-approval.md#agent-permission-blocking Starts the thread so that a gated action stops and asks the wearer, rather than being decided by anything else.
 * @evidence specifications/agent-harness/normalized-stream.md#spec-agent-session-open Implements the opening contract: a mandatory absolute working directory, optional resume and model, and launch failures raised by the open.
 * @author Samchon
 */
export class CodeHudCodexAdapter implements ICodeHudAgentAdapter {
  /** Constructs an adapter bound to one resolved executable. */
  public constructor(
    /**
     * What this adapter drives, as discovery reported it.
     *
     * Carries the resolved absolute path, so launching never repeats the search
     * and never disagrees with what the wearer was told is installed.
     */
    public readonly descriptor: ICodeHudAgentDescriptor,
    private readonly props: CodeHudCodexAdapter.IProps = {},
  ) {}

  /**
   * Starts a conversation, or fails trying.
   *
   * The thread is started with `approvalsReviewer: "user"` even though that is
   * already the default. The alternatives route approvals to a subagent that
   * decides on the wearer's behalf, and a default is the vendor's to change
   * while the promise that a wearer decides is not.
   */
  public async open(
    props: ICodeHudAgentAdapter.IOpenProps,
  ): Promise<ICodeHudAgentSession> {
    const [file, args] = CodeHudNodeRunner.invocation(
      this.descriptor.executable,
      ["app-server"],
      this.props.platform,
    );
    const channel: ICodeHudHarnessChannel =
      this.props.channel?.(file, args, props.directory) ??
      new CodeHudNodeChannel(
        spawn(file, args, {
          cwd: props.directory,
          stdio: ["pipe", "pipe", "pipe"],
          windowsHide: true,
        }),
      );

    const exchange: CodeHudCodexAdapter.IExchange = this.props.exchange ?? {
      // Reading the reply means consuming from the same stream the session will
      // iterate, so the default cannot be written here without the session
      // losing its first messages. Opening therefore writes and does not wait,
      // and a caller that needs the thread identifier confirmed supplies this.
      call: async (): Promise<Record<string, unknown>> => ({}),
    };

    try {
      await channel.write({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          clientInfo: {
            name: "codehud",
            title: null,
            version: CodeHudCodexAdapter.VERSION,
          },
          capabilities: null,
        },
      });
      await exchange.call(channel, 1);

      await channel.write({
        jsonrpc: "2.0",
        id: 2,
        method: "thread/start",
        params: {
          cwd: props.directory,
          approvalPolicy: "untrusted",
          sandbox: CodeHudCodexAdapter.sandbox(props.policy),
          approvalsReviewer: "user",
          ...(props.model === undefined ? {} : { model: props.model }),
        },
      });
      const started: Record<string, unknown> = await exchange.call(channel, 2);

      return new CodeHudCodexSession(
        this.props.id?.() ?? randomUUID(),
        channel,
        {
          thread: CodeHudCodexAdapter.thread(started) ?? props.resume ?? "",
          directory: props.directory,
          resumed: props.resume !== undefined,
        },
      );
    } catch (thrown: unknown) {
      void channel.close();
      throw thrown instanceof Error
        ? thrown
        : new Error("the server would not open a thread");
    }
  }
}
export namespace CodeHudCodexAdapter {
  /** Version this adapter announces itself as. */
  export const VERSION = "0.1.0";

  /** What an adapter needs beyond the executable it drives. */
  export interface IProps {
    /**
     * Operating system to launch for, instead of the running one.
     *
     * Present so the Windows shim rewrite is reachable from either platform,
     * for the same reason it is a parameter on the runner.
     */
    platform?: string;

    /** Builds the channel, instead of spawning a process. */
    channel?: (
      file: string,
      args: string[],
      directory: string,
    ) => ICodeHudHarnessChannel;

    /** Reads a reply to one of the opening requests. */
    exchange?: IExchange;

    /** Mints session identifiers, so a test can state the ones it expects. */
    id?: () => string;
  }

  /**
   * Reads the reply to a request the opening made.
   *
   * A seam rather than a method, because reading a reply means consuming from
   * the same stream the session will iterate, and whoever owns that stream has
   * to be the one to do it. The bridge will supply a reader that tees; opening
   * without one still works, because the session learns the thread identifier
   * from `thread/started` moments later.
   */
  export interface IExchange {
    /** Waits for the reply to the request carrying this identifier. */
    call(
      channel: ICodeHudHarnessChannel,
      id: number,
    ): Promise<Record<string, unknown>>;
  }

  /**
   * The sandbox a policy implies.
   *
   * Three levels, and the mapping is deliberately conservative: anything the
   * wearer has to confirm means the agent cannot be trusted to write without
   * being asked, and anything unattended still stops at the workspace. Nothing
   * here ever selects full access, because a policy that removes the sandbox is
   * a decision a wearer should make at a keyboard rather than by speaking.
   */
  export const sandbox = (
    policy: ICodeHudAgentAdapter.IPolicy,
  ): "read-only" | "workspace-write" => {
    const write: ICodeHudAgentAdapter.IPolicy.Treatment | undefined =
      policy.actions["write"];
    return write === "unattended" ? "workspace-write" : "read-only";
  };

  /**
   * The thread identifier out of a `thread/start` reply.
   *
   * Reads `result.thread.id`, which is where it actually is. An earlier probe
   * of this protocol looked for `result.threadId`, found nothing, and silently
   * never started a turn at all.
   */
  export const thread = (
    reply: Record<string, unknown>,
  ): string | undefined => {
    const result: unknown = reply["result"] ?? reply;
    if (typeof result !== "object" || result === null) return undefined;
    const thread: unknown = (result as Record<string, unknown>)["thread"];
    if (typeof thread !== "object" || thread === null) return undefined;
    const id: unknown = (thread as Record<string, unknown>)["id"];
    return typeof id === "string" ? id : undefined;
  };
}
