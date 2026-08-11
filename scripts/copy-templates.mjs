// Templates and docs ship inside the package; nothing needs copying into dist,
// but this script verifies they exist so `npm run build` fails loudly if the
// package would be published incomplete.
import { existsSync } from "node:fs";
const required = ["templates/default/agent/instructions.md", "docs/index.md", "README.md"];
const missing = required.filter((p) => !existsSync(new URL("../" + p, import.meta.url)));
if (missing.length) {
  console.error("build incomplete, missing:", missing.join(", "));
  process.exit(1);
}
console.log("package contents verified");
