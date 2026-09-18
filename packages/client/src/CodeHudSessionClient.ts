import type {
  ICodeHudAgentCommand,
  ICodeHudAgentEvent,
  ICodeHudBridgeProvider,
  ICodeHudClientProvider,
  ICodeHudContext,
  ICodeHudFrame,
  ICodeHudGlassesDescriptor,
  ICodeHudState,
} from "@codehud/interface";
import { CodeHudComposer, CodeHudReducer } from "@codehud/projection";

/**
 * What a device holds about the sessions it is watching.
 *
 * A class, and the facade controller on the device side of the connection. It
 * owns a fold per session, the counter each fold has reached, and the answers
 * the wearer has given that the harness has not yet reported back.
 *
 * It talks to the bridge through the bridge's own interface rather than through
 * a transport. In a running system that interface is a remote-call driver; in a
 * test it can be a bridge connection handed over directly, which is what lets
 * the whole path be exercised without a socket and then again with one.
 *
 * @evidence requirements/session-continuity/reconnect-and-replay.md#session-idempotent-replay Folds an observation stream that may repeat what it already holds, and reaches the state it would have reached seeing each one once.
 * @evidence requirements/session-continuity/reconnect-and-replay.md#session-outlives-socket Survives losing a connection by remembering, per session, the counter its fold has reached.
 * @evidence specifications/session-lifecycle/attach-and-replay.md#spec-session-replay-convergence Attaches from the lowest counter it still needs and discards anything at or below what it has folded.
 * @evidence specifications/local-bridge/rpc-protocol.md#spec-bridge-duplex-surface Implements the client half of the duplex surface, which is one operation for observations and one for liveness.
 * @author Samchon
 */
export class CodeHudSessionClient implements ICodeHudClientProvider {
  private readonly reducer: CodeHudReducer;
  private readonly composer: CodeHudComposer;
  private readonly folds: Map<string, ICodeHudState> = new Map();
  private readonly counters: Map<string, number> = new Map();

  /**
   * What the bridge says each session is, including the policy it runs under.
   *
   * Held because the second confirmation is this device's to apply and this
   * device may not be the one that opened the session. Filled from the welcome
   * for a session joined, and from what was sent for a session opened here;
   * those are the same fact arriving from opposite directions.
   */
  private readonly advertised: Map<string, ICodeHudBridgeProvider.ISession> =
    new Map();

  /** Constructs a client for one device. */
  public constructor(private readonly props: CodeHudSessionClient.IProps) {
    this.reducer = new CodeHudReducer(props.context);
    this.composer = new CodeHudComposer(props.context);
  }

  /**
   * Presents this device to the bridge and adopts what is already running.
   *
   * Called on first connection and again on every reconnection; the difference
   * between the two is only what comes back. A returning device is told about
   * sessions it already holds a fold for, and attaches each one from the
   * counter that fold reached rather than from the beginning.
   */
  public async connect(): Promise<ICodeHudBridgeProvider.IWelcome> {
    const welcome: ICodeHudBridgeProvider.IWelcome =
      await this.props.bridge.hello({
        version: this.props.version ?? 1,
        token: this.props.token,
        descriptor: this.props.descriptor,
      });
    for (const session of welcome.sessions)
      this.advertised.set(session.id, session);
    for (const session of welcome.sessions) await this.attach(session.id);
    return welcome;
  }

  /**
   * Subscribes to a session from the lowest counter this device still needs.
   *
   * Zero for one it has never seen. A fold that has taken counters 0 through 4
   * asks for 5, which is the number the specification calls the lowest counter
   * still needed rather than the highest one held: the two differ by one and
   * the wrong choice silently re-folds an observation or silently skips one.
   */
  public async attach(session: string): Promise<void> {
    await this.props.bridge.attach(session, this.counters.get(session) ?? 0);
  }

  /**
   * Takes one observation into the fold this device holds.
   *
   * The reducer discards anything at or below the counter it has already
   * folded, so re-delivery is safe and is exactly what attaching from an older
   * counter produces. The counter this client remembers advances only for an
   * observation actually taken, so a duplicate never moves it.
   */
  public async event(event: ICodeHudAgentEvent): Promise<void> {
    const before: ICodeHudState =
      this.folds.get(event.session) ?? this.reducer.initialize();
    const after: ICodeHudState = this.reducer.reduce(before, event);
    this.folds.set(event.session, after);
    if (after !== before) this.counters.set(event.session, event.sequence + 1);
  }

  /**
   * Reports whether this device can be relied on to stay connected.
   *
   * Asked by the bridge rather than volunteered, so a client that has stopped
   * answering is distinguishable from one reporting that it is impaired.
   */
  public async liveness(): Promise<ICodeHudClientProvider.ILiveness> {
    return this.props.liveness?.() ?? { held: true };
  }

  /**
   * Starts a session and begins holding a fold for it.
   *
   * The bridge subscribes the opener, so there is no attach to follow and
   * nothing to record: a session this device has never folded reads as counter
   * zero already. An earlier version wrote that zero down, which a mutation
   * proved changed nothing at all.
   */
  public async open(props: ICodeHudBridgeProvider.IOpen): Promise<string> {
    const id: string = await this.props.bridge.open(props);
    this.advertised.set(id, {
      id,
      kind: props.kind,
      directory: props.directory,
      policy: props.policy,
      sequence: 0,
    });
    return id;
  }

  /**
   * What the bridge says about one session, if this device knows.
   *
   * The policy is the member worth asking for: it decides which requests a
   * wearer answers twice, and a device that attached to work another surface
   * started has no other way to learn it. Undefined for an identifier this
   * device has neither opened nor been told about, which a caller must treat as
   * "not known" rather than as "no policy" — the two are opposite answers about
   * how careful to be.
   */
  public session(id: string): ICodeHudBridgeProvider.ISession | undefined {
    return this.advertised.get(id);
  }

  /**
   * Delivers one instruction, and settles an answer once it has been delivered.
   *
   * A decision clears the pending approval on this device as soon as the bridge
   * has taken it, rather than waiting for the harness to report what it did.
   * That is what the specification asks for: a request stays in front of the
   * wearer until its answer has been *delivered*, not until its consequence
   * arrives. The difference is a wearer staring at a question they have already
   * answered while the agent thinks.
   *
   * The settle happens only after delivery succeeds. An instruction that failed
   * to reach the bridge leaves the approval where it was, because the wearer
   * still has to answer it.
   *
   * The reducer owns what settling means. This used to clear the pending field
   * here instead, which cleared one of the two things settling changes: the
   * fold kept the activity that the approval had put it in, and a fold that is
   * waiting with nothing pending composes to the idle frame. A wearer who said
   * *allow* watched the command they had just authorized disappear and the
   * display go back to reporting the directory, as if nothing were running,
   * until the harness's next observation arrived.
   */
  public async send(
    session: string,
    command: ICodeHudAgentCommand,
  ): Promise<void> {
    await this.props.bridge.send(session, command);
    if (command.type !== "decision") return;

    const fold: ICodeHudState | undefined = this.folds.get(session);
    if (fold !== undefined)
      this.folds.set(session, this.reducer.settle(fold, command.request));
  }

  /** Ends a session and forgets what this device held about it. */
  public async close(session: string): Promise<void> {
    await this.props.bridge.close(session);
    this.folds.delete(session);
    this.counters.delete(session);
  }

  /** What this device would show for a session, at its own geometry. */
  public frame(session: string): ICodeHudFrame {
    return this.composer.compose(
      this.folds.get(session) ?? this.reducer.initialize(),
      this.props.descriptor.geometry,
    );
  }

  /**
   * Moves the review cursor of a session this device holds.
   *
   * Local in every sense: no agent turn, no round trip, no money, and it works
   * while the bridge is unreachable. It lives here rather than on the host
   * because the folds are this client's, and a host that had to be handed one
   * to move a cursor would be handed the means to rewrite it.
   *
   * A session this device holds nothing for moves nowhere, without needing a
   * guard here: the reducer leaves an empty history where it is, and the fold
   * that results is the one an unheld session already reads as.
   */
  public review(session: string, move: CodeHudReducer.Move): void {
    this.folds.set(session, this.reducer.review(this.state(session), move));
  }

  /**
   * Moves a request into or out of waiting for its second answer.
   *
   * Local, and deliberately so: the harness is told nothing until the second
   * word is given, because until then nothing has been answered. It lives here
   * for the reason review does — the fold is this client's, and a host handed
   * one to set a flag would have been handed the means to clear a request.
   */
  public confirm(session: string, request: string, confirming: boolean): void {
    this.folds.set(
      session,
      this.reducer.confirm(this.state(session), request, confirming),
    );
  }

  /** The fold this device holds for a session, for a caller that needs it. */
  public state(session: string): ICodeHudState {
    return this.folds.get(session) ?? this.reducer.initialize();
  }

  /**
   * The lowest counter this device still needs for a session.
   *
   * What a reattach names. Public because a device that persists across a
   * process restart has to write it down somewhere.
   */
  public counter(session: string): number {
    return this.counters.get(session) ?? 0;
  }
}
export namespace CodeHudSessionClient {
  /** What a client needs to exist. */
  export interface IProps {
    /** The bridge, as an interface rather than as a transport. */
    bridge: ICodeHudBridgeProvider;

    /** Pairing code the wearer transferred. */
    token: string;

    /** What this device is and what it can display. */
    descriptor: ICodeHudGlassesDescriptor;

    /** Configuration the fold and the composer read. */
    context: ICodeHudContext;

    /** Protocol revision this device implements. */
    version?: number;

    /**
     * Reports whether the connection will survive backgrounding.
     *
     * Supplied by the host, because only the host knows what its operating
     * system has granted. Absent means held, which is true of a desktop
     * simulator and is the shape a device adapter overrides.
     */
    liveness?: () => ICodeHudClientProvider.ILiveness;
  }
}
