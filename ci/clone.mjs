/*
 * Fetches one source from ci/pins.json at exactly its pinned commit.
 *
 *   node ci/clone.mjs <name> [<name> ...]
 *
 * Until 2026-10-06 the build cloned the tip of every source (`git clone
 * --depth=1`, and the transpiler/abaplint cloning their libraries the same
 * way) and a daily cron rebuilt the demo from whatever that tip was. Every
 * upstream commit could therefore turn the deployed demo red without a single
 * change here - and did, again and again (see AGENTS.md). The demo is frozen
 * now: a fresh, shallow checkout of the pinned commit and nothing else.
 */
import fs from "node:fs";
import {execFileSync} from "node:child_process";

const pins = JSON.parse(fs.readFileSync(new URL("./pins.json", import.meta.url), "utf8"));

const names = process.argv.slice(2);
if (names.length === 0) {
  console.error("clone: usage: node ci/clone.mjs <name> [<name> ...]");
  process.exit(1);
}

const git = (...args) => execFileSync("git", args, {stdio: "inherit"});

for (const name of names) {
  const pin = pins.sources[name];
  if (!pin) {
    console.error(`clone: "${name}" is not in ci/pins.json (known: ${Object.keys(pins.sources).join(", ")})`);
    process.exit(1);
  }
  if (!/^[0-9a-f]{40}$/.test(pin.commit)) {
    console.error(`clone: the pin of "${name}" must be a full 40-character commit sha, found "${pin.commit}"`);
    process.exit(1);
  }
  fs.rmSync(pin.dir, {recursive: true, force: true});
  fs.mkdirSync(pin.dir, {recursive: true});
  git("-C", pin.dir, "init", "-q");
  git("-C", pin.dir, "fetch", "-q", "--depth=1", pin.url, pin.commit);
  git("-C", pin.dir, "-c", "advice.detachedHead=false", "checkout", "-q", "FETCH_HEAD");
  console.log(`clone: ${name} at ${pin.commit} -> ${pin.dir}`);
}
