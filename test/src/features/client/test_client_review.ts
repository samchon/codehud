import { CodeHudSessionClient } from "@codehud/client";
import type {
  ICodeHudBridgeProvider,
  ICodeHudGlassesDescriptor,
} from "@codehud/interface";
import { CodeHudContext } from "@codehud/projection";

import { Assert } from "../internal/assert";
import { Stream } from "../internal/stream";

/**
 * A wearer walks back through a session without the bridge hearing about it.
 *
 * Review is local in every sense the product cares about: no agent turn, no
 * round trip, no money, and it works while the bridge is unreachable — which is
 * exactly when a wearer wants to read back what already happened. The fold it
 * moves through belongs to the client, so the move belongs there too; a host
 * handed a fold in order to move a cursor would have been handed the means to
 * rewrite it.
 *
 * Scenarios:
 *
 * 1. Moving back enters review and shows an older entry, and the frame says
 *    review rather than the newest content.
 * 2. Moving forward walks toward newer entries, and latest leaves review.
 * 3. Nothing about it reaches the bridge, which is the property that makes it
 *    usable with the bridge gone.
 * 4. A session with no history moves nowhere and stays followable, which is
 *    what a wearer saying *back* before anything has arrived must get. It is
 *    also what makes the unheld case need no guard of its own.
 */
export async function test_client_review(): Promise<void> {
  Stream.reset();
  const descriptor: ICodeHudGlassesDescriptor = {
    vendor: "Test",
    model: "Simulator",
    geometry: { columns: 40, rows: 3, colored: false },
    capability: {
      microphone: true,
      speaker: false,
      camera: false,
      touchpad: false,
      motion: false,
    },
  };

  const asked: string[] = [];
  const bridge: ICodeHudBridgeProvider = {
    hello: async () => {
      asked.push("hello");
      return { version: 1, host: "workbench", sessions: [] };
    },
    open: async () => {
      asked.push("open");
      return "s1";
    },
    attach: async () => {
      asked.push("attach");
    },
    send: async () => {
      asked.push("send");
    },
    close: async () => {
      asked.push("close");
    },
    probe: async () => {
      asked.push("probe");
      return [];
    },
  };
  const client: CodeHudSessionClient = new CodeHudSessionClient({
    bridge,
    token: "paired",
    descriptor,
    context: CodeHudContext.DEFAULT,
  });

  for (const [call, title] of [
    ["one", "Edit one.ts"],
    ["two", "Edit two.ts"],
    ["three", "Edit three.ts"],
  ] as const)
    await client.event({
      ...Stream.tool(call, title, "finish", false),
      session: "s1",
    });
  Assert.equals(
    "three entries, newest first",
    client.state("s1").history.map((entry) => entry.title),
    ["Edit three.ts", "Edit two.ts", "Edit one.ts"],
  );

  const before: number = asked.length;
  client.review("s1", "back");
  Assert.equals(
    "moving back enters review",
    client.state("s1").review.active,
    true,
  );
  Assert.equals(
    "on the entry behind the newest",
    client.state("s1").history[client.state("s1").review.offset]?.title,
    "Edit two.ts",
  );
  Assert.equals("and the frame says so", client.frame("s1").kind, "review");

  client.review("s1", "back");
  Assert.equals(
    "again walks to the oldest",
    client.state("s1").history[client.state("s1").review.offset]?.title,
    "Edit one.ts",
  );
  client.review("s1", "forward");
  Assert.equals(
    "forward walks back toward the newest",
    client.state("s1").history[client.state("s1").review.offset]?.title,
    "Edit two.ts",
  );
  client.review("s1", "latest");
  Assert.equals(
    "and latest leaves review entirely",
    client.state("s1").review.active,
    false,
  );

  Assert.equals("none of which the bridge heard about", asked.length, before);

  // A session with nothing in it, which is what an unheld one reads as.
  client.review("unknown", "back");
  Assert.equals(
    "a session with no history does not enter review",
    client.state("unknown").review,
    { active: false, offset: 0 },
  );
  Assert.equals(
    "and is still owed every observation from the first",
    client.counter("unknown"),
    0,
  );
  Assert.equals(
    "so what it would show is what it showed before",
    client.frame("unknown").kind,
    "status",
  );
}
