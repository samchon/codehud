import {
  CodeHudHarnessProbe,
  CodeHudNodeRunner,
  type ICodeHudHarnessRunner,
} from "@codehud/agent";
import type {
  ICodeHudAgentAdapter,
  ICodeHudBridgeProvider,
} from "@codehud/interface";
import { networkInterfaces } from "node:os";
import qr from "qrcode-terminal";

import { CodeHudBridgeServer } from "./CodeHudBridgeServer";

/**
 * Starts a bridge from a terminal and shows the wearer what to scan.
 *
 * A class, because it owns the running server and the process's shutdown, but a
 * thin one: it holds no rule a device can observe. Everything that decides what
 * a device is told lives in {@link CodeHudBridgeServer} and the two collaborators
 * behind it. That is why no unit test covers this file. What is left here is
 * argument reading, a QR code, and the console, and a test of any of those would
 * be measuring the terminal.
 *
 * @evidence requirements/bridge-and-pairing/local-only-transport.md#bridge-runs-where-repository-is Starts the bridge with one command on the machine holding the repository, with no build step, service account, or configuration file between the wearer and a working state.
 * @evidence specifications/local-bridge/rpc-protocol.md#spec-bridge-pairing-token Presents the issued credential in a form the wearer transfers by scanning rather than by typing.
 * @author Samchon
 */
export class CodeHudBridgeCommand {
  /** Constructs a command bound to one set of options. */
  public constructor(private readonly props: CodeHudBridgeCommand.IProps) {}

  /**
   * Starts the bridge and prints the pairing code, one per reachable address.
   *
   * One code per address rather than a guess at the right one. A development
   * machine routinely has a wired address, a wireless one, and a container
   * bridge, and which of them the glasses can actually reach is something the
   * wearer's network knows and this process does not.
   *
   * Resolves when the bridge has stopped.
   */
  public async run(): Promise<void> {
    const runner: ICodeHudHarnessRunner =
      this.props.runner ?? new CodeHudNodeRunner();
    const probe: CodeHudHarnessProbe = new CodeHudHarnessProbe(runner);
    const bridge: CodeHudBridgeServer = new CodeHudBridgeServer({
      adapters: this.props.adapters,
      probe: () => probe.probe(),
      ...(this.props.token === undefined ? {} : { token: this.props.token }),
    });

    await bridge.open(this.props.port);
    this.announce(bridge);
    await this.until(bridge);
  }

  /**
   * Prints what a wearer needs, and what they will find missing.
   *
   * The harnesses are reported before any device connects, because a wearer who
   * paired successfully and then could not start anything would have no way to
   * tell a missing install from a broken bridge.
   */
  private announce(bridge: CodeHudBridgeServer): void {
    for (const host of this.props.hosts ?? CodeHudBridgeCommand.addresses()) {
      const payload: string = bridge.pairing(host, this.props.port);
      console.log(`\n${payload}`);
      qr.generate(payload, { small: true }, (code: string) => {
        console.log(code);
      });
    }
    if (this.props.adapters.size === 0)
      console.log(
        "No harness adapter is wired into this build yet, so a device can pair" +
          " and list sessions but opening one will be refused.",
      );
  }

  /** Resolves when the process is asked to stop, then closes the bridge. */
  private until(bridge: CodeHudBridgeServer): Promise<void> {
    return new Promise<unknown>((resolve) => {
      for (const signal of ["SIGINT", "SIGTERM"] as const)
        process.once(signal, () => resolve(undefined));
    }).then(() => bridge.close());
  }
}
export namespace CodeHudBridgeCommand {
  /** Port used when the wearer names none. */
  export const PORT = 37219;

  /** What the command was asked to do. */
  export interface IProps {
    /** Port to listen on. */
    port: number;

    /** Harness adapters to offer, by family. */
    adapters: ReadonlyMap<
      ICodeHudBridgeProvider.IOpen["kind"],
      ICodeHudAgentAdapter
    >;

    /** Credential to answer to, instead of issuing a fresh one. */
    token?: string;

    /**
     * Addresses to print a pairing code for, instead of the ones found.
     *
     * For a machine whose reachable address this process cannot see, such as one
     * behind a port forward the wearer set up themselves.
     */
    hosts?: string[];

    /**
     * How the host machine is reached when probing for harnesses.
     *
     * Present so that starting a bridge is exercisable without the binaries
     * installed; absent is the ordinary case.
     */
    runner?: ICodeHudHarnessRunner;
  }

  /**
   * Addresses on the wearer's own networks that a device might reach.
   *
   * Loopback is dropped because the glasses are not on this machine. Nothing
   * here resolves a public address or asks anything outside the host: the
   * specification requires no publicly reachable address, and going looking for
   * one would be claiming a property the product disclaims.
   */
  export const addresses = (): string[] => {
    const found: string[] = [];
    for (const entries of Object.values(networkInterfaces()))
      for (const entry of entries ?? [])
        if (entry.family === "IPv4" && entry.internal === false)
          found.push(entry.address);
    return found.length === 0 ? ["127.0.0.1"] : found;
  };

  /**
   * Reads the arguments a terminal passed and runs a bridge from them.
   *
   * Parsed by hand rather than with an argument library, because there are three
   * options and a dependency that has to be installed before the bridge starts
   * is one more thing between a wearer and a working state.
   */
  export const main = async (argv: string[]): Promise<void> => {
    const read = (name: string): string | undefined => {
      const at: number = argv.indexOf(`--${name}`);
      return at === -1 ? undefined : argv[at + 1];
    };
    const port: string | undefined = read("port");
    const token: string | undefined = read("token");
    const host: string | undefined = read("host");

    await new CodeHudBridgeCommand({
      port: port === undefined ? PORT : Number.parseInt(port, 10),
      adapters: new Map(),
      ...(token === undefined ? {} : { token }),
      ...(host === undefined ? {} : { hosts: [host] }),
    }).run();
  };
}
