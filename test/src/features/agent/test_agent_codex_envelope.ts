import { Assert } from "../internal/assert";
import { Codex } from "../internal/codex";

/**
 * What a Codex turn actually contains, pinned against drift.
 *
 * The generated bindings already make every message shape a compile error when
 * it changes. They say nothing about which messages arrive, in what order, or
 * how often, and that is what an adapter is written against. This case holds
 * those facts, and the recapture is the point: a new notification kind, a new
 * item kind, or an item that stops arriving in pairs all surface here.
 *
 * The number worth remembering is four. `ThreadItem` declares nineteen
 * variants; an ordinary turn produced four. A mapping written from the type
 * definitions would have spent most of its rules on kinds nothing emits.
 *
 * Scenarios:
 *
 * 1. Every notification the server sends is one the adapter is on notice for,
 *    and every one on notice was actually observed. The second half is the
 *    negative twin: without it the list could name anything.
 * 2. The same, for server requests and for thread item kinds.
 * 3. Every item arrives as a started and completed pair under one identifier,
 *    which is what lets a tool be reported under one call across its phases.
 * 4. Prose deltas concatenate to exactly the completed item's own text. The
 *    same hazard Claude Code has: an adapter passing both through would show
 *    every sentence twice.
 * 5. An approval blocks the thread, and the server says so explicitly with a
 *    `waitingOnApproval` flag rather than leaving it to be inferred.
 * 6. Answering resolves it, and the server confirms with `serverRequest/resolved`
 *    rather than falling silent. Measured separately: nothing resolves it on its
 *    own, so that confirmation only ever follows an answer.
 * 7. A refused command still completes its item and still ends the turn. The
 *    wearer's refusal is a decision, not a failure of the session.
 * 8. Answering changes what happens. The allowed run ran the command and the
 *    output is there; the declined run did not and it is not. This is the
 *    assertion the first version of this case was missing, and its absence let
 *    a fixture named `approve` hold a second refusal: every other rule here
 *    holds whether the command ran or not.
 */
export async function test_agent_codex_envelope(): Promise<void> {
  // Explicit, because the default coerces to strings and the rule that forbids
  // relying on that is right: these are strings, but saying so is cheaper than
  // the next reader checking.
  const ordered = (values: Iterable<string>): string[] =>
    [...values].sort((a, b) => a.localeCompare(b));

  const notifications: Set<string> = new Set();
  const requests: Set<string> = new Set();
  const items: Set<string> = new Set();

  for (const { name, stream } of Codex.ALL) {
    const sent: Codex.IMessage[] = Codex.sent(stream);
    Assert.predicate(`${name} is not empty`, sent.length > 0);

    for (const line of sent) {
      if (line.method !== undefined)
        (line.id === undefined ? notifications : requests).add(line.method);
      const kind: string | undefined = Codex.item(line);
      if (kind !== undefined) items.add(kind);
    }

    const completed: Codex.IMessage[] = sent.filter(
      (line) => line.method === "turn/completed",
    );
    Assert.equals(`${name} ends a turn exactly once`, completed.length, 1);
    Assert.equals(
      `${name} ends with that notification`,
      sent[sent.length - 1]?.method,
      "turn/completed",
    );

    // Every item that started also completed, under the same identifier.
    const started: string[] = sent
      .filter((line) => line.method === "item/started")
      .map((line) => line.params?.item?.id ?? "");
    const finished: string[] = sent
      .filter((line) => line.method === "item/completed")
      .map((line) => line.params?.item?.id ?? "");
    Assert.equals(
      `${name} completes every item it starts`,
      ordered(started),
      ordered(finished),
    );
    Assert.predicate(
      `${name} identifies each of them`,
      started.every((id) => id.length > 0),
    );
  }

  for (const seen of notifications)
    Assert.predicate(
      `${seen} is a notification the adapter is on notice for`,
      Codex.NOTIFICATIONS.includes(seen),
    );
  for (const declared of Codex.NOTIFICATIONS)
    Assert.predicate(
      `${declared} was actually observed`,
      notifications.has(declared),
    );

  Assert.equals(
    "the server asked exactly what was expected of it",
    ordered(requests),
    [...Codex.REQUESTS],
  );
  Assert.equals("and produced exactly these item kinds", ordered(items), [
    ...Codex.ITEMS,
  ]);

  // Prose arrives twice, as deltas and as the completed item. An adapter that
  // forwarded both would double every sentence on the display.
  const deltas: string = Codex.sent(Codex.PLAIN)
    .filter((line) => line.method === "item/agentMessage/delta")
    .map((line) => line.params?.delta ?? "")
    .join("");
  const whole: string = Codex.sent(Codex.PLAIN)
    .filter(
      (line) =>
        line.method === "item/completed" && Codex.item(line) === "agentMessage",
    )
    .map((line) => line.params?.item?.text ?? "")
    .join("");
  Assert.predicate("there were deltas to fold", deltas.length > 0);
  Assert.equals("folded deltas equal the completed item", deltas, whole);

  const blocked: Codex.IMessage | undefined = Codex.sent(Codex.APPROVE).find(
    (line) =>
      line.method === "thread/status/changed" &&
      (line.params?.status?.activeFlags ?? []).includes("waitingOnApproval"),
  );
  Assert.predicate(
    "an approval blocks the thread, and the server says so",
    blocked !== undefined,
  );

  for (const { name, stream } of [
    { name: "approve", stream: Codex.APPROVE },
    { name: "refuse", stream: Codex.REFUSE },
  ]) {
    const asked: Codex.IMessage[] = Codex.sent(stream).filter(
      (line) => line.method === "item/commandExecution/requestApproval",
    );
    const resolved: Codex.IMessage[] = Codex.sent(stream).filter(
      (line) => line.method === "serverRequest/resolved",
    );
    Assert.predicate(`${name} was asked at least once`, asked.length > 0);
    Assert.equals(
      `${name} resolves every request it makes`,
      resolved.length,
      asked.length,
    );
    Assert.predicate(
      `${name} identifies each question it asks`,
      asked.every((line) => typeof line.id === "number"),
    );
  }

  // The distinction the fixtures are named for, and the one that has to be
  // checked explicitly because nothing else here would notice its absence.
  Assert.equals(
    "an allowed command ran",
    Codex.command(Codex.APPROVE)?.status,
    "completed",
  );
  Assert.predicate(
    "and its output came back",
    (Codex.command(Codex.APPROVE)?.aggregatedOutput ?? "").includes("hello"),
  );
  Assert.equals(
    "a declined command did not run",
    Codex.command(Codex.REFUSE)?.status,
    "declined",
  );
  Assert.equals(
    "and produced no output",
    Codex.command(Codex.REFUSE)?.aggregatedOutput,
    null,
  );

  Assert.predicate(
    "a refused command still completes its item",
    Codex.sent(Codex.REFUSE).some(
      (line) =>
        line.method === "item/completed" &&
        Codex.item(line) === "commandExecution",
    ),
  );
  Assert.equals(
    "and the turn still ends",
    Codex.sent(Codex.REFUSE).filter((line) => line.method === "turn/completed")
      .length,
    1,
  );
}
