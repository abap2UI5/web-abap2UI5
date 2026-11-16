/*
 * The transpile: abap2UI5 and the samples into ./output, in one run.
 *
 *   node ci/build.mjs
 *
 * abap2UI5 is not cloned, downported and transpiled here any more. The
 * framework owns that pipeline and publishes its result as the npm package
 * @abap2ui5/node-runtime: the framework's ABAP of one release, downported
 * (downport/, with ZCL_SICF, the ICF handler), the commits of open-abap-core
 * and express-icf-shim it was built against, the transpiler version, the
 * database hook (setup/setup.mjs) and the transpile itself
 * (setup/transpile.mjs, "Your own apps" in the package's README). This file
 * is that recipe with the samples as "your own apps":
 *
 *   1. open-abap-core and express-icf-shim at the commits the package
 *      records, once, under ./deps (a folder per commit)
 *   2. the package's own transpile config - the samples and downport/ as the
 *      two inputs - with the unit tests and the source maps switched on
 *   3. the transpiler the package names (@abaplint/transpiler-cli, pinned to
 *      exactly that version in package.json - another one is refused)
 *
 * The samples go in as they are written: the transpiler reads modern ABAP,
 * so nothing is downported here. The package ships none of the framework's
 * test classes - abap2UI5 runs them on the release commit - so the generated
 * runner (output/index.mjs, `npm run test:unit`) holds the samples' tests.
 *
 * What the build reads is frozen by package-lock.json (the package, and with
 * it the framework commit and both libraries) and ci/pins.json (the samples).
 */
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const RUNTIME = "@abap2ui5/node-runtime";
const pins = JSON.parse(fs.readFileSync(new URL("./pins.json", import.meta.url), "utf8"));
const SAMPLES = path.join(ROOT, pins.sources.samples.dir, "src");
const OUTPUT = path.join(ROOT, "output");

// abap2UI5's src/99 is its frozen legacy package (z2ui5_cl_xml_view, the old
// z2ui5_cl_util, ...): nothing in the framework proper or in the samples
// uses it, and it is a quarter of the bundle (2.9 of 11.4 MiB, measured on
// 1.148.0). One object in it is not dead weight: z2ui5_cl_ui5_user_exit still
// declares a reference of type z2ui5_if_exit, the superseded exit name
// upstream keeps working - so that interface stays, and nothing else. The
// transpile checks the syntax of everything it reads, so a sample or a
// framework class that needs more of src/99 fails the build by name.
const LEGACY = "[\\\\/]downport[\\\\/]99[\\\\/](?!package\\.devc\\.xml$|z2ui5_if_exit\\.)";

function fail(message) {
  console.error(`build: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(SAMPLES)) fail(`${path.relative(ROOT, SAMPLES)} does not exist - run \`npm run clone\` first`);

const require = createRequire(path.join(ROOT, "package.json"));
let manifest;
try {
  manifest = require(`${RUNTIME}/package.json`);
} catch {
  fail(`${RUNTIME} is not installed - run \`npm ci\` first`);
}
const built = manifest.abap2ui5 || {};
const {transpile, transpileConfig, ensureCheckout, OPEN_ABAP_CORE_URL, EXPRESS_ICF_SHIM_URL} =
  await import(`${RUNTIME}/setup/transpile.mjs`);
console.log(`build: ${RUNTIME} ${manifest.version} (abap2UI5 @ ${built.commit}, transpiler ${built.transpiler})`);

// The transpiled output runs on @abaplint/runtime, and the package pins the
// one its transpiler belongs to. output/init.mjs imports it from this
// project's node_modules - a second, other copy there would be the one the
// bundle carries.
const wanted = manifest.dependencies["@abaplint/runtime"];
const found = require("@abaplint/runtime/package.json").version;
if (found !== wanted) fail(`@abaplint/runtime ${found} is installed at the top of node_modules, ${RUNTIME} ${manifest.version} pins ${wanted}`);

// 1. the two libraries
const libs = {};
for (const library of [
  {name: "open-abap-core", url: OPEN_ABAP_CORE_URL, recorded: "openAbapCore"},
  {name: "express-icf-shim", url: EXPRESS_ICF_SHIM_URL, recorded: "expressIcfShim"},
]) {
  const commit = built[library.recorded];
  if (!commit) fail(`${RUNTIME} ${manifest.version} does not record abap2ui5.${library.recorded}`);
  const dir = path.join(ROOT, "deps", `${library.name}-${commit}`);
  try {
    libs[library.name] = ensureCheckout({dir, commit, library, log: (line) => console.log(line)});
  } catch (e) {
    const why = e.cause?.stderr?.toString().trim() || e.cause?.message || e.message;
    fail(`${library.name} @ ${commit} could not be checked out into ${path.relative(ROOT, dir)} (${why})`);
  }
}

// 2. + 3. the config and the transpile
try {
  const config = transpileConfig({
    cwd: ROOT,
    abap: SAMPLES,
    output: OUTPUT,
    core: libs["open-abap-core"],
    shim: libs["express-icf-shim"],
  });
  config.write_unit_tests = true;
  config.write_source_map = true;
  config.exclude_filter = [LEGACY];
  const configFile = path.join(ROOT, "ci", "abap_transpile.run.json");
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2) + "\n");
  transpile({cwd: ROOT, config: path.relative(ROOT, configFile), log: (line) => console.log(line)});
} catch (e) {
  fail(e.message);
}
