import { CodeHudBridgeCommand } from "./CodeHudBridgeCommand";

/**
 * Terminal entry point.
 *
 * Exports nothing. It exists so the bridge is startable from the workspace with
 * `pnpm run bridge`, where every package's `main` points at its sources by
 * design and Node therefore cannot load the compiled launcher's dependencies.
 * The published package uses `bin/codehud-bridge.js` against `lib` instead.
 */
void CodeHudBridgeCommand.main(process.argv.slice(2)).catch(
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  },
);
