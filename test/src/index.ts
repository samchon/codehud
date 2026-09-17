import { DynamicExecutor } from "@nestia/e2e";
import chalk from "chalk";
import path from "node:path";
import process from "node:process";

/**
 * Wall-clock budget for one scenario.
 *
 * Every case in this suite is a pure function over in-memory inputs, so a case
 * that takes longer than this is exercising something it should not be.
 */
const BUDGET: number = 500;

const elapsed = (exec: DynamicExecutor.IExecution): number =>
  new Date(exec.completed_at).getTime() - new Date(exec.started_at).getTime();

async function main(): Promise<void> {
  console.log("---------------------------------------------------");
  console.log("CodeHUD Test Program");
  console.log("Start", new Date().toLocaleString("en-US"));
  console.log("---------------------------------------------------");

  const report: DynamicExecutor.IReport = await DynamicExecutor.validate({
    prefix: "test_",
    location: path.join(__dirname, "features"),
    parameters: () => [],
    extension: "ts",
    onComplete: (exec) => {
      const ms: number = elapsed(exec);
      const slow: boolean = ms > BUDGET;
      const mark: string =
        exec.error === null ? chalk.green("  ✓") : chalk.red("  ✗");
      const time: string = `${ms} ms`;
      console.log(
        `${mark} ${exec.name} ${slow ? chalk.yellow(`(${time}, over budget)`) : chalk.gray(`(${time})`)}`,
      );
    },
  });

  if (report.executions.length === 0)
    throw new Error("No test case was discovered.");

  const failures: DynamicExecutor.IExecution[] = report.executions.filter(
    (exec) => exec.error !== null,
  );
  const slow: DynamicExecutor.IExecution[] = report.executions.filter(
    (exec) => elapsed(exec) > BUDGET,
  );

  console.log("---------------------------------------------------");
  console.log(
    `${report.executions.length - failures.length}/${report.executions.length} passed in ${report.time.toLocaleString()} ms`,
  );

  if (failures.length !== 0) {
    console.log(chalk.red(`\n${failures.length} FAILED:`));
    for (const f of failures) {
      console.log(chalk.red(`\n● ${f.name}`));
      console.log(f.error);
    }
  }
  if (slow.length !== 0) {
    console.log(chalk.yellow(`\n${slow.length} OVER ${BUDGET} ms:`));
    for (const s of slow)
      console.log(chalk.yellow(`  ${s.name} ${elapsed(s)} ms`));
  }
  if (failures.length !== 0 || slow.length !== 0) process.exit(1);

  console.log(chalk.green("All tests passed."));
}

main().catch((exp: unknown) => {
  console.error(exp);
  process.exit(1);
});
