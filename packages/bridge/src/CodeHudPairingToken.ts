import { randomBytes, timingSafeEqual } from "node:crypto";

/**
 * The one credential in the protocol, and how a wearer transfers it.
 *
 * A namespace: nothing here holds state or a collaborator. The bridge issues
 * one token when it starts and keeps it for the life of the process, so there
 * is no rotation schedule to own and no store to consult.
 *
 * What the token defends against is another device on a network the user
 * already operates connecting by accident. It is not a defense against a
 * hostile party with access to that network, and neither this code nor the
 * specification claims one.
 *
 * @evidence requirements/bridge-and-pairing/local-only-transport.md#bridge-local-trust-boundary Issues the single pairing credential whose scope is one bridge process on one network.
 * @evidence specifications/local-bridge/rpc-protocol.md#spec-bridge-pairing-token Implements the token the specification limits to accidental-connection defense and requires be transferable without typing.
 * @author Samchon
 */
export namespace CodeHudPairingToken {
  /**
   * Bytes of entropy behind an issued token.
   *
   * Sixteen because the token is transferred by scanning rather than by
   * reading, so its length costs the wearer nothing, and because the shorter
   * token a human could retype is exactly the affordance the specification
   * says must not be required.
   */
  export const BYTES = 16;

  /** Issues a token for one bridge process. */
  export const issue = (): string => randomBytes(BYTES).toString("base64url");

  /**
   * Compares a presented token against the issued one.
   *
   * Constant-time through `timingSafeEqual`, which costs nothing here and
   * spares the next reader from having to decide whether it mattered. The
   * length check in front of it is not a shortcut around that: `timingSafeEqual`
   * throws on differing lengths, so unequal lengths have to be answered before
   * it is reached.
   */
  export const matches = (issued: string, presented: unknown): boolean => {
    if (typeof presented !== "string") return false;
    const a: Buffer = Buffer.from(issued, "utf8");
    const b: Buffer = Buffer.from(presented, "utf8");
    return a.length !== b.length ? false : timingSafeEqual(a, b);
  };

  /**
   * Builds what the pairing code encodes.
   *
   * A URL rather than a bare token, because the client has to learn the address
   * as well as the credential and a wearer scanning a code cannot be asked for
   * either. The scheme is the transport's own, so what a device does with it is
   * connect rather than open a page.
   *
   * The host is whatever address the wearer's own network reaches the bridge
   * on. Nothing here resolves or publishes one: the specification requires no
   * publicly reachable address, and a bridge that went looking for one would be
   * claiming a property the product disclaims.
   */
  export const payload = (props: IPayload): string =>
    `ws://${props.host}:${props.port}/?token=${encodeURIComponent(props.token)}`;

  /** Where the bridge is, and what proves a device may talk to it. */
  export interface IPayload {
    /** Address on the user's own network that reaches the bridge. */
    host: string;

    /** Port the bridge is listening on. */
    port: number;

    /** Token this bridge process issued. */
    token: string;
  }
}
