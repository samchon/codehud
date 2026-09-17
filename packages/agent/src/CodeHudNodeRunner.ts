import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { delimiter, join } from "node:path";
import process from "node:process";

import type { ICodeHudHarnessRunner } from "./ICodeHudHarnessRunner";

/**
 * Reaches the host machine through Node, for a bridge running on it.
 *
 * Deliberately thin. Every decision about what a probe result means lives in
 * the probe; this only answers the two questions it is asked. Keeping it free
 * of logic is what makes it acceptable that no unit test covers it: there is
 * nothing here a test could pin that reading it does not already show.
 *
 * @evidence requirements/agent-control/harness-abstraction.md#agent-harness-discovery Reaches the host machine to find out which harnesses it can offer, without deciding what an answer means.
 * @evidence specifications/agent-harness/normalized-stream.md#spec-agent-probe-result Supplies the executable path and the reported version the probe result is built from.
 * @author Samchon
 */
export class CodeHudNodeRunner implements ICodeHudHarnessRunner {
  /**
   * Walks the path for an executable, returning the first hit.
   *
   * Walked rather than delegated to `where` or `which`, because those are a
   * process launch for a question the environment already answers, and they
   * disagree with each other about what a hit looks like.
   *
   * On Windows the extensions come first and the bare name last. A global npm
   * install writes three files beside each other, `claude`, `claude.cmd`, and
   * `claude.ps1`, and the extensionless one is a shell script that Windows
   * cannot spawn at all: it fails with `EINVAL` before the process starts.
   * Returning it would report the harness as present and then fail every launch
   * against it, which is worse than reporting it absent.
   */
  public async resolve(command: string): Promise<string | null> {
    const path: string = process.env["PATH"] ?? "";
    const extensions: string[] =
      process.platform === "win32"
        ? [...(process.env["PATHEXT"] ?? ".EXE;.CMD;.BAT").split(";"), ""]
        : [""];

    for (const directory of CodeHudNodeRunner.directories(path))
      for (const extension of extensions) {
        const candidate: string = join(directory, command + extension);
        const reachable: boolean = await access(candidate, constants.X_OK)
          .then(() => true)
          .catch(() => false);
        if (reachable === true) return candidate;
      }
    return null;
  }

  /**
   * Runs an executable and returns what it printed.
   *
   * Merges the two output streams, because a harness that prints its version to
   * standard error is reporting a version rather than failing, and resolves on
   * a non-zero exit for the same reason. Only an inability to produce output at
   * all rejects.
   *
   * The timeout is measured rather than guessed. Asked for their versions on
   * the machine this was written on, `claude` answered in 225 to 260 ms and
   * `codex` in 409 to 446 ms across three runs each. Ten seconds is therefore
   * twenty times the slower one, which leaves room for a cold file cache or a
   * virus scanner reading a shim for the first time, and still bounds how long
   * one hung binary can stall the bridge's startup.
   */
  public version(executable: string, args: string[]): Promise<string> {
    const [file, argv] = CodeHudNodeRunner.invocation(executable, args);
    return new Promise<string>((resolve, reject) => {
      execFile(
        file,
        argv,
        { timeout: 10_000, maxBuffer: 64 * 1024, windowsHide: true },
        (error, stdout, stderr) => {
          const printed: string = `${stdout}${stderr}`.trim();
          if (printed.length !== 0) return resolve(printed);
          return reject(
            error ?? new Error(`${executable} printed nothing when asked`),
          );
        },
      );
    });
  }
}
export namespace CodeHudNodeRunner {
  /**
   * Splits a path variable into directories worth looking in.
   *
   * Windows admits quoted entries, and a great many machines have at least one,
   * because an installer that wrote a path containing a space quoted it. Joining
   * a quoted entry produces a path that cannot exist, so the harness inside it
   * would be reported absent: the same wrong answer as a missing install, for a
   * reason the wearer could do nothing about.
   *
   * Empty entries are dropped rather than treated as the working directory.
   * A trailing separator is common and resolving a command against wherever the
   * bridge happens to have been started is not something to do by accident.
   *
   * The separator is a parameter for the same reason the platform is on
   * {@link invocation}: it differs between operating systems, and a rule only
   * one of them can exercise is a rule the other one's continuous integration
   * silently stops checking.
   */
  export const directories = (
    path: string,
    separator: string = delimiter,
  ): string[] =>
    path
      .split(separator)
      .map((entry) => entry.trim().replace(/^"(.*)"$/u, "$1"))
      .filter((entry) => entry.length !== 0);

  /**
   * Rewrites a launch so that a Windows shim can actually be started.
   *
   * A global npm install puts a `.cmd` shim on the path, and Node refuses to
   * spawn one directly: since the fix for CVE-2024-27980 it throws `EINVAL`
   * before the process exists. Measured against this machine rather than taken
   * from documentation, with the shell removed from the experiment so that the
   * result was about Node rather than about quoting.
   *
   * ```text
   * execFile("claude.CMD", ["--version"])                  throws EINVAL
   * execFile("cmd.exe", ["/d","/s","/c","claude.CMD",...])  prints the version
   * ```
   *
   * `shell: true` also works and is rejected: it concatenates arguments instead
   * of escaping them, Node deprecates the combination, and it would put a path
   * this code did not choose into a command line. Going through `cmd.exe` as an
   * ordinary argument vector keeps every argument quoted by Node.
   *
   * `/d` skips any AutoRun command the registry would otherwise inject before
   * ours, and `/s` makes the quoting rule predictable.
   *
   * The platform is a parameter rather than a read of `process.platform`, so
   * both branches are reachable from a test on either operating system. A rule
   * that only one platform can exercise is a rule the other platform's
   * continuous integration silently stops checking.
   */
  export const invocation = (
    executable: string,
    args: string[],
    platform: string = process.platform,
  ): [string, string[]] => {
    const shim: boolean =
      platform === "win32" && /\.(?:cmd|bat)$/iu.test(executable) === true;
    return shim === true
      ? ["cmd.exe", ["/d", "/s", "/c", executable, ...args]]
      : [executable, args];
  };
}
