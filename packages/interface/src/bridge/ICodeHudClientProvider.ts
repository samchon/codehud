import type { ICodeHudAgentEvent } from "../agent/ICodeHudAgentEvent";

/**
 * What a connected device exposes back to the bridge.
 *
 * Deliberately one operation. Everything the bridge needs from a device is the
 * ability to hand it an observation, and every request-shaped exchange runs the
 * other way, so a wider surface here would be capability the bridge does not
 * need and a device would have to implement.
 *
 * @evidence requirements/bridge-and-pairing/local-only-transport.md#bridge-runs-where-repository-is Exposes the client half of the connection the device opens against the repository machine.
 * @evidence specifications/local-bridge/rpc-protocol.md#spec-bridge-duplex-surface Types the client half of the duplex remote-call surface the specification fixes.
 * @author Samchon
 */
export interface ICodeHudClientProvider {
  /**
   * Delivers one normalized observation to the device.
   *
   * The overwhelming majority of traffic on the connection. The device folds it
   * under the replay guard, so redelivering an observation it already holds is
   * safe and is what an attach from an older counter produces.
   */
  event(event: ICodeHudAgentEvent): Promise<void>;

  /**
   * Reports whether the client can currently be relied on to stay connected.
   *
   * Asked by the bridge rather than volunteered, so a client that has stopped
   * answering is distinguishable from one reporting that it is impaired.
   */
  liveness(): Promise<ICodeHudClientProvider.ILiveness>;
}
export namespace ICodeHudClientProvider {
  /**
   * Whether the client will survive being put in the background.
   *
   * An agent turn routinely runs longer than a wearer looks at anything, and
   * the operating system hosting the client will stop a backgrounded process to
   * save power. A client that cannot hold its connection for the length of a
   * turn reports that here rather than presenting itself as connected, because
   * a wearer cannot tell a dead client from a thinking agent.
   *
   * @evidence requirements/bridge-and-pairing/local-only-transport.md#bridge-client-survives-backgrounding Makes the client state whether it can hold the connection through a turn, and what the user must permit for that to hold.
   * @evidence specifications/local-bridge/rpc-protocol.md#spec-bridge-client-liveness Types the liveness obligation and the required disclosure the specification attaches to it.
   */
  export interface ILiveness {
    /**
     * Whether the connection is expected to survive backgrounding right now.
     *
     * False is a reportable condition rather than an error. A client on a host
     * that grants nothing is still useful while the wearer is looking at it.
     */
    held: boolean;

    /**
     * What the user has to permit for liveness to hold, when it does not.
     *
     * Named concretely enough to act on, because the grant differs by host and
     * cannot be requested programmatically on every one of them. Absent when
     * {@link held} is true.
     */
    requires?: string;
  }
}
