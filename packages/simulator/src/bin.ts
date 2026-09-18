import { CodeHudDeskCommand } from "./CodeHudDeskCommand";

/**
 * Terminal entry point.
 *
 * Exports nothing, and exists for the same reason the bridge's does: every
 * package's `main` points at its sources, so Node cannot load a compiled
 * launcher's dependencies from the workspace. `pnpm run desk` runs this.
 */
void CodeHudDeskCommand.main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
