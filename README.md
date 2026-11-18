## browser-demo

**Live demo: [abap2ui5.github.io/browser-demo](https://abap2ui5.github.io/browser-demo/)** — the
complete abap2UI5 backend, downported, transpiled to JavaScript and running
inside your browser tab. No server, no SAP system.

The framework is not built here: abap2UI5 downports and transpiles itself and
publishes the result as [`@abap2ui5/node-runtime`](https://www.npmjs.com/package/@abap2ui5/node-runtime).
This repository adds the samples to that package and bundles both for the
browser.

The build is **frozen**: abap2UI5 (the package version in `package.json`, and
with it the open-abap libraries), the samples and the UI5 release
([ci/pins.json](ci/pins.json)) are pinned, there is no scheduled
rebuild, and the demo only changes when this repository does. This
repository is the source and publishes the demo itself (GitHub Pages).
Contributor and agent guidance lives in [AGENTS.md](AGENTS.md).

Want to write and run your own abap2UI5 code in the browser? That is the
[playground](https://abap2ui5.github.io/browser-playground/) — an editor, lessons and
an AI app builder. This repository is the fixed demo of the framework and its
samples, plus a Node.js host.

*Formerly `web-abap2UI5`, deployed through a separate `web-abap2UI5-build`
repository; the old URL redirects here.*

### Functionality
* The framework from [`@abap2ui5/node-runtime`](https://www.npmjs.com/package/@abap2ui5/node-runtime): abap2UI5 downported with [abaplint](https://abaplint.org/) by its own pipeline, with the transpile recipe for a host's own classes
* Transpiling the framework and the samples to JS with [abaplint/transpiler](https://github.com/abaplint/transpiler), in one run
* Running on Node.js with [open-abap](https://github.com/open-abap/open-abap)
* Service exposing via [express-icf-shim](https://github.com/open-abap/express-icf-shim)
* Running the same backend **in the browser**: webpack bundles the transpiled
  ABAP into one script and [sql.js](https://sql.js.org/) (SQLite compiled to
  wasm) stands in for the database, so the demo needs no server at all — it is
  a static GitHub Pages site

### Tasks
##### Transpile
```
npm ci            # @abap2ui5/node-runtime and the transpiler it names
npm run clone     # the samples, at the commit in ci/pins.json
npm run build     # the framework and the samples -> ./output (about 20 seconds)
```
##### Run Unit Tests
```
npm test          # clone once, then: transpile + the samples' unit tests
npm run test:unit # only the transpiled unit tests, on an existing ./output
```
`npm test` is exactly what CI runs as "the tests". The framework's own unit
tests are not part of it: abap2UI5 runs them on the release commit, and the
package does not carry them.

##### Run Webservice
The transpiled backend on Node.js, served by the package's express host on port 3000. Started by
hand — it is not part of any test run:
```
npm run serve:express
```

##### Webpack Build Strategy

1. Install `@abap2ui5/node-runtime` (the downported framework), clone the samples into /abap2UI5-samples/
2. Transpile both, with open-abap-core and express-icf-shim, into /output/
3. Webpack backend + database into folder build

```
npm run build:web
```

The bundle contains no static frontend copy: at runtime `app/web.mjs` initializes the transpiled backend, issues an in-memory HTTP GET against it (the same `z2ui5_cl_ui5_http_handler` GET that serves real systems, including the `sap.ui.require.preload` of the complete current UI5 frontend) and `document.write`s the returned page. Frontend and backend are therefore always the same abap2UI5 commit, the release `@abap2ui5/node-runtime` was built from. The backend's Content-Security-Policy meta tag is stripped from the written page — it is designed for server-served deployments (no `unsafe-eval`/`wasm-unsafe-eval`) and would break the wasm/eval-based in-browser runtime while protecting nothing here.

Test the build locally (webpack-dev-server HMR does not work with the `document.write` boot):

```
npm run serve:build
```

### Media Pipeline

Record any abap2UI5 app as video and screenshot — post-ready assets for
LinkedIn, docs and READMEs:

```
npm run media -- --app <app-class>
```

By default this records the app on the published web build above; `--url`
points it at any other page that starts apps via `?app_start=` (a local
`serve:build`, a real system). `--steps <file>` replays a scripted
interaction ([media/steps.example.json](media/steps.example.json)), `--size`
switches between desktop, phone and tablet viewports. Output per app:
`.webm` and `.png` always, `.mp4` (what LinkedIn ingests best) and `.gif`
when ffmpeg is installed. [media/record.mjs](media/record.mjs) documents
all options, including offline recording via `--ui5-from`.

### CI
The `build_web` workflow runs on every push to main (and deploys), on pull requests and by hand — there is no schedule: it installs `@abap2ui5/node-runtime`, clones [samples](https://github.com/abap2UI5/samples), runs the transpile, the samples' unit tests and the webpack build, then **smoke tests the built site in a real browser** before publishing it to GitHub Pages. The package version is pinned in `package.json` and the samples' commit in `ci/pins.json`, so a rerun of the same commit builds the same demo.

The browser gate is the one that matters: everything upstream of it can be green while the deployed page is blank, because a bundling or initialization fault only shows when the bundle actually runs. `tests/web.spec.js` loads the freshly built `./build`, waits for the in-browser backend to answer, and asserts an event roundtrip restores the saved draft. Before it existed, the site deployed completely untested.

```
npm run build:web   # build ./build
npm run test:e2e    # the same gate, locally (playwright, project chromium-web)
```

`@abaplint/transpiler-cli` is pinned to exactly the version `@abap2ui5/node-runtime` was built with (`abap2ui5.transpiler` in its `package.json`) — transpiler output is tied to its runtime, and the package pins the runtime. There is no Dependabot: `package-lock.json` decides every npm version.

The deploy is a **production** webpack build. Two Terser defaults have to be turned off for it (`keep_classnames`, `keep_fnames`) because the transpiled ABAP carries its type system in the class and function names that RTTI reads back — see the comment in `webpack.config.js`.

The deployed site is not only the bundle: `app/pages/404.html` is copied into
`./build` before the deploy, and the build's provenance is written as
`BUILD_INFO.json`. The deploy job publishes exactly `./build` — every file that
should be on the site has to be produced here.

### Limitations & Todo
* Every sample has to transpile: the transpile checks the samples against the framework, so one that needs a real SAP system fails the build and has to stay out of the pinned commit's `src/`
* `src/99` of abap2UI5 (the frozen legacy package) is not part of the build. `ci/transpile.mjs` leaves it out of the transpile (all but `z2ui5_if_exit`). Should a sample ever need one of those classes again, the fix belongs in the sample — `src/99` is on abap2UI5's removal plan and will not be there forever
* A known upstream [@abaplint/transpiler](https://github.com/abaplint/transpiler) issue makes `check_on_init( )` always false in the transpiled backend (interface attributes read through an interface-typed reference resolve to a missing JS property), so backend-built view XML may not be returned even though the roundtrip succeeds

### Credits
* abaplint, open-abap, express-icf-shim, webpacking by [larshp](https://github.com/larshp)
