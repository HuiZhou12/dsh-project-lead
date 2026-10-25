#!/usr/bin/env node
/**
 * Repair sessions written by dsh-project-lead <= 0.6.1.
 *
 * Those versions appended a custom `project-lead/status` event to the session
 * log without the `ignorable: true` marker. A current harness refuses to open
 * a log containing an unknown required event, so the whole session becomes
 * unreadable after a restart.
 *
 * This script renames each such event to the plugin-record grammar
 * `plugin:project-lead/status` and marks it ignorable. The event sequence,
 * payload, and timestamp are unchanged. The original file is kept as a
 * timestamped `.bak-*` copy next to the log.
 *
 * Usage:
 *   node scripts/migrate-status-events.mjs --write [path ...]
 *
 * Without --write the script only reports what it would change. A path may be
 * a session `.jsonl.zstd` file or a directory that is scanned recursively.
 * With no path, `~/.dsh/sessions` is scanned.
 *
 * Node.js 22.15+ / 24+ is required for the built-in zstd codec.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";

const LEGACY_TYPE = "project-lead/status";
const PLUGIN_TYPE = "plugin:project-lead/status";
const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
const LOG_SUFFIX = ".jsonl.zstd";

function fail(message) {
  console.error(`error: ${message}`);
  process.exitCode = 1;
}

/**
 * Decode a JSONL zstd log. DSH writes one zstd frame per buffered batch, so
 * the file is a concatenation of frames; node:zlib only decodes the first one
 * from a single buffer. Split at frame magic and decode each frame. Every
 * original frame boundary is preserved on rewrite so the storage layout stays
 * as close as possible to what the writer produced.
 */
function decodeFrames(buffer) {
  const starts = [];
  let offset = 0;
  while ((offset = buffer.indexOf(ZSTD_MAGIC, offset)) !== -1) {
    starts.push(offset);
    offset += ZSTD_MAGIC.length;
  }
  if (starts.length === 0) throw new Error("file is not zstd-compressed");
  const frames = [];
  for (let index = 0; index < starts.length; index += 1) {
    const end = index + 1 < starts.length ? starts[index + 1] : buffer.length;
    try {
      frames.push(zlib.zstdDecompressSync(buffer.subarray(starts[index], end)).toString("utf8"));
    } catch (error) {
      throw new Error(`cannot decode zstd frame ${index + 1}/${starts.length}: ${error.message}`);
    }
  }
  return frames;
}

function decodeLog(buffer) {
  return decodeFrames(buffer).join("");
}

function encodeFrames(frames) {
  return Buffer.concat(frames.map((text) => zlib.zstdCompressSync(Buffer.from(text, "utf8"))));
}

function parseLines(text) {
  const lines = text.split("\n").filter((line) => line.trim().length > 0);
  return lines.map((line, index) => {
    try {
      return { line, index, value: JSON.parse(line) };
    } catch (error) {
      throw new Error(`invalid JSON on line ${index + 1}: ${error.message}`);
    }
  });
}

function countLegacy(lines) {
  return lines.filter(({ value }) => value?.type === LEGACY_TYPE).length;
}

function collectFiles(target) {
  if (!fs.existsSync(target)) return [];
  const stat = fs.statSync(target);
  if (stat.isFile()) return [target];
  if (!stat.isDirectory()) return [];
  const files = [];
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    const child = path.join(target, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(child));
    else if (entry.isFile() && entry.name.endsWith(LOG_SUFFIX)) files.push(child);
  }
  return files;
}

function backupPathFor(file) {
  const stamp = new Date().toISOString().replace(/[:.]/gu, "-");
  let candidate = `${file}.bak-${stamp}`;
  let suffix = 1;
  while (fs.existsSync(candidate)) {
    candidate = `${file}.bak-${stamp}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function migrateFile(file, write) {
  const original = fs.readFileSync(file);
  const frames = decodeFrames(original);
  const text = frames.join("");
  const lines = parseLines(text);
  const legacyCount = countLegacy(lines);
  if (legacyCount === 0) {
    console.log(`skip  ${file} (no ${LEGACY_TYPE} events)`);
    return 0;
  }
  const rewrittenLines = lines.map(({ line, value }) => {
    if (value?.type !== LEGACY_TYPE) return line;
    value.type = PLUGIN_TYPE;
    value.ignorable = true;
    return JSON.stringify(value);
  });

  // Every writer flush ends on a line boundary; keep the original frame
  // boundaries and only recompress each frame's own lines.
  const lastFrame = frames.length - 1;
  if (frames.some((frame, index) => index !== lastFrame && !frame.endsWith("\n"))) {
    throw new Error("frame boundaries split a JSONL line; refusing to rewrite");
  }
  const counts = frames.map((frame) => frame.split("\n").filter((line) => line.trim().length > 0).length);
  let cursor = 0;
  const rewrittenFrames = frames.map((frame, index) => {
    const count = counts[index];
    const part = rewrittenLines.slice(cursor, cursor + count);
    cursor += count;
    const trailing = index === lastFrame ? (text.endsWith("\n") ? "\n" : "") : "\n";
    return part.join("\n") + trailing;
  });
  if (cursor !== rewrittenLines.length) throw new Error("frame line distribution did not cover the log");

  const rewritten = rewrittenFrames.join("");
  // Prove the rewritten text is still a complete, parseable log before
  // touching the original.
  const checkLines = parseLines(rewritten);
  if (checkLines.length !== lines.length) throw new Error("line count changed while rewriting");
  if (countLegacy(checkLines) !== 0) throw new Error("legacy events remain after rewriting");
  if (checkLines.filter(({ value }) => value?.type === PLUGIN_TYPE).length !== legacyCount) {
    throw new Error("migrated event count differs from the original count");
  }

  if (!write) {
    console.log(`would migrate ${file}: ${legacyCount} event(s)`);
    return legacyCount;
  }

  const backup = backupPathFor(file);
  fs.copyFileSync(file, backup);
  const temp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temp, encodeFrames(rewrittenFrames), { flush: true });
  // Verify the compressed result before replacing the original.
  const verify = parseLines(decodeLog(fs.readFileSync(temp)));
  if (verify.length !== lines.length || countLegacy(verify) !== 0) {
    fs.rmSync(temp, { force: true });
    throw new Error("compressed verification failed; original left untouched");
  }
  try {
    fs.renameSync(temp, file);
  } catch {
    fs.rmSync(file, { force: true });
    fs.renameSync(temp, file);
  }
  console.log(`migrated ${file}: ${legacyCount} event(s); backup ${backup}`);
  return legacyCount;
}

const args = process.argv.slice(2);
const write = args.includes("--write");
const targets = args.filter((arg) => arg !== "--write");
if (targets.length === 0) targets.push(path.join(os.homedir(), ".dsh", "sessions"));

if (typeof zlib.zstdDecompressSync !== "function") {
  fail("Node.js 22.15+ or 24+ is required (node:zlib zstd support is missing)");
} else {
  let total = 0;
  let changed = 0;
  for (const target of targets) {
    const files = collectFiles(target);
    if (files.length === 0) {
      console.log(`skip  ${target} (no ${LOG_SUFFIX} files)`);
      continue;
    }
    for (const file of files) {
      try {
        const count = migrateFile(file, write);
        if (count > 0) {
          total += count;
          changed += 1;
        }
      } catch (error) {
        fail(`${file}: ${error.message}`);
      }
    }
  }
  console.log(write
    ? `done: migrated ${total} event(s) in ${changed} file(s)`
    : `done: would migrate ${total} event(s) in ${changed} file(s); rerun with --write to apply`);
}
