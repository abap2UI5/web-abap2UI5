// Node's `crypto.createHash` for the bundle - the one function of that module
// the transpiled backend cannot run without, and the browser does not have.
//
// From abap2UI5 1.147.0 on, every POST roundtrip hashes the model
// (z2ui5_cl_ui5_util_context=>hash_string, through open-abap's
// cl_abap_message_digest), and that class's kernel line is
//
//   const crypto = await import("crypto");
//   crypto.createHash(algorithm).update(data, "hex").digest("hex")
//
// With `crypto` resolved to nothing (the fallback this file replaces) that
// was "createHash is not a function" out of every roundtrip: the page booted
// and no request was ever answered - found by the browser smoke on the move
// to @abap2ui5/node-runtime 1.148.0. WebCrypto cannot stand in, its digest is
// a promise and this call is synchronous; so the hash is computed in
// JavaScript, by @noble/hashes.
//
// Deliberately NOT exported: randomUUID. open-abap's cl_system_uuid asks the
// module for it and falls back to window.crypto.randomUUID( ) when the
// property is absent - the path this demo has always taken. An algorithm
// that is not in the table says so instead of answering something.
import {Buffer} from "buffer";
import {sha256, sha384, sha512} from "@noble/hashes/sha2.js";
import {md5, sha1} from "@noble/hashes/legacy.js";

const ALGORITHMS = {md5, sha1, sha256, sha384, sha512};

export function createHash(algorithm) {
  const hash = ALGORITHMS[String(algorithm).toLowerCase().replace("-", "")];
  if (!hash) {
    throw new Error(`crypto.createHash("${algorithm}") is not available in the browser build (app/crypto-shim.mjs knows ${Object.keys(ALGORITHMS).join(", ")})`);
  }
  const state = hash.create();
  const api = {
    update(data, encoding) {
      state.update(typeof data === "string" ? Buffer.from(data, encoding || "utf8") : data);
      return api;
    },
    digest(encoding) {
      const out = Buffer.from(state.digest());
      return encoding ? out.toString(encoding) : out;
    },
  };
  return api;
}
