import { CodeHudNodeRunner } from "@codehud/agent";
import { TestValidator } from "@nestia/e2e";

/**
 * A Windows shim is launched through `cmd.exe`, and nothing else is.
 *
 * Measured rather than assumed. A global npm install puts a `.cmd` shim on the
 * path, and since the fix for CVE-2024-27980 Node refuses to spawn one
 * directly: it throws `EINVAL` before the process exists. Against the machine
 * this was written on, with the shell removed from the experiment so the result
 * was about Node rather than about quoting:
 *
 * ```text
 * execFile("claude.CMD", ["--version"])                   throws EINVAL
 * execFile("cmd.exe", ["/d","/s","/c","claude.CMD",...])   prints the version
 * ```
 *
 * The platform is a parameter of the rewrite rather than a read of the running
 * process, so both branches are checked on either operating system. This suite
 * runs on Linux in continuous integration, and a Windows-only branch would be a
 * branch that integration silently stopped checking.
 *
 * Scenarios:
 *
 * 1. A `.cmd` on Windows is rewritten through `cmd.exe`, with the flags that
 *    stop a registry AutoRun command from running first and make quoting
 *    predictable.
 * 2. Arguments are preserved in order after the executable, since they are what
 *    the harness is actually being asked.
 * 3. A `.bat` is rewritten the same way; the hazard is the shim, not the name.
 * 4. Case does not matter, because path resolution returns whatever casing the
 *    filesystem holds and it returned `.CMD` on the machine measured.
 * 5. An ordinary Windows executable is left alone. The negative twin: without
 *    it, a rewrite of everything would pass scenario 1.
 * 6. The same `.cmd` name on a non-Windows platform is left alone, because
 *    there is no shim there and `cmd.exe` does not exist.
 */
export async function test_agent_windows_shim(): Promise<void> {
  const rewrite = CodeHudNodeRunner.invocation;

  TestValidator.equals(
    "a Windows shim goes through cmd.exe",
    rewrite("C:\\npm\\claude.cmd", ["--version"], "win32"),
    ["cmd.exe", ["/d", "/s", "/c", "C:\\npm\\claude.cmd", "--version"]],
  );

  TestValidator.equals(
    "arguments keep their order behind the executable",
    rewrite("C:\\npm\\codex.cmd", ["exec", "--json", "hello"], "win32"),
    [
      "cmd.exe",
      ["/d", "/s", "/c", "C:\\npm\\codex.cmd", "exec", "--json", "hello"],
    ],
  );

  TestValidator.equals(
    "a batch file is the same hazard",
    rewrite("C:\\npm\\thing.bat", ["--version"], "win32")[0],
    "cmd.exe",
  );

  TestValidator.equals(
    "casing does not matter, and the filesystem returned .CMD",
    rewrite("C:\\npm\\claude.CMD", ["--version"], "win32")[0],
    "cmd.exe",
  );

  TestValidator.equals(
    "a real executable is left alone",
    rewrite("C:\\tools\\claude.exe", ["--version"], "win32"),
    ["C:\\tools\\claude.exe", ["--version"]],
  );

  TestValidator.equals(
    "and so is the same name away from Windows",
    rewrite("/usr/bin/claude.cmd", ["--version"], "linux"),
    ["/usr/bin/claude.cmd", ["--version"]],
  );
  TestValidator.equals(
    "as is an ordinary posix path",
    rewrite("/usr/bin/claude", ["--version"], "darwin"),
    ["/usr/bin/claude", ["--version"]],
  );
}
