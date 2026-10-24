#!/usr/bin/env node
// Entry point: check the Node.js version before loading anything that may need newer Node.
// Built on its own (not into the cli.js bundle) so older Node can still parse it and show the message.
import { createRequire } from "node:module";

const { engines } = createRequire(import.meta.url)("../package.json") as { engines: { node: string } };
const minimum = Number(/\d+/.exec(engines.node)?.[0] ?? "0");
const current = Number(process.versions.node.split(".")[0]);

if (current < minimum) {
  process.stderr.write(`testrail needs Node.js ${minimum} or newer (you have ${process.versions.node}).\n`);
  process.exit(1);
}

await import("./cli.js");
