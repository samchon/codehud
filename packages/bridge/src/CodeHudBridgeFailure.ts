import type { ICodeHudBridgeProvider } from "@codehud/interface";

/**
 * Builds the one refusal the protocol admits, and recognizes it coming back.
 *
 * A namespace rather than a class, and deliberately not an `Error` subclass.
 * Measured against tgrid 1.2.1 with a real server and client over a socket, a
 * rejection never arrives as the class it left as: the caller receives a plain
 * object, so `instanceof` is false on the other side no matter what was thrown.
 * What differs is the payload.
 *
 * ```text
 * throw new Error("token is not valid")
 *   -> { name, stack, message }          stack included, multiple kilobytes
 * throw { cause: "token", message: "…" }
 *   -> { cause, message }                exactly the contract, nothing else
 * ```
 *
 * So the refusal is a plain value. A wearer reading a narrow display has no use
 * for a stack trace, and shipping one across the connection on every refused
 * request would put the bridge's internal paths on someone's glasses.
 *
 * @evidence requirements/bridge-and-pairing/local-only-transport.md#bridge-single-rejection-channel Produces every refusal in one shape, whatever caused it.
 * @evidence specifications/local-bridge/rpc-protocol.md#spec-bridge-refusal-channel Implements the uniform failure result across the credential, session, version, and launch causes.
 * @author Samchon
 */
export namespace CodeHudBridgeFailure {
  const CAUSES: readonly ICodeHudBridgeProvider.IFailure.Cause[] = [
    "token",
    "version",
    "session",
    "launch",
  ];

  /**
   * Characters a refusal message may carry across the connection.
   *
   * Not a display-fitting rule: the composer fits text to the geometry it has,
   * and the bridge does not know the geometry when it refuses a `hello`. This
   * bounds what crosses the wire and enters a fold, so that a harness that
   * failed to launch and printed a page of diagnostics to standard error
   * contributes a sentence rather than the page.
   */
  export const LIMIT = 200;

  /**
   * Builds a refusal, shortening a message that came from somewhere else.
   *
   * The ellipsis is appended within the limit rather than beyond it, so the
   * result is never longer than {@link LIMIT} regardless of what was passed.
   */
  export const create = (
    cause: ICodeHudBridgeProvider.IFailure.Cause,
    message: string,
    limit: number = LIMIT,
  ): ICodeHudBridgeProvider.IFailure => {
    const collapsed: string = message.replace(/\s+/gu, " ").trim();
    return {
      cause,
      message:
        collapsed.length <= limit
          ? collapsed
          : `${collapsed.slice(0, Math.max(0, limit - 1))}…`,
    };
  };

  /**
   * Recognizes a refusal that has crossed the connection.
   *
   * Written for the client half, which cannot use `instanceof` for the reason
   * the namespace documentation records. Checks the two contract fields rather
   * than a marker property, because the value arriving is whatever survived
   * serialization and nothing more.
   */
  export const is = (
    value: unknown,
  ): value is ICodeHudBridgeProvider.IFailure => {
    if (typeof value !== "object" || value === null) return false;
    const candidate: Record<string, unknown> = value as Record<string, unknown>;
    return (
      typeof candidate["message"] === "string" &&
      CAUSES.includes(candidate["cause"] as never)
    );
  };
}
