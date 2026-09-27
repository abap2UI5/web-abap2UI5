// @ts-check
const { test, expect } = require('@playwright/test');

// Smoke test for the webpack browser build (the GitHub Pages demo): the
// bundle boots the transpiled ABAP backend in the browser, fetches the
// frontend HTML from it and document.writes it. Runs against the static
// build server (srv/serve_build.mjs) via the chromium-web project.
//
// Deliberately no assertion on rendered view content: a known upstream
// @abaplint/transpiler issue makes check_on_init() always false in the
// transpiled backend, so it may not return view XML even though the
// roundtrip itself succeeds.

// The frontend state of the page's component. Read through UI5's component
// registry, because there is no page-wide handle any more: abap2UI5 dropped
// the window.z2ui5 global on 2026-09-22 and moved the state onto a context
// per z2ui5.Component (core/Context.js), which Component.init also hangs on
// the component as `ctx`. Probing the old global timed out on a page that
// had booted fine - the smoke went red for its own probe, not for the page.
// "container-z2ui5" is the id ComponentSupport gives the component of the
// backend GET page: its settings id "z2ui5", prefixed with the container's
// data-id "container" (z2ui5_cl_ui5_http_handler=>_http_get) - the same id
// upstream's own e2e specs read. getComponentById exists since UI5 1.120,
// the deprecated get( ) before it.
function frontendState() {
  const Component = window["sap"]?.ui?.require?.("sap/ui/core/Component");
  if (!Component) return undefined;
  const component = Component.getComponentById
    ? Component.getComponentById("container-z2ui5")
    : Component.get("container-z2ui5");
  return component?.ctx?.state;
}

test('webpack build boots the backend-served frontend', async ({ page }) => {
  test.setTimeout(240000);
  await page.goto('/');
  await expect(page).toHaveTitle(/abap2UI5/);

  // Backend initialized in the browser and the GET HTML was written
  // (works without the UI5 CDN - pure in-browser backend + document.write).
  await page.waitForFunction(() => !!document.getElementById('sap-ui-bootstrap'), null, { timeout: 90000 });

  // UI5 loaded from the CDN and the component initialized with the backend
  // page's component data (Component.init sets checkLocal from it).
  await page.waitForFunction(`(${frontendState})()?.checkLocal === true`, null, { timeout: 90000 });

  // The first POST roundtrip through the in-browser backend completed
  // (Server.responseSuccess stores the parsed response on the context state).
  await page.waitForFunction(`!!(${frontendState})()?.oResponse`, null, { timeout: 90000 });
});

// Regression test for the draft save/load cycle: the first roundtrip
// persists the app as a draft, an event roundtrip (like the startup app's
// "Check" button) restores it via db_load. Without the dissolve guard
// (ci/patch_diss_oref.mjs) the restore died with "LOOP at undefined",
// surfacing as "Network error: LOOP at undefined" on every button press of
// the GitHub Pages demo. Fires the POSTs directly against the in-browser
// backend's fetch override, so no UI5 CDN access is needed.
test('event roundtrip restores the saved draft (BUTTON_CHECK)', async ({ page }) => {
  test.setTimeout(240000);
  await page.goto('/');
  await page.waitForFunction(() => !!document.getElementById('sap-ui-bootstrap'), null, { timeout: 90000 });

  const result = await page.evaluate(async () => {
    const sFront = () => ({
      CONFIG: {},
      ORIGIN: window.location.origin,
      PATHNAME: window.location.pathname,
      SEARCH: '',
      HASH: '',
    });
    const post = async (body, contextId) => {
      const headers = { 'Content-Type': 'application/json', 'sap-contextid-accept': 'header' };
      if (contextId) headers['sap-contextid'] = contextId;
      const response = await fetch(window.location.href, {
        method: 'POST',
        headers,
        body: JSON.stringify({ value: body }),
      });
      return {
        contextId: response.headers.get('sap-contextid'),
        data: JSON.parse(await response.text()),
      };
    };

    const first = await post({ S_FRONT: sFront() });
    const front = sFront();
    front.ID = first.data.S_FRONT.ID;
    front.EVENT = 'BUTTON_CHECK';
    front.VIEW = 'MAIN';
    const second = await post({ S_FRONT: front }, first.contextId);
    return {
      app: first.data.S_FRONT.APP,
      id1: first.data.S_FRONT.ID,
      id2: second.data.S_FRONT?.ID,
    };
  });

  // renamed from Z2UI5_CL_APP_STARTUP by abap2UI5#2564
  expect(result.app).toBe('Z2UI5_CL_UI5_APP_START');
  expect(result.id1).toBeTruthy();
  expect(result.id2).toBeTruthy();
  expect(result.id2).not.toBe(result.id1);
});
