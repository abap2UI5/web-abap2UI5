# AGENTS.md — browser-demo

Guidance for AI agents and contributors. Single source of truth for this
repository's rules. Read before making any change.

## What this repo is

A browser build, not a framework - and not a pipeline of its own any more.
[abap2UI5](https://github.com/abap2UI5/abap2UI5) downports and transpiles
itself and publishes the result as the npm package
[`@abap2ui5/node-runtime`](https://www.npmjs.com/package/@abap2ui5/node-runtime).
This repository takes that package, adds the [samples](https://github.com/abap2UI5/samples)
to it in one transpile (the package's own recipe for "your own apps",
`ci/transpile.mjs`), and webpacks the result into a single bundle that runs
the **whole backend inside the browser tab** — sql.js stands in for the
database. The `build_web` workflow publishes it to this repository's GitHub
Pages (<https://abap2ui5.github.io/browser-demo/>).

Until 2026-11 the repository was called `web-abap2UI5` and pushed the build
with a deploy key into a second repository, `web-abap2UI5-build`, that existed
only to be served. That repository is archived and only redirects its old URL
here; do not deploy to it again.

Until 2026-11 this repository cloned abap2UI5 and ran the whole downport and
transpile itself: a second copy of the framework's pipeline, with its own
abaplint pin, its own copy of the downport rules and of the unit-test skip
list, and three patch scripts to keep up with upstream. None of that is here
now, on purpose - do not bring a clone of abap2UI5 back.

**The demo is frozen** — see "Frozen inputs" below. It does not follow
upstream any more; it changes only when someone changes this repository.

Nothing under `abap2UI5-samples/`, `deps/`, `output/`, `build/` is a source
file — all four are gitignored build products. Framework fixes belong upstream in
abap2UI5, not here.

| Path | What it is |
|---|---|
| `ci/` | `pins.json` (samples commit, UI5 release), `clone.mjs` (the samples at their pin), `transpile.mjs` (the package's transpile with the samples) |
| `srv/` | Node-side entry points: the package's express host on this output, the static build server |
| `app/` | browser entry: `web.mjs` (boot), `crypto-shim.mjs`, `process-shim.js`, `index.html`, `css/`, `pages/` |
| `app/pages/` | the 404 page copied into the deploy |
| `tests/web.spec.js` | the browser smoke gate (Playwright project `chromium-web`) |

## Build & test

```bash
npm run clone       # the samples at their pin into ./abap2UI5-samples
npm test            # build (the transpile, ~20 s) + the samples' transpiled unit tests
npm run build:web   # webpack production build into ./build
npm run test:e2e    # the browser smoke against ./build (needs build:web first)
```

`npm test` is exactly what CI runs as the tests — keep it that way. Script
names are namespaced (`clone:*`, `build:*`, `test:*`, `serve:*`); a new script
joins a namespace rather than inventing a bare name.

`npm test` runs the unit tests of the samples only. The framework's own
suite is not in the package (it leaves the test classes out, a third of its
size) and is not this repository's to run: abap2UI5 runs it on the release
commit before it publishes. What this repository adds - the samples on that
framework, in a browser - is what `npm test` and the smoke judge.

## Things that look removable and are not

Each of these was paid for with a broken deploy. The full story is in the
comment at the code; this list exists so nobody deletes one without reading it.

- **The `exclude_filter` in `ci/transpile.mjs`, and the one interface it
  lets through.** The package's `downport/` carries abap2UI5's frozen legacy
  package `src/99` (`z2ui5_cl_xml_view`, the old `z2ui5_cl_util`, ...).
  Nothing in the framework proper or in the samples uses it and it is 2.9 MiB
  of the bundle (11.4 against 8.5 MiB on 1.148.0), so the transpile leaves it
  out - except `z2ui5_if_exit`: `z2ui5_cl_ui5_user_exit` still declares a
  reference of that type, because upstream keeps the superseded exit name
  working. Dropping the whole folder broke every scheduled build from
  2026-08-22 on. The transpile checks the syntax of all it reads, so a sample
  that needs more of `src/99` fails the build by name; the fix belongs in the
  sample. When upstream deletes `z2ui5_if_exit`, the exception goes with it.

- **The exact pin of `@abaplint/transpiler-cli`** (`package.json`). It is the
  version `@abap2ui5/node-runtime` was built with (`abap2ui5.transpiler` in
  its `package.json`), and the package pins the `@abaplint/runtime` that
  version's output runs on. The package's transpile refuses another
  transpiler; `ci/transpile.mjs` refuses a second `@abaplint/runtime` at the
  top of `node_modules`. Move it with the package, never alone - and do not
  add `@abaplint/runtime` or `@abaplint/database-sqlite` as dependencies of
  this repository: they come with the package, at its versions.

- **`app/crypto-shim.mjs`, the `crypto` fallback in `webpack.config.js`.**
  From abap2UI5 1.147.0 on every roundtrip hashes the model through open-abap's
  `cl_abap_message_digest`, which calls Node's synchronous
  `crypto.createHash`. With `crypto` resolved to nothing the page booted and
  answered no request ("createHash is not a function") - what the browser
  smoke reported on the move to 1.148.0. The shim computes the hash in
  JavaScript (`@noble/hashes`; WebCrypto's digest is a promise) and exports
  nothing else: `cl_system_uuid` falls back to `window.crypto.randomUUID( )`
  only while the module has no `randomUUID` of its own.

- **`keep_classnames` / `keep_fnames` in the Terser options**
  (`webpack.config.js`). The transpiled ABAP carries its type system in the
  *names*: RTTI (`describe_by_data` and friends) reads class and function
  names off the generated objects. Mangling them makes RTTI derive types from
  `a` and `s`, and the failure surfaces far away as a `CONVT_NO_NUMBER` out of
  a `class_constructor` during boot — a blank page with one console line. Costs
  ~150 KB of the ~2.9 MB minification saves.

- **Stripping the Content-Security-Policy meta tag** (`app/web.mjs`). The
  backend's CSP is written for server-served deployments (no `unsafe-eval` /
  `wasm-unsafe-eval`). Written into this document it would block the already
  running wasm/eval runtime while protecting nothing — there is no network
  backend in this demo.

- **The Request branch of the fetch override** (`app/web.mjs`). The override
  routes a `fetch()` addressed to this page into the transpiled backend, and it
  has to recognize the target in all three argument shapes the Fetch API takes:
  a string, a `URL` — and a `Request`. The last one is not hypothetical.
  OpenUI5 1.152 ships `sap/ui/performance/FetchInterceptor`, which wraps
  whatever `globalThis.fetch` is when it loads (this override) and always calls
  it as `fetch(new Request(...))`, folding the init object into the request. A
  string-or-URL-only test therefore stopped matching, every backend POST fell
  through to the network and came back as the static server's 404
  `Cannot POST /`: the page booted, rendered nothing and answered no button.
  Nothing in this repository or upstream changed that day — the page boots UI5
  from the *cachebuster* URL, so the CDN flipping to 1.152 was enough to turn
  the same commit red. For the same reason `backendFetch` answers with a real
  `Response` and not a duck-typed look-alike: the interceptor hands the
  returned object to its `onResponse` hooks, which `clone()` it.

- **The browser smoke gate** (`tests/web.spec.js`, run before the deploy).
  Everything upstream of it can be green while the deployed page is blank: a
  bundling or initialization fault only shows when the bundle actually runs.
  It also caught the bootstrap-tag regex matching a string *inside* the
  preload, see the comment in `app/web.mjs`, and the missing `createHash`
  above.

## What went with the private pipeline

Listed so nobody rebuilds one of them from the git history without knowing
why it is gone:

- `ci/patch_diss_oref.mjs` patched the framework's source before the
  downport, so `dissolve( )` would not walk from an app's `CLIENT` into the
  framework core (the draft save then cleared the core's `MT_ATTRI`, "LOOP at
  undefined" on the first button press). The framework guards that itself now
  (`z2ui5_cl_ui5_srv_model=>diss_oref`, by the client interface), and the
  second spec of `tests/web.spec.js` - written for exactly that fault - is
  green on the unpatched package. A framework fault belongs upstream; the
  package's sources are not patched here.
- `ci/patch_init_order.mjs` rewrote the static imports of `output/_init.mjs`
  into sequential `await import( )`. The transpiler writes them that way
  itself from 2.14 on (`output/init.mjs`, which `app/web.mjs` imports now).
- `ci/merge_transpile_skips.mjs`, `ci/merge_downport_config.mjs`,
  `ci/check-abaplint-pin.mjs` and the `@abaplint/cli` pin kept this
  repository's copy of the framework's unit-test skip list, downport rules
  and abaplint version in step with the clone. There is no downport here and
  no framework test run, so there is nothing left to keep in step.
- `srv/zcl_sicf.clas.abap` and `ci/setup.mjs`: the ICF handler and the
  database hook are the package's (`downport/zcl_sicf.clas.abap`,
  `setup/setup.mjs`).

## Deploy

`build_web.yaml` uploads `./build` as the Pages artifact and a separate
`deploy` job (the only one holding `pages: write` and `id-token: write`)
publishes it — on `main` of `abap2UI5/browser-demo` only, after the unit tests
and the browser smoke. The site is exactly what `./build` contains; anything
visitors should find ships from `app/pages/` and the copy step in the
workflow. The repository's Pages source has to be set to "GitHub Actions".
The deploy history is the `github-pages` environment.

`BUILD_INFO.json` records what the deploy was built from (the pins, the UI5
release, this repository's commit) and is read by nobody. The old
`build-stamp.txt` went with the daily cron, its only reader.

## Frozen inputs

Until 2026-10-06 a daily cron rebuilt the demo from the *tip* of abap2UI5 and
samples (and the transpiler and abaplint cloned the tip of open-abap-core and
express-icf-shim on every run), and the page booted the *newest* UI5 from the
CDN's cachebuster URL. Every one of those could turn the demo red without a
change here, and did — more scheduled runs failed than passed in the weeks
before. The demo is frozen, and every input has exactly one place:

- **`package.json` / `package-lock.json`** hold abap2UI5 itself:
  `@abap2ui5/node-runtime` at an exact version is one release commit of the
  framework, downported by the framework's own pipeline. Its `package.json`
  records the commits of open-abap-core and express-icf-shim it was built
  against (`abap2ui5.openAbapCore`, `abap2ui5.expressIcfShim`) and its
  transpiler (`abap2ui5.transpiler`); `ci/transpile.mjs` checks both
  libraries out at exactly those commits into `deps/` and the transpiler is
  pinned to exactly that version.
- **`ci/pins.json`** holds what is not an npm package: the commit of the
  samples (`ci/clone.mjs` fetches exactly it, `npm run clone`) and the UI5
  release. `app/web.mjs` rewrites the bootstrap `src` to
  `https://sdk.openui5.org/<ui5>/resources/sap-ui-core.js`. The UI5 pin is
  the 1.136 long-term-maintenance line, so the CDN keeps serving it for years;
  abap2UI5 supports UI5 down to 1.71.
- **No schedule.** `build_web` runs on push to main (and deploys), on pull
  requests and by hand. A build of the same commit reads the same inputs.
- **No Dependabot.** `package-lock.json` decides every npm version (`npm ci`),
  actions are SHA-pinned, the runner is `ubuntu-24.04`, Node comes from
  `.nvmrc`.

To refresh the demo, move `@abap2ui5/node-runtime` (and
`@abaplint/transpiler-cli` to the version it names) and the samples pin by
hand in one pull request; `build_web` — the transpile, which type-checks the
samples against that framework, the unit tests and the browser smoke — is the
verdict. Do not reintroduce a schedule or a branch-tip clone: the point of
the freeze is that nothing moves on its own.
