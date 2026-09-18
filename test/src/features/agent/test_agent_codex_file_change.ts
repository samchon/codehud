import { CodeHudCodexNormalizer } from "@codehud/agent";
import type { ICodeHudAgentEvent } from "@codehud/interface";
import { TestValidator } from "@nestia/e2e";

import { Assert } from "../internal/assert";
import { Codex } from "../internal/codex";

/**
 * A Codex approval says what it is about, and a file change is shown as work.
 *
 * Seen in the first end-to-end Codex run through the bridge. The wearer was
 * shown a box reading *Wider access requested* over the working directory and
 * asked to allow or deny it. What was actually being asked was whether an agent
 * could write `hello.txt`, and the phrase on the display is the one this adapter
 * reserves for the request that really is about access. Two different questions
 * looked identical on the one surface where a follow-up cannot be asked.
 *
 * Two gaps produced it, and the second is the larger. The request carries no
 * subject: `FileChangeRequestApprovalParams` is `threadId`, `turnId`, `itemId`,
 * `startedAtMs`, an optional reason and an optional grant root, and no path at
 * all. And the item that does carry the paths was absorbed — `item` handled
 * three kinds and dropped the rest — so a Codex write left no observation, no
 * line in the history, and nothing for the `itemId` to name.
 *
 * The item arrives first, which is what makes the fix possible rather than
 * merely desirable. It is the same trick the command executions already use:
 * remember the description under the identifier, and let the question find it.
 *
 * Scenarios:
 *
 * 1. The captured turn produces a tool observation for the file it wrote, at
 *    both phases, under the item's own identifier.
 * 2. Its title is the server's own word for the change and the file it names,
 *    rather than a phrase invented here.
 * 3. The approval that follows is titled from that item instead of from the
 *    escalation phrase, and still reports the class it would perform.
 * 4. The escalation phrase still belongs to the request it was written for: a
 *    permissions request says it, whether or not it names an item this adapter
 *    happens to remember, because it is asking to widen what the agent may do
 *    rather than to perform the item that prompted it.
 * 5. An approval for an item nobody saw — one arriving ahead of its item, or a
 *    resumed conversation — falls back rather than inventing a subject; the
 *    legacy patch approval, which carries its own paths and no identifier, is
 *    described from those; and a request carrying a grant root is reported as
 *    the access request it is, with the change on the line below.
 * 6. A reason the server did give is not lost when the item supplies a better
 *    title: it moves to the line under it, which a file-change request leaves
 *    empty because it carries no working directory.
 * 7. The description covers the change shapes the bindings declare — added,
 *    deleted, updated, moved — and counts the rest rather than listing them.
 *    A move names both ends when it has both and one end when it does not.
 * 8. A command execution that names no command line is reported as an
 *    execution rather than as a write, and titled from the item it names. The
 *    bindings declare `command?: string | null` and say why — a stdin approval
 *    and a zsh-exec-bridge subcommand approval are both of those — and read as
 *    a string that null threw out of the normalizer, which is the session's
 *    read loop and therefore the whole conversation.
 *
 *    The throw itself is now the type system's to prevent: the loose interface
 *    was declaring `command`, `cwd` and `reason` non-nullable against bindings
 *    that declare all three nullable, and with that corrected, removing the
 *    guard no longer compiles. What this scenario pins is the part a type
 *    cannot — which class such a request performs, and what it is called.
 * 9. A change that removes a file is reported as a deletion rather than as a
 *    write, from the item or from a legacy request's own map, and deletion
 *    wins when a change set contains both. That is the class this product
 *    asks about twice, and until the item was read nothing could enter it
 *    through a patch — an agent that removed a file through its patch
 *    mechanism rather than through `rm` was confirmed once, as a write.
 * 10. One item is one judgment. What was decided when the item was first seen
 *    survives a completion that reports a narrower change set — a precaution
 *    rather than an observation, because the captures show a completion
 *    repeating what its start carried, and stated so the description and the
 *    class cannot behave differently from one another.
 * 11. And under all of it, the floor each method falls to when neither the
 *    request nor any item it names said anything: a command execution
 *    executes, a patch writes, and a permissions request is absent from that
 *    table rather than mapped, because a request the desk host cannot classify
 *    is the one it confirms twice.
 *
 * Every comparison of a whole value goes through {@link Assert.equals}, which
 * scenario 0 arms. `TestValidator.equals` accepts a member the expected value
 * declares and the actual one does not, and the members this case exists to
 * pin — the title on an approval, the line under it — are optional ones.
 */
export async function test_agent_codex_file_change(): Promise<void> {
  const run = (stream: Codex.IMessage[]): ICodeHudAgentEvent[] => {
    const normalizer: CodeHudCodexNormalizer = new CodeHudCodexNormalizer(
      "s1",
      () => 0,
    );
    return Codex.sent(stream).flatMap((message) =>
      normalizer.normalize(message as CodeHudCodexNormalizer.IMessage),
    );
  };

  // 0. The assertion this case leans on, armed rather than trusted. Without
  // this wrapper the two comparisons that matter most below are green whatever
  // the adapter does, which is how the gap was found in the first place.
  TestValidator.predicate(
    "a member the expected value declares and the actual one lacks is reported",
    Assert.compares({ title: "x" }, { title: "x", detail: "y" }) === true &&
      Assert.compares(
        { title: "x", detail: undefined },
        {
          title: "x",
          detail: "y",
        },
      ) === true &&
      Assert.compares(
        { title: "x", detail: "y" },
        { title: "x", detail: "y" },
      ) === false,
  );

  // What the capture actually holds, checked before anything is concluded from
  // it. A case that reads a fixture without saying what it expected to find is
  // green when the fixture is replaced by an empty one.
  const written: Codex.IMessage | undefined = Codex.sent(Codex.WRITE).find(
    (line) => Codex.item(line) === "fileChange",
  );
  Assert.equals(
    "the capture holds a file change, with the path and kind the bindings declare",
    {
      path: written?.params?.item?.changes?.[0]?.path,
      kind: written?.params?.item?.changes?.[0]?.kind?.type,
    },
    { path: "/repo/note.txt", kind: "add" },
  );
  const requested: Codex.IMessage | undefined = Codex.sent(Codex.WRITE).find(
    (line) => line.method === "item/fileChange/requestApproval",
  );
  Assert.equals(
    "and an approval that names the item rather than the file",
    {
      itemId: requested?.params?.itemId,
      command: (requested?.params as { command?: unknown } | undefined)
        ?.command,
      reason: (requested?.params as { reason?: unknown } | undefined)?.reason,
    },
    { itemId: written?.params?.item?.id, command: undefined, reason: null },
  );
  const named: string = written?.params?.item?.id ?? "";
  TestValidator.predicate("and identifies it at all", named.length !== 0);

  const events: ICodeHudAgentEvent[] = run(Codex.WRITE);

  // 1-2. The work, which used to be nothing at all.
  const tools: ICodeHudAgentEvent.ITool[] = events.filter(
    (event): event is ICodeHudAgentEvent.ITool =>
      event.type === "tool" && event.name === "file",
  );
  Assert.equals(
    "the file change is reported at both of its phases",
    tools.map((tool) => tool.phase),
    ["start", "finish"],
  );
  Assert.equals(
    "under the identifier the approval names it by",
    tools.map((tool) => tool.call),
    [named, named],
  );
  Assert.equals(
    "described by the server's own word for the change and the file it names",
    tools.map((tool) => tool.title),
    ["add repo/note.txt", "add repo/note.txt"],
  );
  TestValidator.predicate(
    "and a change that was applied is not marked as having failed",
    tools.every((tool) => tool.failed === undefined),
  );

  // 3. The question, which used to be about something else entirely.
  const permission: ICodeHudAgentEvent.IPermission | undefined = events.find(
    (event): event is ICodeHudAgentEvent.IPermission =>
      event.type === "permission",
  );
  TestValidator.equals(
    "the approval is titled from the item it names",
    permission?.title,
    "add repo/note.txt",
  );
  TestValidator.notEquals(
    "rather than from the phrase reserved for a request about access",
    permission?.title,
    CodeHudCodexNormalizer.ESCALATION,
  );
  TestValidator.equals(
    "and still says what class of action it would perform",
    permission?.action,
    "write",
  );

  // 4. The phrase still belongs to the request it was written for.
  const escalating: CodeHudCodexNormalizer = new CodeHudCodexNormalizer(
    "s2",
    () => 0,
  );
  TestValidator.equals(
    "a permissions request naming nothing still asks about access",
    (
      escalating.normalize({
        id: 7,
        method: "item/permissions/requestApproval",
        params: {},
      })[0] as ICodeHudAgentEvent.IPermission
    ).title,
    CodeHudCodexNormalizer.ESCALATION,
  );

  // 4b. And it keeps it even when the item it names is one we remember. A
  // permissions request carries an `itemId` too, and it is asking to widen what
  // the agent may do for the rest of the turn rather than to perform that one
  // item — so titling it after the item would understate it in the same way
  // this case exists to stop, in the more dangerous direction.
  const widening: CodeHudCodexNormalizer = new CodeHudCodexNormalizer(
    "s2b",
    () => 0,
  );
  widening.normalize({
    method: "item/started",
    params: {
      item: {
        type: "fileChange",
        id: "item-7",
        changes: [{ path: "/repo/note.txt", kind: { type: "add" } }],
        status: "inProgress",
      },
    },
  });
  TestValidator.equals(
    "a permissions request naming a remembered item still asks about access",
    (
      widening.normalize({
        id: 10,
        method: "item/permissions/requestApproval",
        params: { itemId: "item-7", cwd: "/repo" },
      })[0] as ICodeHudAgentEvent.IPermission
    ).title,
    CodeHudCodexNormalizer.ESCALATION,
  );

  // 5. An item nobody saw is not invented.
  const orphan: CodeHudCodexNormalizer = new CodeHudCodexNormalizer(
    "s3",
    () => 0,
  );
  TestValidator.equals(
    "an approval for an item that never arrived falls back rather than guessing",
    (
      orphan.normalize({
        id: 8,
        method: "item/fileChange/requestApproval",
        params: { itemId: "item-99" },
      })[0] as ICodeHudAgentEvent.IPermission
    ).title,
    CodeHudCodexNormalizer.ESCALATION,
  );

  // 5b. The one approval that carries its own subject. `applyPatchApproval` is
  // `conversationId`, `callId`, a map from path to change, a reason and a grant
  // root — no command, no working directory, no item to look anything up by.
  // Typed from the bindings rather than from a capture: this repository has
  // only ever driven servers that send the modern method, and an adapter
  // meeting the legacy one would say `Wider access requested` about a patch.
  const legacy: CodeHudCodexNormalizer = new CodeHudCodexNormalizer(
    "s3b",
    () => 0,
  );
  const patched: ICodeHudAgentEvent.IPermission = legacy.normalize({
    id: 11,
    method: "applyPatchApproval",
    params: {
      fileChanges: {
        "/repo/src/index.ts": { type: "update", move_path: null },
      },
      reason: "the file is outside the sandbox",
    },
  })[0] as ICodeHudAgentEvent.IPermission;
  Assert.equals(
    "a legacy patch approval is described from the paths it carries",
    { title: patched.title, detail: patched.detail },
    {
      title: "update src/index.ts",
      detail: "the file is outside the sandbox",
    },
  );

  // 5c. A grant root is an access request wearing a file change's clothes: the
  // bindings say that when it is set the agent is asking to write anywhere
  // under that root for the rest of the session. Approving one file and
  // approving a directory are not the same answer, so the wearer is told which
  // one they are giving, and the file goes on the line below.
  const rooted: CodeHudCodexNormalizer = new CodeHudCodexNormalizer(
    "s3c",
    () => 0,
  );
  rooted.normalize({
    method: "item/started",
    params: {
      item: {
        type: "fileChange",
        id: "item-8",
        changes: [{ path: "/repo/note.txt", kind: { type: "add" } }],
        status: "inProgress",
      },
    },
  });
  const licensed: ICodeHudAgentEvent.IPermission = rooted.normalize({
    id: 12,
    method: "item/fileChange/requestApproval",
    params: { itemId: "item-8", grantRoot: "/repo" },
  })[0] as ICodeHudAgentEvent.IPermission;
  Assert.equals(
    "a request that would license a directory does not read as the one file",
    { title: licensed.title, detail: licensed.detail },
    { title: CodeHudCodexNormalizer.ESCALATION, detail: "add repo/note.txt" },
  );

  // 6. The reason moves rather than disappearing.
  const explained: CodeHudCodexNormalizer = new CodeHudCodexNormalizer(
    "s4",
    () => 0,
  );
  explained.normalize({
    method: "item/started",
    params: {
      item: {
        type: "fileChange",
        id: "item-42",
        changes: [{ path: "/repo/src/index.ts", kind: { type: "update" } }],
        status: "inProgress",
      },
    },
  });
  const both: ICodeHudAgentEvent.IPermission = explained.normalize({
    id: 9,
    method: "item/fileChange/requestApproval",
    params: { itemId: "item-42", reason: "writing outside the  workspace" },
  })[0] as ICodeHudAgentEvent.IPermission;
  Assert.equals(
    "the item supplies the title and the server's reason supplies the line under it",
    { title: both.title, detail: both.detail },
    { title: "update src/index.ts", detail: "writing outside the workspace" },
  );

  // 8. The request that names no command line. Not a hypothetical shape read
  // off a type: the bindings say `command` is null for stdin approvals and for
  // zsh-exec-bridge subcommand approvals, which are command executions.
  const silent: CodeHudCodexNormalizer = new CodeHudCodexNormalizer(
    "s4b",
    () => 0,
  );
  silent.normalize({
    method: "item/started",
    params: {
      item: {
        type: "commandExecution",
        id: "item-11",
        command: "echo hello",
        status: "inProgress",
      },
    },
  });
  const quiet: ICodeHudAgentEvent[] = silent.normalize({
    id: 17,
    method: "item/commandExecution/requestApproval",
    params: {
      itemId: "item-11",
      command: null,
      cwd: null,
      reason: null,
    },
  });
  Assert.equals(
    "a command execution naming no command line is still an execution, named by its item",
    {
      title: (quiet[0] as ICodeHudAgentEvent.IPermission | undefined)?.title,
      action: (quiet[0] as ICodeHudAgentEvent.IPermission | undefined)?.action,
    },
    { title: "command echo hello", action: "execute" },
  );

  // 8a. One item, one judgment, made when it was first seen. The captures show
  // a completion repeating the change set its start carried, so nothing
  // observed needs this; it is stated because the title already behaved this
  // way and an action that did not would let a narrowing completion quietly
  // weaken a judgment the wearer is about to be asked about.
  const narrowed: CodeHudCodexNormalizer = new CodeHudCodexNormalizer(
    "s4c",
    () => 0,
  );
  for (const [status, changes] of [
    [
      "inProgress",
      [
        { path: "/repo/keep.ts", kind: { type: "add" } },
        { path: "/repo/gone.ts", kind: { type: "delete" } },
      ],
    ],
    ["completed", [{ path: "/repo/keep.ts", kind: { type: "add" } }]],
  ] as const)
    narrowed.normalize({
      method: status === "completed" ? "item/completed" : "item/started",
      params: {
        item: {
          type: "fileChange",
          id: "item-12",
          changes: [...changes],
          status,
        },
      },
    });
  Assert.equals(
    "a completion that dropped the removal does not downgrade what was decided",
    {
      title: (
        narrowed.normalize({
          id: 18,
          method: "item/fileChange/requestApproval",
          params: { itemId: "item-12" },
        })[0] as ICodeHudAgentEvent.IPermission
      ).title,
      action: (
        narrowed.normalize({
          id: 19,
          method: "item/fileChange/requestApproval",
          params: { itemId: "item-12" },
        })[0] as ICodeHudAgentEvent.IPermission
      ).action,
    },
    { title: "add repo/keep.ts and 1 more", action: "delete" },
  );

  // 8b. What the change would do, which is not always a write. A wearer asked
  // once about `rm note.txt` and twice about the same removal done by patch
  // would be right to call that arbitrary; it was the other way around.
  const removing: CodeHudCodexNormalizer = new CodeHudCodexNormalizer(
    "s5",
    () => 0,
  );
  removing.normalize({
    method: "item/started",
    params: {
      item: {
        type: "fileChange",
        id: "item-13",
        changes: [
          { path: "/repo/keep.ts", kind: { type: "add" } },
          { path: "/repo/gone.ts", kind: { type: "delete" } },
        ],
        status: "inProgress",
      },
    },
  });
  TestValidator.equals(
    "a change set containing a removal is a deletion, not a write",
    (
      removing.normalize({
        id: 13,
        method: "item/fileChange/requestApproval",
        params: { itemId: "item-13" },
      })[0] as ICodeHudAgentEvent.IPermission
    ).action,
    "delete",
  );

  const removed: CodeHudCodexNormalizer = new CodeHudCodexNormalizer(
    "s6",
    () => 0,
  );
  TestValidator.equals(
    "and so is a legacy patch that removes one, read from the request itself",
    (
      removed.normalize({
        id: 14,
        method: "applyPatchApproval",
        params: {
          fileChanges: { "/repo/gone.ts": { type: "delete" } },
        },
      })[0] as ICodeHudAgentEvent.IPermission
    ).action,
    "delete",
  );

  const unknown: CodeHudCodexNormalizer = new CodeHudCodexNormalizer(
    "s7",
    () => 0,
  );
  TestValidator.equals(
    "a file change nothing was remembered for keeps the floor it always had",
    (
      unknown.normalize({
        id: 15,
        method: "item/fileChange/requestApproval",
        params: { itemId: "item-never-seen" },
      })[0] as ICodeHudAgentEvent.IPermission
    ).action,
    "write",
  );

  // 8c. And the floor each method falls to when neither the request nor any
  // item it names has said anything. A patch writes; a command execution
  // executes; a permissions request performs nothing, because a class given to
  // it is a class the session policy would then apply to it.
  Assert.equals(
    "each approval method states what it performs when nothing else does",
    [...CodeHudCodexNormalizer.PERFORMS.entries()].sort((a, b) =>
      a[0].localeCompare(b[0]),
    ),
    [
      ["applyPatchApproval", "write"],
      ["execCommandApproval", "execute"],
      ["item/commandExecution/requestApproval", "execute"],
      ["item/fileChange/requestApproval", "write"],
    ],
  );
  TestValidator.predicate(
    "and a permissions request is absent from that table rather than mapped",
    CodeHudCodexNormalizer.PERFORMS.has("item/permissions/requestApproval") ===
      false &&
      CodeHudCodexNormalizer.APPROVALS.has(
        "item/permissions/requestApproval",
      ) === true,
  );

  const escalation: CodeHudCodexNormalizer = new CodeHudCodexNormalizer(
    "s8",
    () => 0,
  );
  TestValidator.equals(
    "and a permissions request still performs no action to classify",
    (
      escalation.normalize({
        id: 16,
        method: "item/permissions/requestApproval",
        params: { cwd: "/repo" },
      })[0] as ICodeHudAgentEvent.IPermission
    ).action,
    undefined,
  );

  // 8d. Which of the eight a patch can reach, stated rather than implied.
  for (const [changes, expected] of [
    [[{ path: "/repo/a.ts", kind: { type: "add" } }], "write"],
    [[{ path: "/repo/a.ts", kind: { type: "update" } }], "write"],
    [[{ path: "/repo/a.ts", kind: { type: "delete" } }], "delete"],
    [
      // A move is a write. The file leaves one path and the content is at the
      // other, so a wearer asked twice about every rename pays the fatigue the
      // policy exists to prevent for something they have not lost.
      [
        {
          path: "/repo/a.ts",
          kind: { type: "update", move_path: "/repo/b.ts" },
        },
      ],
      "write",
    ],
    [[], "write"],
  ] as const)
    TestValidator.equals(
      `a change of that shape performs ${expected}`,
      CodeHudCodexNormalizer.performed(changes),
      expected,
    );

  // 7. The shapes `PatchChangeKind` declares, and the count that stands in for
  // a list a two-line display could not hold anyway.
  for (const [changes, expected] of [
    [[{ path: "/repo/a.ts", kind: { type: "add" } }], "add repo/a.ts"],
    [[{ path: "/repo/a.ts", kind: { type: "delete" } }], "delete repo/a.ts"],
    [
      [
        {
          path: "/repo/a.ts",
          kind: { type: "update", move_path: "/repo/b.ts" },
        },
      ],
      "update repo/a.ts to repo/b.ts",
    ],
    [
      [
        { path: "/repo/a.ts", kind: { type: "add" } },
        { path: "/repo/b.ts", kind: { type: "add" } },
        { path: "/repo/c.ts", kind: { type: "add" } },
      ],
      "add repo/a.ts and 2 more",
    ],
    [
      [{ path: "", kind: { type: "update", move_path: "/repo/b.ts" } }],
      "update repo/b.ts",
    ],
    [[], "file change"],
  ] as const)
    TestValidator.equals(
      `a change is described as ${expected}`,
      CodeHudCodexNormalizer.changed(changes),
      expected,
    );
}
