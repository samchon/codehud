import type { ICodeHudAgentAdapter } from "../agent/ICodeHudAgentAdapter";
import type { ICodeHudAgentCommand } from "../agent/ICodeHudAgentCommand";
import type { ICodeHudAgentDescriptor } from "../agent/ICodeHudAgentDescriptor";
import type { ICodeHudGlassesDescriptor } from "../glasses/ICodeHudGlassesDescriptor";

/**
 * What the bridge exposes to a connected device.
 *
 * Stated as a remote interface rather than a message catalogue because every
 * exchange in this direction is a request with a result. The transport is a
 * duplex remote-call channel, so the contract is two interfaces rather than a
 * frame union with correlation identifiers hand-rolled on top.
 *
 * The bridge runs on the machine holding the repository, because a coding agent
 * is a process on a filesystem and whatever opens and closes it lives on that
 * same filesystem.
 *
 * @evidence requirements/bridge-and-pairing/local-only-transport.md#bridge-runs-where-repository-is Exposes the operations a device performs against the process that owns the harnesses.
 * @evidence requirements/product/charter.md#product-no-hosted-server Names no third-party endpoint, account identifier, or issued-token service, so the only address in the contract is one host the user already controls.
 * @evidence specifications/local-bridge/rpc-protocol.md#spec-bridge-duplex-surface Types the bridge half of the duplex remote-call surface the specification fixes.
 * @evidence specifications/product-boundary/charter-refinement.md#spec-product-local-completeness Types the whole transport contract without a remote endpoint appearing anywhere in it.
 * @author Samchon
 */
export interface ICodeHudBridgeProvider {
  /**
   * Presents the pairing token and the device identity, and opens the session.
   *
   * Called once per connection, before anything else succeeds. The geometry
   * arrives here because no content can be composed without it.
   *
   * Rejects with {@link ICodeHudBridgeProvider.IFailure} when the token is wrong or
   * the protocol revisions do not agree.
   */
  hello(
    props: ICodeHudBridgeProvider.IHello,
  ): Promise<ICodeHudBridgeProvider.IWelcome>;

  /**
   * Reports every harness family the host machine was probed for.
   *
   * Includes the unavailable ones with their reasons, so a device can explain
   * an absence rather than silently offering a shorter list.
   */
  probe(): Promise<ICodeHudAgentAdapter.IProbe[]>;

  /**
   * Starts or resumes a harness session and returns its identifier.
   *
   * The caller is subscribed to the new session's observations on return; no
   * separate attach is needed for a session it opened itself.
   */
  open(props: ICodeHudBridgeProvider.IOpen): Promise<string>;

  /**
   * Subscribes to a session that is already running, from a stated counter.
   *
   * How a reconnecting device catches up and how a second surface joins a
   * session another started. The bridge resends from `from`, so a device that
   * missed nothing asks for nothing.
   */
  attach(session: string, from: number): Promise<void>;

  /**
   * Delivers one instruction to a session.
   *
   * The only operation that can change what the agent does, which is why every
   * other operation here is cheap to get wrong and this one is not.
   */
  send(session: string, command: ICodeHudAgentCommand): Promise<void>;

  /**
   * Ends a session and releases its harness process.
   *
   * Explicit rather than implied by disconnecting, because disconnecting is how
   * a wearer walks out of range and must not kill their work.
   */
  close(session: string): Promise<void>;
}
export namespace ICodeHudBridgeProvider {
  /**
   * Protocol revision both ends must agree on.
   *
   * A device and a bridge are updated independently, so the revision is stated
   * rather than assumed and a mismatch is refused with an explanation.
   */
  export const VERSION = 1;

  /**
   * What the wearer chose to launch, beyond how to launch it.
   *
   * Extends the harness-agnostic open properties with the one fact only the
   * bridge needs: which harness family to spawn.
   */
  export interface IOpen extends ICodeHudAgentAdapter.IOpenProps {
    /**
     * Harness family to launch.
     *
     * Named here rather than inferred from the working directory, because a
     * wearer routinely runs both harnesses against one repository and the
     * choice is theirs rather than the bridge's to make.
     */
    kind: ICodeHudAgentDescriptor.Kind;
  }

  /**
   * What a connecting device presents about itself.
   *
   * The pairing token is the only credential in the protocol. Its scope is one
   * bridge process reachable over one network the user already controls, and
   * what it defends against is another device on that network connecting by
   * accident rather than a hostile party with access to it.
   *
   * @evidence requirements/bridge-and-pairing/local-only-transport.md#bridge-local-trust-boundary Carries the single pairing credential whose scope is one bridge process on one network.
   * @evidence specifications/local-bridge/rpc-protocol.md#spec-bridge-pairing-token Types the credential the specification limits to accidental-connection defense.
   */
  export interface IHello {
    /** Protocol revision the device implements. */
    version: number;

    /** Pairing token the bridge issued when it started. */
    token: string;

    /** What the connecting device is and what it can do. */
    descriptor: ICodeHudGlassesDescriptor;
  }

  /**
   * What the bridge reports once it has accepted a device.
   *
   * The session list is non-empty after a reconnect, which is the normal case:
   * the session belongs to the bridge and survived the connection dropping.
   *
   * @evidence requirements/session-continuity/reconnect-and-replay.md#session-outlives-socket Advertises the sessions that survived a dropped connection so a returning device can reattach.
   * @evidence specifications/session-lifecycle/attach-and-replay.md#spec-session-detach-semantics Types the running-session advertisement detachment semantics require.
   */
  export interface IWelcome {
    /** Protocol revision the bridge implements. */
    version: number;

    /**
     * Hostname of the machine running the bridge.
     *
     * Displayed so a wearer with more than one development machine can tell
     * which one they just reached.
     */
    host: string;

    /** Sessions already running that the device may attach to. */
    sessions: ISession[];
  }

  /**
   * A running session as advertised to a connecting device.
   *
   * Carries the harness's own session identifier as well as the bridge's, so
   * work started by voice can be resumed at a terminal on the host machine and
   * work started at that terminal can be attached from the glasses.
   *
   * @evidence requirements/session-continuity/reconnect-and-replay.md#session-handoff Exposes the harness-native identifier that lets the same session be picked up at either surface.
   * @evidence specifications/session-lifecycle/attach-and-replay.md#spec-session-handoff-identity Types the shared identity that removes any reconciliation step from handoff.
   */
  export interface ISession {
    /** Identifier the device addresses this session by. */
    id: string;

    /**
     * Identifier the harness itself uses for the conversation.
     *
     * What a terminal on the host passes to resume the same work. Absent for a
     * harness that reports none, which makes that session bridge-only.
     */
    native?: string;

    /** Harness family driving the session. */
    kind: ICodeHudAgentDescriptor.Kind;

    /** Absolute working directory the session is operating in. */
    directory: string;

    /**
     * Highest observation counter the bridge has produced for this session.
     *
     * Lets a reconnecting device ask only for what it missed instead of
     * replaying a long turn from the beginning.
     */
    sequence: number;
  }

  /**
   * Why the bridge refused an operation.
   *
   * One shape for a bad token, an unknown session, a protocol mismatch, and a
   * harness that would not launch, because when nothing is happening there must
   * be exactly one place for a wearer to look.
   *
   * @evidence requirements/bridge-and-pairing/local-only-transport.md#bridge-single-rejection-channel Reports every refusal in one form, short enough to read on the display.
   * @evidence specifications/local-bridge/rpc-protocol.md#spec-bridge-refusal-channel Types the uniform failure result the specification requires across all four causes.
   */
  export interface IFailure {
    /** Which refusal this is. */
    cause: IFailure.Cause;

    /**
     * Why the operation was refused, phrased for a narrow display.
     *
     * Short enough to read on the glasses, because a wearer who cannot reach
     * the host machine still has to understand why they are stuck.
     */
    message: string;
  }
  export namespace IFailure {
    /**
     * The four things that can be refused.
     *
     * Closed, because a fifth would be a refusal with nowhere to appear on the
     * display and no phrasing a wearer could act on.
     */
    export type Cause = "token" | "version" | "session" | "launch";
  }
}
