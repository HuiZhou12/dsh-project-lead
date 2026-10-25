import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const manifest = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8")
);

/** Parse a semver string into comparable parts. */
function parse(version) {
  const [core, prerelease] = version.split("-", 2);
  const [major, minor, patch] = core.split(".").map(Number);
  return {
    major,
    minor,
    patch,
    prerelease: prerelease === undefined ? [] : prerelease.split(".")
  };
}

/** Semver precedence, including prerelease identifiers. */
function compare(left, right) {
  for (const key of ["major", "minor", "patch"]) {
    if (left[key] !== right[key]) return left[key] < right[key] ? -1 : 1;
  }
  if (left.prerelease.length === 0 && right.prerelease.length === 0) return 0;
  if (left.prerelease.length === 0) return 1;
  if (right.prerelease.length === 0) return -1;
  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const a = left.prerelease[index];
    const b = right.prerelease[index];
    if (a === undefined) return -1;
    if (b === undefined) return 1;
    const aNumeric = /^[0-9]+$/.test(a);
    const bNumeric = /^[0-9]+$/.test(b);
    if (aNumeric && bNumeric) {
      if (Number(a) !== Number(b)) return Number(a) < Number(b) ? -1 : 1;
      continue;
    }
    if (aNumeric) return -1;
    if (bNumeric) return 1;
    if (a !== b) return a < b ? -1 : 1;
  }
  return 0;
}

/** Evaluate the simple comparator ranges used by this manifest. */
function satisfies(version, range) {
  return range
    .trim()
    .split(/\s+/)
    .every((comparator) => {
      const match = /^(>=|<=|>|<|=)?(.+)$/.exec(comparator);
      assert.ok(match, `unsupported comparator: ${comparator}`);
      const operator = match[1] ?? "=";
      const result = compare(parse(version), parse(match[2]));
      switch (operator) {
        case ">=": return result >= 0;
        case "<=": return result <= 0;
        case ">": return result > 0;
        case "<": return result < 0;
        case "=": return result === 0;
        default: return false;
      }
    });
}

const dshPeers = Object.entries(manifest.peerDependencies).filter(
  ([dependency]) =>
    dependency === "@deepseek-ai/dsh" ||
    dependency.startsWith("@deepseek-ai/dsh-")
);

test("the plugin declares the dsh services it actually uses", () => {
  assert.deepEqual(
    dshPeers.map(([dependency]) => dependency).sort(),
    [
      "@deepseek-ai/dsh-llm",
      "@deepseek-ai/dsh-system-prompt",
      "@deepseek-ai/dsh-tools"
    ]
  );
});

test("every dsh peer admits the verified harness and excludes 0.1.x/0.3.x", () => {
  assert.ok(dshPeers.length > 0);
  for (const [dependency, range] of dshPeers) {
    assert.equal(
      satisfies("0.2.1-rc.2", range),
      true,
      `${dependency} must admit the verified 0.2.1-rc.2`
    );
    assert.equal(
      satisfies("0.2.0", range),
      false,
      `${dependency} must exclude 0.2.0`
    );
    assert.equal(
      satisfies("0.1.2-rc.1", range),
      false,
      `${dependency} must exclude 0.1.x`
    );
    assert.equal(
      satisfies("0.3.0", range),
      false,
      `${dependency} must exclude 0.3.0`
    );
    assert.equal(
      satisfies("0.3.0-0", range),
      false,
      `${dependency} must exclude 0.3.0 prereleases`
    );
  }
});

test("cordis is aligned with the 0.2.1 line", () => {
  assert.equal(manifest.peerDependencies["@deepseek-ai/cordis"], "^4.0.5");
});

test("manifest remains a mount-only bundle with optional peers", () => {
  assert.equal(manifest.dsh?.bundle?.patch, "./cordis.patch.yml");
  for (const dependency of Object.keys(manifest.peerDependencies)) {
    assert.equal(
      manifest.peerDependenciesMeta?.[dependency]?.optional,
      true,
      `${dependency} must stay optional so the host supplies it`
    );
  }
});

test("no 0.1.x compatibility branch is advertised", () => {
  assert.equal(manifest.version, "0.6.2");
  assert.doesNotMatch(
    JSON.stringify(manifest.peerDependencies),
    /0\.1\./
  );
});

test("bundled role prompts are published with the package", () => {
  assert.ok(manifest.files.includes("prompts"));
  for (const file of [
    "00-project-manager.md",
    "01-intake-and-goal.md",
    "02-plan-and-decompose.md",
    "03-dispatch-brief.md",
    "04-review-and-accept.md",
    "05-status-budget-handoff.md",
    "06-executor.md",
    "07-reviewer.md",
    "08-scout.md"
  ]) {
    assert.ok(
      existsSync(new URL(`../prompts/${file}`, import.meta.url)),
      `missing bundled prompt ${file}`
    );
  }
});

test("client Settings-page and status-card modules are packaged", () => {
  assert.equal(manifest.exports["./client"], "./lib/client.js");
  assert.equal(manifest.dsh?.client?.platform, "web");
  assert.ok(
    manifest.dsh?.client?.inject?.includes("@deepseek-ai/dsh-client-ui-settings"),
    "client injects the settings UI service"
  );
  assert.ok(
    manifest.dsh?.client?.inject?.includes("@deepseek-ai/dsh-client-locale"),
    "client injects the locale service"
  );
  assert.ok(
    manifest.dsh?.client?.inject?.includes("@deepseek-ai/dsh-client-ui-conversation"),
    "client injects the conversation UI service"
  );
  const client = readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");
  assert.match(client, /__ModuleLoader__\.load/);
  assert.match(client, /settings\.section/);
  assert.match(client, /configForms/);
  assert.match(client, /SettingsForm/);
  assert.match(client, /SettingsValueField/);
  assert.match(client, /pl-subagent-model/);
  assert.match(client, /conversation\.input\.dock/);
  assert.match(client, /projectLeadStatus/);
  assert.match(client, /project-lead/);
});

test("PM preset example keeps read and removes write/edit/shell", () => {
  const text = readFileSync(
    new URL("../examples/pm-preset.patch.yml", import.meta.url),
    "utf8"
  );
  assert.match(text, /preset-pm/);
  assert.match(text, /read: true/);
  assert.match(text, /readImage: true/);
  assert.match(text, /write: false/);
  assert.match(text, /edit: false/);
  assert.match(text, /agentPreset: standard/);
  assert.doesNotMatch(text, /tool-pwsh/);
  assert.doesNotMatch(text, /tool-bash/);
  assert.doesNotMatch(text, /id: tool-fs-search/);
});

test("docs and examples do not advertise removed 0.1.x controls", () => {
  const files = [
    "README.md",
    "README.zh.md",
    "examples/cordis.patch.yml",
    "examples/settings.yaml",
    "lib/index.js"
  ];
  for (const file of files) {
    const text = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(
      text,
      /run_in_background/,
      `${file} must not advertise the removed delegation switch`
    );
    assert.doesNotMatch(
      text,
      /installSection/,
      `${file} must not advertise the removed settings API`
    );
  }
});

test("0.2.x example uses the current config entry ids", () => {
  const text = readFileSync(
    new URL("../examples/cordis.patch.yml", import.meta.url),
    "utf8"
  );
  for (const id of [
    "llm-pi-ai",
    "subagent-model-selection-settings",
    "tool-subagent",
    "project-lead"
  ]) {
    assert.match(text, new RegExp(`id: ${id}`), `example must configure ${id}`);
  }
});
