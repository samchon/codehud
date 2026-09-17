import {
  type ICodeHudAgentAdapter,
  type ICodeHudAgentEvent,
  ICodeHudBridgeProvider,
  type ICodeHudClientProvider,
} from "@codehud/interface";
import { hostname } from "node:os";
import { type Driver, type WebSocketAcceptor, WebSocketServer } from "tgrid";

import { CodeHudBridgeConnection } from "./CodeHudBridgeConnection";
import { CodeHudPairingToken } from "./CodeHudPairingToken";
import { CodeHudSessionRegistry } from "./CodeHudSessionRegistry";
import type { ICodeHudSessionSubscriber } from "./ICodeHudSessionSubscriber";

/**
 * The bridge process: one port, one pairing code, and every running session.
 *
 * A class, and the facade controller this package exists for. It owns a
 * listening socket, an issued credential, and the session registry, which is
 * three lifetimes a namespace could not hold and could not run two of.
 *
 * Thin on purpose. Every rule a device can observe lives in
 * {@link CodeHudBridgeConnection} or {@link CodeHudSessionRegistry}, both of
 * which take their collaborators through a constructor and neither of which
 * knows what a socket is. What is left here is the wiring only a real
 * connection can exercise, which is what makes it acceptable that no unit test
 * covers this file: there is nothing here a test could pin that reading it does
 * not already show.
 *
 * @evidence requirements/bridge-and-pairing/local-only-transport.md#bridge-runs-where-repository-is Runs on the machine holding the repository and is the process a device connects to.
 * @evidence requirements/product/charter.md#product-no-hosted-server Listens on a port the user already controls and contacts no third party to do it.
 * @evidence specifications/local-bridge/rpc-protocol.md#spec-bridge-duplex-surface Hosts the duplex surface, serving the bridge interface and driving the client interface back.
 * @evidence specifications/local-bridge/rpc-protocol.md#spec-bridge-pairing-token Issues one credential at startup, valid for the lifetime of this process, and needs no publicly reachable address to be useful.
 * @author Samchon
 */
export class CodeHudBridgeServer {
  private readonly registry: CodeHudSessionRegistry =
    new CodeHudSessionRegistry();
  private readonly server: WebSocketServer<
    null,
    ICodeHudBridgeProvider,
    ICodeHudClientProvider
  > = new WebSocketServer();
  private readonly token: string;

  /** Constructs a bridge and issues the credential it will answer to. */
  public constructor(private readonly props: CodeHudBridgeServer.IProps) {
    this.token = props.token ?? CodeHudPairingToken.issue();
  }

  /**
   * What the wearer scans to pair a device with this bridge.
   *
   * Carries the address as well as the credential, because a device needs both
   * and a wearer scanning a code can be asked for neither. The address is
   * supplied rather than discovered: the specification requires no publicly
   * reachable address, and a bridge that went looking for one would be claiming
   * a property the product disclaims.
   */
  public pairing(host: string, port: number): string {
    return CodeHudPairingToken.payload({ host, port, token: this.token });
  }

  /**
   * Starts listening.
   *
   * Every connection is accepted at the transport level and judged at the
   * protocol level, so a device presenting the wrong credential is told why in
   * the one refusal shape rather than having its socket closed under it with a
   * status code no display can render.
   *
   * The handler waits for the connection to end and then detaches it, which is
   * the whole of what a disconnection means here. It does not hold up the next
   * connection: tgrid invokes this once per upgrade rather than serially.
   */
  public async open(port: number): Promise<void> {
    await this.server.open(port, async (acceptor) => {
      const subscriber: ICodeHudSessionSubscriber = this.subscribe(acceptor);
      await acceptor.accept(this.connect(subscriber));
      await acceptor.join();
      this.registry.detach(subscriber);
    });
  }

  /**
   * Stops listening and ends every session.
   *
   * Sessions are closed here and nowhere else in this class, because a dropped
   * connection must not end the work a wearer walked away from and only the
   * process going down ends all of it.
   */
  public async close(): Promise<void> {
    await this.registry.shutdown();
    await this.server.close();
  }

  /**
   * Wraps the remote client in the seam the registry fans out through.
   *
   * Wrapped rather than passed, so the registry stays free of the transport and
   * a delivery attempted on a connection already gone is an ordinary rejection
   * it knows how to handle.
   */
  private subscribe(
    acceptor: WebSocketAcceptor<
      null,
      ICodeHudBridgeProvider,
      ICodeHudClientProvider
    >,
  ): ICodeHudSessionSubscriber {
    const driver: Driver<ICodeHudClientProvider> =
      acceptor.getDriver<ICodeHudClientProvider>();
    return {
      deliver: (event: ICodeHudAgentEvent): Promise<void> =>
        driver.event(event),
    };
  }

  /** Builds the provider one device is served by. */
  private connect(
    subscriber: ICodeHudSessionSubscriber,
  ): CodeHudBridgeConnection {
    return new CodeHudBridgeConnection({
      version: ICodeHudBridgeProvider.VERSION,
      host: this.props.host ?? hostname(),
      accepts: (token: unknown): boolean =>
        CodeHudPairingToken.matches(this.token, token),
      registry: this.registry,
      subscriber,
      adapters: this.props.adapters,
      probe: this.props.probe,
    });
  }
}
export namespace CodeHudBridgeServer {
  /** Everything the bridge needs that it cannot decide for itself. */
  export interface IProps {
    /** Harness adapters this bridge can launch, by family. */
    adapters: ReadonlyMap<
      ICodeHudBridgeProvider.IOpen["kind"],
      ICodeHudAgentAdapter
    >;

    /** Reports what the host machine was probed for. */
    probe: () => Promise<ICodeHudAgentAdapter.IProbe[]>;

    /**
     * Credential to answer to, instead of issuing a fresh one.
     *
     * For a wearer who wants one code across restarts. Absent is the ordinary
     * case, and the specification binds an issued token to the lifetime of the
     * process precisely so that nothing ever has to be revoked.
     */
    token?: string;

    /**
     * Name reported to a device, instead of the machine's own.
     *
     * A wearer with several development machines reads this to tell which one
     * they just reached, so a machine whose hostname says nothing useful can be
     * made to say something else.
     */
    host?: string;
  }
}
