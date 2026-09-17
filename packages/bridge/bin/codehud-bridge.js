#!/usr/bin/env node
// Thin launcher. Everything it could get wrong lives in CodeHudBridgeCommand,
// which is compiled TypeScript; this file exists so that the published bin has
// no build step of its own and no shebang for the compiler to preserve.
require("../lib/index.js")
  .CodeHudBridgeCommand.main(process.argv.slice(2))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
