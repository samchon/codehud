import type { ICodeHudAgentAdapter } from "@codehud/interface";

import { CodeHudAgentPolicy } from "./CodeHudAgentPolicy";

/**
 * Which class of action an approval request would perform.
 *
 * A namespace: two tables and a pure function over them, with no configuration
 * and no collaborator. It exists because a session policy that nothing applies
 * to a request is a policy that governs only what never reaches the wearer —
 * and that was the state of this repository. Deletion, history rewriting, force
 * publication, and credential exposure all defaulted to doubly-confirmed, and
 * no request could ever be classified as any of them, so the class with the
 * strongest promise in the product was the one nothing could enter.
 *
 * ## Why a command table, and what it is not
 *
 * A tool name reaches four classes and no further. Both harnesses delete
 * through their ordinary execution tool, rewrite history through it, publish
 * through it, and read a credential file through it, so a classifier that
 * stopped at the tool name would file every one of them under `execute` and the
 * four irreversible classes would stay empty by construction.
 *
 * So the command itself is read, against {@link COMMANDS}, which is a table of
 * literal program and subcommand shapes rather than a parser. That table is a
 * **floor, not a ceiling**: a command it does not recognize is not thereby
 * safe. What it buys is that the commands a wearer would most regret approving
 * with one word are the ones that take two, and it buys that without ever
 * interpreting prose a harness wrote for a human.
 *
 * The direction of its errors is chosen and asymmetric. Recognizing something
 * harmless as destructive costs a wearer one extra spoken word. Failing to
 * recognize something destructive costs them a repository. So a shape is in the
 * table when it is plausibly irreversible, not when it is certainly so.
 *
 * ## What it still cannot see, said rather than implied
 *
 * A wearer who comes to believe that everything irreversible takes two words is
 * relying on something this cannot promise. These are the known holes, written
 * down because a floor nobody can measure is a floor nobody should trust:
 *
 * - **A truncating redirect.** `echo x > important.txt` destroys a file and
 *   names no program that says so. It is deliberately not matched: most
 *   redirects are harmless, `ls > /tmp/out` among them, and treating every `>`
 *   as destructive would put a second word in front of most commands an agent
 *   runs, which is the approval fatigue the policy exists to prevent.
 * - **A destructive program this table has not met**, including anything
 *   reached through a script or a task runner, where the line an agent shows
 *   the wearer is the runner's name and not the command.
 * - **Anything a tool other than execution does.** A write is classified as a
 *   write however alarming its path looks, because it is recoverable from
 *   version control and asking twice about every file an agent touches would
 *   cost a wearer more than it saves them.
 *
 * The way to close them is not a longer table. It is to make execution itself
 * doubly-confirmed by default and invert this into a list of what may be
 * answered with one word — a decision about how often a wearer is interrupted,
 * and one for the person whose attention it spends.
 *
 * @evidence requirements/agent-control/turn-and-approval.md#agent-approval-budget Classifies the request in front of the wearer into the classes the stated policy partitions, which is what makes the policy apply to anything a wearer sees.
 * @evidence specifications/agent-harness/control-and-approval.md#spec-agent-permission-classification Implements classification from the tool a harness named and the command it would run, against tables stated in full, reporting nothing where it cannot tell.
 * @author Samchon
 */
export namespace CodeHudActionClass {
  /**
   * Command shapes that perform something that cannot be undone.
   *
   * Written as the leading words of a command line, matched against the command
   * with its arguments collapsed to single spaces. Ordered from the most
   * specific: a forced push is history rewriting as well as publication, and
   * the first match is the one reported.
   *
   * Every entry is a program or a program and a subcommand. Nothing here reads
   * a flag except where the flag is the whole difference — `git push` is
   * ordinary and `git push --force` is not.
   */
  export const COMMANDS: readonly CodeHudActionClass.IShape[] = Object.freeze([
    // History, including the forced pushes that are also publication.
    shape("history", ["git push --force", "git push -f"]),
    shape("history", [
      "git reset --hard",
      "git rebase",
      "git commit --amend",
      "git filter-branch",
      "git filter-repo",
      "git reflog delete",
      "git branch -d",
      "git branch -D",
      "git tag -d",
      "git stash drop",
      "git stash clear",
      "git checkout .",
      "git checkout --",
      // Every restore, rather than only the ones whose flags say they discard
      // the working tree. Reading flags is what this table does not do, and the
      // asymmetry decides the rest: matching `git restore --staged` costs a
      // wearer one word, and missing `git restore --staged --worktree .` costs
      // them whatever they had not committed.
      "git restore",
    ]),

    // Publication that cannot be taken back, or cannot be taken back quietly.
    shape("publish", [
      "npm publish",
      "pnpm publish",
      "yarn publish",
      "docker push",
      "gh release create",
      "gh release delete",
    ]),

    // Deletion.
    shape("delete", [
      "rm",
      "rmdir",
      "shred",
      "truncate",
      "dd",
      "del",
      "erase",
      "remove-item",
      "ri",
      "rd",
      "git clean",
      "docker system prune",
      "docker volume rm",
      "docker rm",
      "docker rmi",
      "kubectl delete",
      "drop table",
      "drop database",
    ]),
  ]);

  /**
   * File and variable names whose contents are a credential.
   *
   * Matched anywhere in the command, because the shape that exposes a secret is
   * not a program but a path: `cat .env`, `echo $AWS_SECRET_ACCESS_KEY`, and
   * `curl -H "Authorization: …"` are three programs and one class.
   */
  export const SECRETS: readonly string[] = Object.freeze([
    ".env",
    "id_rsa",
    "id_ed25519",
    ".npmrc",
    ".pypirc",
    ".netrc",
    ".aws/credentials",
    "credentials.json",
    "secret",
    "_token",
    "access_key",
    "api_key",
  ]);

  /**
   * The class a request belongs to, or none where it cannot be told.
   *
   * The command is consulted only for a request that executes something, which
   * is where the four irreversible classes hide. A write is a write however
   * dangerous the path looks: it is already attended, it is recoverable from
   * version control, and treating it otherwise would ask twice about every file
   * the agent touches.
   */
  export const of = (
    props: IRequest,
  ): ICodeHudAgentAdapter.IPolicy.Action | undefined => {
    const named: ICodeHudAgentAdapter.IPolicy.Action | undefined = tool(
      props.tool,
    );
    if (named !== undefined && named !== "execute") return named;

    const command: string | undefined =
      props.command === undefined
        ? undefined
        : props.command.replace(/\s+/gu, " ").trim().toLowerCase();
    if (command === undefined || command.length === 0) return named;

    // Shapes before secrets, because a shape is anchored at the start of the
    // line and a secret is matched anywhere in it. The other order calls
    // `rm .env` an exposure, which it is not: it destroys the credential rather
    // than revealing it, and the class a wearer is told about should be the one
    // that describes what would happen.
    for (const entry of COMMANDS)
      if (entry.shapes.some((prefix) => begins(command, prefix) === true))
        return entry.action;
    if (SECRETS.some((secret) => command.includes(secret) === true))
      return "credential";
    return named ?? "execute";
  };

  /**
   * The class a tool name alone reports.
   *
   * Reads the same table the launch flags are built from, so a tool allowed to
   * run unattended and a tool classified here can never disagree about what
   * kind of thing it is.
   */
  export const tool = (
    name: string | undefined,
  ): ICodeHudAgentAdapter.IPolicy.Action | undefined => {
    if (name === undefined || name.length === 0) return undefined;
    for (const [action, tools] of Object.entries(
      CodeHudAgentPolicy.CLAUDE_TOOLS,
    ))
      if (tools.some((entry) => entry.toLowerCase() === name.toLowerCase()))
        return action as ICodeHudAgentAdapter.IPolicy.Action;
    return undefined;
  };

  /**
   * Whether a command line begins with one of the table's shapes.
   *
   * Word-boundaried rather than a plain prefix, so `rm` matches `rm -rf build`
   * and not `rmadison`, and so a shape of several words matches only when those
   * words are the ones the command starts with.
   *
   * A leading environment assignment, `sudo`, or a shell wrapper is stepped over
   * first. A harness routinely produces `bash -lc "rm -rf build"`, and a
   * classifier that read only the outermost program would call every one of
   * those a shell invocation and file the whole class under execution.
   */
  export const begins = (command: string, shape: string): boolean =>
    lines(command).some(
      (line) =>
        line === shape ||
        line.startsWith(`${shape} `) === true ||
        line.startsWith(`${shape}\t`) === true,
    );

  /**
   * Every command line hiding inside one command line.
   *
   * Splitting and peeling are the same problem and have to be done together.
   * Peeling first and splitting after misses `echo hi && bash -lc "rm -rf x"`,
   * because the wrapper is not at the front of the line. Splitting first and
   * peeling after misses `bash -lc "ls && rm -rf x"`, because the chain is
   * inside the wrapper. Both are what an agent actually writes, and the second
   * was covered while the first was being called a listing.
   *
   * So it is a worklist: every line contributes its segments and its
   * unwrapping, and each of those is fed back in until nothing new appears.
   * Bounded, because a pathological line should cost a classifier some time
   * rather than all of it.
   */
  export const lines = (command: string): string[] => {
    const found: Set<string> = new Set<string>();
    const queue: string[] = [command];
    while (queue.length !== 0 && found.size < BREADTH) {
      const line: string = queue.shift() as string;
      if (found.has(line) === true) continue;
      found.add(line);
      for (const piece of segments(line))
        if (found.has(piece) === false) queue.push(piece);
      const peeled: string | undefined = inner(line);
      if (peeled !== undefined && found.has(peeled) === false)
        queue.push(peeled);
    }
    return [...found];
  };

  /**
   * How many lines one command may be taken apart into.
   *
   * A limit rather than a tuning. The shapes this recognizes are a handful of
   * words at the front of a line, and a command that produced hundreds of
   * candidates is not a command an agent wrote.
   */
  export const BREADTH: number = 64;

  /**
   * One command line cut into the commands it would actually run.
   *
   * An agent chains. The line that produced this function was
   * `ls -l hello.txt && rm hello.txt && ls -l`, asked about by a real harness in
   * a real run, and a classifier reading only the head of the line called it a
   * listing and let a deletion through on one spoken word. The head of a chain
   * is the least interesting thing in it.
   *
   * Split naively, including inside quotes. Over-splitting can only produce more
   * candidate commands than a shell would run, and more candidates can only
   * classify as destructive something that was not — which costs a wearer one
   * word, the direction this whole table errs in on purpose.
   */
  export const segments = (command: string): string[] =>
    command
      .split(/&&|[;|\n]/u)
      .map((part) => part.trim())
      .filter((part) => part.length !== 0);

  /**
   * One layer of wrapper removed, if the line has one.
   *
   * Three layers exist and they nest in any order: an environment assignment in
   * front of a command, an elevation, and a shell told to run a string. Each is
   * peeled separately rather than in one pattern, because `sudo rm -rf build`
   * has no shell in it and a pattern that required one would leave the most
   * ordinary destructive line in the world classified as an elevation.
   */
  const inner = (command: string): string | undefined => {
    const environment: RegExpMatchArray | null = command.match(
      /^[a-z_][a-z0-9_]*=\S*\s+(.+)$/u,
    );
    if (environment?.[1] !== undefined) return environment[1].trim();

    const elevated: RegExpMatchArray | null = command.match(
      /^sudo\s+(?:-\S+\s+)*(.+)$/u,
    );
    if (elevated?.[1] !== undefined) return elevated[1].trim();

    const wrapper: RegExpMatchArray | null = command.match(
      /^(?:(?:ba|z|fi)?sh|cmd(?:\.exe)?|powershell(?:\.exe)?|pwsh)\s+(?:-\S+\s+)*(.+)$/u,
    );
    const rest: string | undefined = wrapper?.[1];
    if (rest === undefined) return undefined;
    const quoted: RegExpMatchArray | null = rest.match(/^'(.*)'$|^"(.*)"$/u);
    return (quoted?.[1] ?? quoted?.[2] ?? rest).trim();
  };

  /** Builds one table entry, so the tables read as data rather than as casts. */
  function shape(
    action: ICodeHudAgentAdapter.IPolicy.Action,
    shapes: string[],
  ): IShape {
    return Object.freeze({ action, shapes: Object.freeze(shapes) });
  }

  /** One class and the command shapes that belong to it. */
  export interface IShape {
    /** The class these shapes perform. */
    action: ICodeHudAgentAdapter.IPolicy.Action;

    /** Leading words of a command line, lowercase. */
    shapes: readonly string[];
  }

  /** What is known about a request when it is classified. */
  export interface IRequest {
    /** Tool the harness named, where it named one. */
    tool?: string;

    /** Command the request would run, where the request is an execution. */
    command?: string;
  }
}
