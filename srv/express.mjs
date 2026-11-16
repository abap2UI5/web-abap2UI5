// The transpiled backend on Node.js, by hand (`npm run serve:express`) - not
// part of any test run. output/host.mjs is written by the transpile
// (ci/transpile.mjs): the exports of @abap2ui5/node-runtime, bound to this
// repository's output - the framework and the samples. serve( ) is the
// package's express server: the ICF shim on every path, ZCL_SICF behind it.
import {serve} from "../output/host.mjs";

const PORT = Number(process.env.PORT) || 3000;

try {
  await serve({port: PORT});
  console.log("Listening on http://localhost:" + PORT);
} catch (err) {
  console.error("Failed to start server:", err.message);
  process.exit(1);
}
