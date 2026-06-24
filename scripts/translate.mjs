#!/usr/bin/env node
/**
 * Generate locale files for VideoStallone from the English source (en.json)
 * using a local LM Studio (OpenAI-compatible) endpoint.
 *
 * Usage:
 *   LMSTUDIO_TOKEN=sk-lm-... node scripts/translate.mjs
 *   LMSTUDIO_MODEL=qwen3.6-35b-a3b LMSTUDIO_TOKEN=... node scripts/translate.mjs fr ar
 *
 * - Source of truth: client/src/i18n/locales/en.json
 * - de.json is hand-authored and never overwritten.
 * - Structure is preserved exactly; only human-readable string VALUES are
 *   translated. Keys, `category` enum values, placeholders ({{x}}) and the
 *   brand name "VideoStallone" are kept verbatim.
 * - Machine-translated files get a top-level "_machine": true marker so they
 *   can be spotted for human review.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = path.resolve(__dirname, "../client/src/i18n/locales");

const LMSTUDIO_URL = process.env.LMSTUDIO_URL || "http://localhost:1234/v1";
const LMSTUDIO_TOKEN = process.env.LMSTUDIO_TOKEN || "";
const LMSTUDIO_MODEL = process.env.LMSTUDIO_MODEL || "aya-expanse-8b-mlx";

// target code -> human description used in the prompt
const TARGETS = {
  sr: "Serbian using the LATIN script (latinica), NOT Cyrillic",
  fr: "French",
  es: "Spanish",
  pt: "Portuguese (European/Brazilian neutral)",
  ru: "Russian",
  zh: "Chinese (Simplified, 简体中文)",
  "zh-Hant": "Chinese (Traditional, 繁體中文)",
  hi: "Hindi (Devanagari script)",
  ar: "Arabic"
};

const BATCH_SIZE = 16;
const MAX_ATTEMPTS = 3;

// ---- flatten / inflate -------------------------------------------------

// Paths whose final segment is one of these are NOT translated (enum keys).
const SKIP_LEAF = new Set(["category", "_machine"]);

function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") {
      flatten(v, p, out);
    } else if (typeof v === "string") {
      const leaf = k;
      if (!SKIP_LEAF.has(leaf)) out[p] = v;
    }
  }
  return out;
}

function setPath(obj, dottedPath, value) {
  const parts = dottedPath.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

function deepClone(o) {
  return JSON.parse(JSON.stringify(o));
}

// ---- LM Studio call ----------------------------------------------------

function stripFences(text) {
  return text
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

async function callModel(payload, langDesc) {
  const system =
    "You are a professional software UI translator. You translate the VALUES of a JSON object into the target language. " +
    "Return ONLY a valid JSON object with EXACTLY the same keys and the translated string values — every key must be present. " +
    "Rules: keep placeholders such as {{count}} and {{date}} exactly as-is; never translate the brand name 'VideoStallone'; " +
    "keep it concise and natural for a UI; output JSON only, no comments, no markdown.";
  const user = `Target language: ${langDesc}.\nTranslate the values of this JSON object:\n${JSON.stringify(payload, null, 2)}`;

  const res = await fetch(`${LMSTUDIO_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LMSTUDIO_TOKEN}`
    },
    body: JSON.stringify({
      model: LMSTUDIO_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ],
      temperature: 0.1,
      max_tokens: 4000
    })
  });

  if (!res.ok) {
    throw new Error(`LM Studio ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content || "";
  const cleaned = stripFences(content);
  try {
    return JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) {
      try { return JSON.parse(m[0]); } catch { /* fall through */ }
    }
    return null;
  }
}

// Translate a batch, retrying for any keys the model missed or returned empty.
async function translateBatch(entries, langDesc) {
  const want = Object.fromEntries(entries);
  const collected = {};
  let remaining = { ...want };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const out = await callModel(remaining, langDesc);
    if (out && typeof out === "object") {
      for (const k of Object.keys(remaining)) {
        if (typeof out[k] === "string" && out[k].trim()) collected[k] = out[k];
      }
    }
    remaining = Object.fromEntries(
      Object.entries(want).filter(([k]) => !(k in collected))
    );
    if (Object.keys(remaining).length === 0) break;
  }

  // Single-key fallback: any key the batch could not produce is translated
  // on its own — a one-pair object is far more reliable to parse.
  const stillMissing = Object.entries(want).filter(([k]) => !(k in collected));
  for (const [k, v] of stillMissing) {
    const out = await callModel({ [k]: v }, langDesc);
    if (out && typeof out[k] === "string" && out[k].trim()) collected[k] = out[k];
  }

  return collected; // any remaining keys keep their English source
}

async function translateLanguage(code, source, flat) {
  const langDesc = TARGETS[code];
  const keys = Object.keys(flat);
  const result = deepClone(source);
  let translated = 0;
  let failed = 0;

  for (let i = 0; i < keys.length; i += BATCH_SIZE) {
    const slice = keys.slice(i, i + BATCH_SIZE).map((k) => [k, flat[k]]);
    const batchNo = Math.floor(i / BATCH_SIZE) + 1;
    const batchCount = Math.ceil(keys.length / BATCH_SIZE);
    process.stdout.write(`  [${code}] batch ${batchNo}/${batchCount} … `);
    try {
      const out = await translateBatch(slice, langDesc);
      for (const [k] of slice) {
        if (typeof out[k] === "string" && out[k].trim()) {
          setPath(result, k, out[k]);
          translated++;
        } else {
          failed++; // leave English value as fallback
        }
      }
      console.log("ok");
    } catch (err) {
      console.log(`FAIL (${err.message}) — keeping English for this batch`);
      failed += slice.length;
    }
  }

  result._machine = true;
  const outPath = path.join(LOCALES_DIR, `${code}.json`);
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2) + "\n");
  console.log(`  [${code}] → ${path.basename(outPath)} (${translated} translated, ${failed} fell back)\n`);
}

// ---- main --------------------------------------------------------------

async function main() {
  if (!LMSTUDIO_TOKEN) {
    console.error("Missing LMSTUDIO_TOKEN env var.");
    process.exit(1);
  }
  const source = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, "en.json"), "utf8"));
  const flat = flatten(source);
  console.log(`Source en.json: ${Object.keys(flat).length} strings`);
  console.log(`Model: ${LMSTUDIO_MODEL} @ ${LMSTUDIO_URL}\n`);

  const requested = process.argv.slice(2).filter((a) => TARGETS[a]);
  const codes = requested.length ? requested : Object.keys(TARGETS);

  for (const code of codes) {
    await translateLanguage(code, source, flat);
  }
  console.log("Done. Review machine-translated files (look for \"_machine\": true).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
