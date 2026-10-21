#!/usr/bin/env node
// Generate or revise the Sonoma Raceway GLB with the Mint Modeler API.
// Resumable: state (idempotency keys, reference image IDs, operation ID) lives in the --state file,
// so rerunning continues the same paid operation instead of starting another.
//
// Generate (defaults reproduce the original Studio run):
//   node tools/mint-modeler.mjs
// Revise an existing Modeler asset:
//   node tools/mint-modeler.mjs --revise MODEL_ID --prompt revision-prompt.md \
//     --ref a.png --ref b.jpg --tier high --max-credits 25000 \
//     --state build/revise-1.json --out sonoma-raceway-v2.glb --preview-out renders/mint-preview-v2.png
//
// Key: MINT_API_KEY env var, or the contents of ~/.mint-api-key. Never printed.

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { parseArgs } from "node:util";

const BASE_URL = "https://api.mint.gg/v1";
const ROOT = new URL("..", import.meta.url).pathname;
const TIMEOUT_MS = 6 * 60 * 60 * 1000;

const { values: opts } = parseArgs({
  options: {
    revise: { type: "string" },
    prompt: { type: "string", default: "prompt.md" },
    ref: { type: "string", multiple: true, default: ["reference/reference-map.png"] },
    tier: { type: "string", default: "studio" },
    "max-credits": { type: "string", default: "100000" }, // studio tier price; the API maximum
    state: { type: "string", default: "build/state.json" },
    out: { type: "string", default: "sonoma-raceway.glb" },
    "preview-out": { type: "string", default: "renders/mint-preview.png" },
  },
});
const path = (p) => resolve(ROOT, p);

const keyFile = join(homedir(), ".mint-api-key");
const apiKey = (process.env.MINT_API_KEY || (existsSync(keyFile) ? readFileSync(keyFile, "utf8") : "")).trim();
if (!apiKey) throw new Error("Set MINT_API_KEY or write it to ~/.mint-api-key.");

const STATE_PATH = path(opts.state);
mkdirSync(dirname(STATE_PATH), { recursive: true });
const state = existsSync(STATE_PATH) ? JSON.parse(readFileSync(STATE_PATH, "utf8")) : {};
const save = () => writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
const log = (...a) => console.log(new Date().toISOString(), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, { method = "GET", body, idempotencyKey } = {}) {
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(60_000),
      });
    } catch (err) {
      // Network failure: reads retry until the overall poll deadline; idempotent mutations a few times.
      if (method === "GET" || (idempotencyKey && attempt < 8)) {
        const wait = Math.min(60_000, 2000 * 2 ** Math.min(attempt, 5));
        log(`network error on ${path} (${err.cause?.code || err.name}); retrying in ${wait} ms`);
        await sleep(wait);
        continue;
      }
      throw err;
    }
    const text = await res.text();
    const json = text ? JSON.parse(text) : null;
    if (res.ok) return json;
    const retryable = res.status === 429 || res.status >= 500;
    if (retryable && attempt < 5 && (method === "GET" || idempotencyKey)) {
      const wait = Number(res.headers.get("retry-after")) * 1000 || 2000 * 2 ** attempt;
      log(`HTTP ${res.status} on ${path}; retrying in ${wait} ms`);
      await sleep(wait);
      continue;
    }
    const err = new Error(`Mint API ${res.status} ${path}: ${json?.detail || json?.title || text.slice(0, 300)}`);
    err.problem = json;
    throw err;
  }
}

// 1. Reference images (uploaded once each)
const CONTENT_TYPES = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };
state.references ??= {};
// Older state files stored a single reference image.
if (state.referenceImageId && !Object.keys(state.references).length) {
  state.references["reference/reference-map.png"] = { id: state.referenceImageId, key: state.referenceKey };
}
for (const ref of opts.ref) {
  const entry = (state.references[ref] ??= { key: randomUUID() });
  save();
  if (entry.id) continue;
  const image = await api("/reference-images", {
    method: "POST",
    idempotencyKey: entry.key,
    body: {
      base64Data: readFileSync(path(ref)).toString("base64"),
      fileName: basename(ref),
      contentType: CONTENT_TYPES[extname(ref).toLowerCase()] || "application/octet-stream",
      name: `Sonoma Raceway – ${basename(ref, extname(ref))}`,
    },
  });
  entry.id = image.id;
  save();
  log("reference image", ref, image.id);
}

// 2. Start generation or revision (once)
if (!state.operationId) {
  state.generateKey ??= randomUUID();
  save();
  const route = opts.revise ? `/modeler/${encodeURIComponent(opts.revise)}:revise` : "/modeler:generate";
  const op = await api(route, {
    method: "POST",
    idempotencyKey: state.generateKey,
    body: {
      prompt: readFileSync(path(opts.prompt), "utf8").trim(),
      referenceImageIds: opts.ref.map((r) => state.references[r].id),
      qualityTier: opts.tier,
      maxCredits: Number(opts["max-credits"]),
    },
  });
  state.operationId = op.id;
  save();
  log(opts.revise ? "revision started" : "operation started", op.id, op.status);
}

// 3. Poll with bounded backoff
const started = Date.now();
let delay = 2000;
let op;
let last = "";
while (true) {
  op = await api(`/operations/${state.operationId}`);
  const now = `${op.status}/${op.modeler?.stage}/${op.modeler?.billingState}`;
  if (now !== last) log("status", now);
  last = now;
  writeFileSync(STATE_PATH.replace(/\.json$/, ".operation.json"), JSON.stringify(op, null, 2));
  if (["succeeded", "partially_succeeded", "failed", "canceled", "billing_required", "preview_ready"].includes(op.status)) break;
  if (Date.now() - started > TIMEOUT_MS) throw new Error("Timed out polling; rerun to resume.");
  await sleep(delay + Math.random() * 500);
  delay = Math.min(15_000, Math.ceil(delay * 1.6));
}

if (op.status !== "succeeded") {
  log("terminal", op.status, JSON.stringify(op.error || op.billing || {}));
  process.exit(1);
}

// 4. Download deliverables
for (const [name, url] of Object.entries(op.modeler?.artifacts || {})) {
  let res;
  for (let attempt = 0; ; attempt++) {
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(10 * 60_000) });
      if (res.ok) break;
      if (res.status < 500 || attempt >= 8) throw new Error(`download ${name} failed: ${res.status}`);
    } catch (err) {
      if (attempt >= 8 || err.message.startsWith("download")) throw err;
    }
    log(`download ${name} retry ${attempt + 1}`);
    await sleep(Math.min(60_000, 2000 * 2 ** attempt));
  }
  const out = path(name === "glb" ? opts.out : name === "preview" ? opts["preview-out"] : `build/${name}`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, Buffer.from(await res.arrayBuffer()));
  log("saved", out);
}
log("done; model", op.resource?.id, "billing", op.modeler?.billingState);
