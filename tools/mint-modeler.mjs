#!/usr/bin/env node
// Generate the Sonoma Raceway GLB with the Mint Modeler API.
// Resumable: state (idempotency key, reference image ID, operation ID) lives in build/state.json,
// so rerunning continues the same paid operation instead of starting another.
//
// Usage: node tools/mint-modeler.mjs
// Key: MINT_API_KEY env var, or the contents of ~/.mint-api-key. Never printed.

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const BASE_URL = "https://api.mint.gg/v1";
const ROOT = new URL("..", import.meta.url).pathname;
const BUILD = join(ROOT, "build");
const STATE_PATH = join(BUILD, "state.json");
const QUALITY_TIER = "studio";
const MAX_CREDITS = 100_000; // studio tier price; the API maximum
const TIMEOUT_MS = 6 * 60 * 60 * 1000;

const keyFile = join(homedir(), ".mint-api-key");
const apiKey = (process.env.MINT_API_KEY || (existsSync(keyFile) ? readFileSync(keyFile, "utf8") : "")).trim();
if (!apiKey) throw new Error("Set MINT_API_KEY or write it to ~/.mint-api-key.");

mkdirSync(BUILD, { recursive: true });
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

// 1. Reference map
if (!state.referenceImageId) {
  state.referenceKey ??= randomUUID();
  save();
  const png = readFileSync(join(ROOT, "reference/reference-map.png"));
  const image = await api("/reference-images", {
    method: "POST",
    idempotencyKey: state.referenceKey,
    body: {
      base64Data: png.toString("base64"),
      fileName: "sonoma-raceway-reference-map.png",
      contentType: "image/png",
      name: "Sonoma Raceway layout and elevation",
    },
  });
  state.referenceImageId = image.id;
  save();
  log("reference image", image.id);
}

// 2. Start generation (once)
if (!state.operationId) {
  state.generateKey ??= randomUUID();
  save();
  const op = await api("/modeler:generate", {
    method: "POST",
    idempotencyKey: state.generateKey,
    body: {
      prompt: readFileSync(join(ROOT, "prompt.md"), "utf8").trim(),
      referenceImageIds: [state.referenceImageId],
      qualityTier: QUALITY_TIER,
      maxCredits: MAX_CREDITS,
    },
  });
  state.operationId = op.id;
  save();
  log("operation started", op.id, op.status);
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
  writeFileSync(join(BUILD, "operation.json"), JSON.stringify(op, null, 2));
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
  const ext = name === "glb" ? "glb" : (res.headers.get("content-type") || "").split("/")[1]?.split(";")[0] || "bin";
  const out = join(ROOT, name === "glb" ? "sonoma-raceway.glb" : `renders/mint-${name}.${ext}`);
  writeFileSync(out, Buffer.from(await res.arrayBuffer()));
  log("saved", out);
}
log("done; model", op.resource?.id, "billing", op.modeler?.billingState);
