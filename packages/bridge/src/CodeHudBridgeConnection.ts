import type {
  ICodeHudAgentAdapter,
  ICodeHudAgentCommand,
  ICodeHudAgentSession,
  ICodeHudBridgeProvider,
  ICodeHudGlassesDescriptor,
} from "@codehud/interface";

import { CodeHudBridgeFailure } from "./CodeHudBridgeFailure";
import type { CodeHudSessionRegistry } from "./CodeHudSessionRegistry";
import type { ICodeHudSessionSubscriber } from "./ICodeHudSessionSubscriber";

/**
 * One connected device, for as long as it stays connected.
 *
 * A class, and a facade controller: it holds the subscriber the registry fans
 * out to and the welcome state that gates every other operation. One instance
 * per connection, which is what makes the gate meaningful at all, since a
 * module-level flag would be satisfied by whichever device connected first.
 *
 * It takes the transport's place without knowing what the transport is. Every
 * collaborator arrives through the constructor, so the credential check, the
 * revision check, the gate, and the refusal shape are all exercised without a
 * socket or a harness process.
 *
 * @evidence requirements/bridge-and-pairing/local-only-transport.md#bridge-runs-where-repository-is Implements the operations a device performs against the process that owns the harnesses.
 * @evidence specifications/local-bridge/rpc-protocol.md#spec-bridge-duplex-surface Implements the bridge half of the duplex surface, including the rule that a device declares its geometry before any other operation succeeds.
 * @evidence specifications/local-bridge/rpc-protocol.md#spec-bridge-refusal-channel Refuses a bad credential, a disagreeing revision, an unknown session, and a harness that would not launch in the one shape, with no other failure reaching a device.
 * @author Samchon
 */
export class CodeHudBridgeConnection implements ICodeHudBridgeProvider {
  private descriptor: ICodeHudGlassesDescriptor | null = null;

  /** Constructs a connection bound to one device and one bridge. */
  public constructor(private readonly props: CodeHudBridgeConnection.IProps) {}

  /**
   * What the connected device said it is and what it can display.
   *
   * Null until the device has been welcomed, which is the same condition every
   * operation below checks.
   *
   * @publicUnconsumed the bridge command line and the session handoff work
   *   (#31): both have to report which surfaces are attached to a session and
   *   what each of them can show, and neither can ask the device again.
   */
  public get device(): ICodeHudGlassesDescriptor | null {
    return this.descriptor;
  }

  /**
   * Accepts or refuses the device, and reports what is already running.
   *
   * The revision is compared before the credential so that a device too old to
   * have formed a correct token is told the actual problem. Both refusals carry
   * the same shape, because when nothing is happening there has to be exactly
   * one place for a wearer to look.
   *
   * The running sessions come back non-empty after a reconnect, which is the
   * normal case rather than the exception: the session belongs to the bridge
   * and survived the connection dropping.
   */
  public async hello(
    props: ICodeHudBridgeProvider.IHello,
  ): Promise<ICodeHudBridgeProvider.IWelcome> {
    if (props.version !== this.props.version)
      throw CodeHudBridgeFailure.create(
        "version",
        `this bridge speaks revision ${this.props.version} and the device speaks ${props.version}`,
      );
    if (this.props.accepts(props.token) === false)
      throw CodeHudBridgeFailure.create(
        "token",
        "the pairing code does not match this bridge",
      );

    this.descriptor = props.descriptor;
    return {
      version: this.props.version,
      host: this.props.host,
      sessions: this.props.registry.list(),
    };
  }

  /** Reports every harness family the host machine was probed for. */
  public async probe(): Promise<ICodeHudAgentAdapter.IProbe[]> {
    this.welcomed();
    return this.props.probe();
  }

  /**
   * Starts a harness session and subscribes this device to it.
   *
   * Subscribed from zero rather than from the session's current counter,
   * because the harness can report before this returns and a device that had to
   * ask for what it missed would be racing its own request.
   *
   * A harness that would not launch is refused as a launch failure carrying
   * what the adapter said, which is the only place a wearer away from the host
   * machine can learn why nothing started.
   */
  public async open(props: ICodeHudBridgeProvider.IOpen): Promise<string> {
    this.welcomed();
    const adapter: ICodeHudAgentAdapter | undefined = this.props.adapters.get(
      props.kind,
    );
    if (adapter === undefined)
      throw CodeHudBridgeFailure.create(
        "launch",
        `this bridge has no adapter for ${props.kind}`,
      );

    const session: ICodeHudAgentSession = await adapter
      .open(props)
      .catch((thrown: unknown) => {
        throw CodeHudBridgeFailure.create(
          "launch",
          CodeHudBridgeConnection.reason(thrown),
        );
      });

    this.props.registry.adopt(session, {
      kind: props.kind,
      directory: props.directory,
    });
    this.props.registry.attach(session.id, 0, this.props.subscriber);
    return session.id;
  }

  /** Subscribes this device to a session that is already running. */
  public async attach(session: string, from: number): Promise<void> {
    this.welcomed();
    this.props.registry.attach(session, from, this.props.subscriber);
  }

  /** Delivers one instruction to a session. */
  public async send(
    session: string,
    command: ICodeHudAgentCommand,
  ): Promise<void> {
    this.welcomed();
    await this.props.registry.send(session, command);
  }

  /** Ends a session and releases its harness process. */
  public async close(session: string): Promise<void> {
    this.welcomed();
    await this.props.registry.close(session);
  }

  /**
   * Refuses anything attempted before the device has been welcomed.
   *
   * Reported as a credential refusal rather than a fifth cause. Nothing on this
   * connection has been authorized yet, which is what a device is being told,
   * and the protocol admits four refusals precisely so that a fifth cannot
   * arrive somewhere the display has no phrasing for it.
   */
  private welcomed(): void {
    if (this.descriptor === null)
      throw CodeHudBridgeFailure.create(
        "token",
        "no pairing code has been presented on this connection",
      );
  }
}
export namespace CodeHudBridgeConnection {
  /**
   * Everything one connection needs, and nothing it could reach for itself.
   *
   * The credential arrives as a predicate rather than as the token, so that the
   * issued value is held in one place and a connection cannot log it, return
   * it, or compare it the wrong way.
   */
  export interface IProps {
    /** Protocol revision this bridge implements. */
    version: number;

    /** Hostname reported to the device, so a wearer knows which machine. */
    host: string;

    /** Whether a presented credential is this bridge's. */
    accepts: (token: unknown) => boolean;

    /** Sessions this bridge owns. */
    registry: CodeHudSessionRegistry;

    /** Where this device's observations are delivered. */
    subscriber: ICodeHudSessionSubscriber;

    /** Harness adapters this bridge can launch, by family. */
    adapters: ReadonlyMap<
      ICodeHudBridgeProvider.IOpen["kind"],
      ICodeHudAgentAdapter
    >;

    /** Reports what the host machine was probed for. */
    probe: () => Promise<ICodeHudAgentAdapter.IProbe[]>;
  }

  /**
   * Renders whatever an adapter threw as something a wearer can read.
   *
   * The same problem the harness probe solves, in the one other place a
   * rejection from a third party crosses into text a display has to carry. A
   * default `toString` reaching the glasses tells a wearer less than nothing.
   */
  export const reason = (thrown: unknown): string =>
    thrown instanceof Error
      ? thrown.message
      : typeof thrown === "string"
        ? thrown
        : "the harness did not report why it would not start";
}
