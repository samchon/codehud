import type {
  ICodeHudAgentAdapter,
  ICodeHudAgentDescriptor,
  ICodeHudAgentSession,
} from "@codehud/interface";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

import { CodeHudClaudeSession } from "./CodeHudClaudeSession";
import { CodeHudNodeChannel } from "./CodeHudNodeChannel";
import { CodeHudNodeRunner } from "./CodeHudNodeRunner";
import type { ICodeHudClaudeChannel } from "./ICodeHudClaudeChannel";

/**
 * Launches Claude Code and hands back a conversation.
 *
 * A class, and a facade controller for one harness family. It owns the two
 * things only launching can decide: which arguments the process gets, and the
 * handshake that has to complete before the conversation begins.
 *
 * The arguments are not a style choice. Three of them together are what make
 * the harness ask a wearer before it acts, and one is a value the command
 * line's own help does not list:
 *
 * ```text
 * --input-format stream-json        so this process can answer at all
 * --permission-prompt-tool stdio    the sentinel for "the host answers over stdio"
 * an initialize control request     sent before the first instruction
 * ```
 *
 * Measured, not assumed. Without all three the harness denies every gated tool
 * automatically: no hang, no error, and nobody asked. The wearer would watch an
 * agent refuse its own work and have no way to intervene.
 *
 * @evidence requirements/agent-control/harness-abstraction.md#agent-session-lifetime Opens a harness session against a stated working directory, optionally resuming, and reports a launch failure as a failure of the open.
 * @evidence requirements/agent-control/turn-and-approval.md#agent-permission-blocking Launches the harness so that a gated action stops and asks, rather than being refused where no wearer can see it.
 * @evidence specifications/agent-harness/normalized-stream.md#spec-agent-session-open Implements the opening contract: a mandatory absolute working directory, optional resume and model, and launch failures raised by the open.
 * @author Samchon
 */
export class CodeHudClaudeAdapter implements ICodeHudAgentAdapter {
  /** Constructs an adapter bound to one resolved executable. */
  public constructor(
    /**
     * What this adapter drives, as discovery reported it.
     *
     * Carries the resolved absolute path, so launching never repeats the search
     * and never disagrees with what the wearer was told is installed.
     */
    public readonly descriptor: ICodeHudAgentDescriptor,
    private readonly props: CodeHudClaudeAdapter.IProps = {},
  ) {}

  /**
   * Starts a conversation, or fails trying.
   *
   * The handshake is awaited before returning, so a caller that immediately
   * sends an instruction cannot race it. A harness that will not start, or that
   * will not complete the handshake, fails the open rather than becoming a
   * session that reports a fatal observation a moment later: the specification
   * puts launching inside opening precisely so a wearer is told at the point
   * they asked.
   */
  public async open(
    props: ICodeHudAgentAdapter.IOpenProps,
  ): Promise<ICodeHudAgentSession> {
    const [file, args] = CodeHudNodeRunner.invocation(
      this.descriptor.executable,
      CodeHudClaudeAdapter.args(props),
      this.props.platform,
    );
    const channel: ICodeHudClaudeChannel =
      this.props.channel?.(file, args, props.directory) ??
      new CodeHudNodeChannel(
        spawn(file, args, {
          cwd: props.directory,
          stdio: ["pipe", "pipe", "pipe"],
          windowsHide: true,
        }),
      );

    const session: CodeHudClaudeSession = new CodeHudClaudeSession(
      this.props.id?.() ?? randomUUID(),
      channel,
      { resumed: props.resume !== undefined },
    );

    // Declaring the host is what earns the right to be asked. It goes first,
    // before any instruction, because a harness that has already decided how to
    // handle permissions for this turn does not revisit it.
    await channel
      .write({
        type: "control_request",
        request_id: `initialize-${session.id}`,
        request: { subtype: "initialize", hooks: {} },
      })
      .catch((thrown: unknown) => {
        void channel.close();
        throw thrown instanceof Error
          ? thrown
          : new Error("the harness would not accept a host declaration");
      });

    return session;
  }
}
export namespace CodeHudClaudeAdapter {
  /** What an adapter needs beyond the executable it drives. */
  export interface IProps {
    /**
     * Operating system to launch for, instead of the running one.
     *
     * Present so the Windows shim rewrite is reachable from either platform,
     * for the same reason it is a parameter on the runner.
     */
    platform?: string;

    /**
     * Builds the channel, instead of spawning a process.
     *
     * The seam that lets opening be exercised without a harness installed.
     * Absent is the ordinary case.
     */
    channel?: (
      file: string,
      args: string[],
      directory: string,
    ) => ICodeHudClaudeChannel;

    /** Mints session identifiers, so a test can state the ones it expects. */
    id?: () => string;
  }

  /**
   * The command line one session is launched with.
   *
   * `--print` with streamed input and output is the first-class path: several
   * other flags are documented as working only with that pair. `--verbose` is
   * required for the stream to carry anything beyond the final result.
   *
   * `--permission-mode manual` means nothing is pre-approved, which is the
   * point: every gated action becomes a question the wearer answers. It is the
   * companion to `--permission-prompt-tool stdio`, which says who answers.
   *
   * `--include-partial-messages` is what lets prose reach the display while it
   * is still being written rather than in one block at the end. The normalizer
   * knows it is on, and emits the completed message as a terminator carrying
   * nothing so the words are not shown twice.
   */
  export const args = (props: ICodeHudAgentAdapter.IOpenProps): string[] => [
    "--print",
    "--input-format",
    "stream-json",
    "--output-format",
    "stream-json",
    "--include-partial-messages",
    "--verbose",
    "--permission-mode",
    "manual",
    "--permission-prompt-tool",
    "stdio",
    ...(props.resume === undefined ? [] : ["--resume", props.resume]),
    ...(props.model === undefined ? [] : ["--model", props.model]),
  ];
}
