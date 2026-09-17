import type { ICodeHudAgentEvent } from "@codehud/interface";

/**
 * Somewhere a session's observations are delivered.
 *
 * The seam between session bookkeeping and the transport. The registry fans
 * observations out through this and knows nothing about remote calls, which is
 * what lets every retention, replay, and ordering rule be exercised without a
 * socket.
 *
 * One method rather than the client's whole surface, because fanning out is all
 * the registry does to a device. A subscriber is identified by reference, so
 * one connection's subscriber is the same value wherever it is attached.
 *
 * @evidence requirements/session-continuity/reconnect-and-replay.md#session-outlives-socket Represents an attached device as a value the session holds, so losing one changes nothing about the session.
 * @evidence specifications/session-lifecycle/attach-and-replay.md#spec-session-detach-semantics Types the independent per-client delivery the detachment semantics require.
 * @author Samchon
 */
export interface ICodeHudSessionSubscriber {
  /**
   * Hands one observation to the device.
   *
   * A rejection means this subscriber is gone; the registry drops it and keeps
   * the session running. A device that stopped answering must never be able to
   * stall the harness it was watching.
   */
  deliver(event: ICodeHudAgentEvent): Promise<void>;
}
