import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CHILD_ROLES,
  loadPromptAssets,
  readChildRole,
  renderChildPrompt,
  renderMainPrompt
} from "../lib/prompts.js";

function childWith(text, marker) {
  return {
    options: { subagentDepth: 1 },
    session: {
      header: { delegationDepth: 1 },
      deriveMessages: () => [{ role: "user", content: [{ type: "text", text }] }]
    }
  };
}

test("bundled prompts load and are adapted for runtime", () => {
  const assets = loadPromptAssets();
  assert.match(assets.manager, /Project Manager/);
  assert.match(assets.executor, /Executor/);
  assert.match(assets.reviewer, /Reviewer/);
  assert.match(assets.scout, /Scout/);
  assert.ok(assets.dispatch.includes("ROLE: {{ROLE}}"));
  for (const key of ["manager", "executor", "reviewer", "scout"]) {
    assert.doesNotMatch(assets[key], /\]\(\.\.\//, `${key} keeps a relative docs link`);
  }
});

test("a broken custom prompt dir falls back to bundled prompts", () => {
  const empty = mkdtempSync(join(tmpdir(), "dsh-project-lead-prompts-"));
  try {
    const assets = loadPromptAssets(empty);
    assert.match(assets.manager, /Project Manager/);
    assert.match(assets.executor, /Executor/);
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }
});

test("compact main prompt carries project profile and role convention", () => {
  const assets = loadPromptAssets();
  const prompt = renderMainPrompt(assets, {
    mode: "compact",
    project: {
      name: "demo",
      root: "/repo",
      stack: "Node",
      verifyCommands: ["npm test"],
      allowedPaths: ["src/**"],
      forbiddenPaths: [".env"],
      protectedCapabilities: ["billing"],
      conventions: ["small diffs"]
    },
    roleMarker: "ROLE",
    modelSelection: true,
    runtime: { todo: true, usage: true, modelSelection: true }
  });

  assert.match(prompt, /Project Manager/);
  assert.match(prompt, /demo/);
  assert.match(prompt, /npm test/);
  assert.match(prompt, /billing/);
  assert.match(prompt, /ROLE: executor/);
  assert.match(prompt, /list_subagent_models/);
  assert.match(prompt, /model_token_usage/);
  assert.doesNotMatch(prompt, /\{\{/);
  assert.doesNotMatch(prompt, /run_in_background/);
});

test("full main prompt includes stage contracts", () => {
  const assets = loadPromptAssets();
  const prompt = renderMainPrompt(assets, {
    mode: "full",
    project: {},
    runtime: { todo: true, usage: true, modelSelection: false }
  });
  assert.match(prompt, /Intake and Goal Contract/);
  assert.match(prompt, /Plan and Decompose/);
  assert.match(prompt, /Review and Accept/);
  assert.match(prompt, /Status, Budget/);
  assert.doesNotMatch(prompt, /\{\{/);
});

test("child prompt selects the role contract", () => {
  const assets = loadPromptAssets();
  const project = { name: "demo", verifyCommands: ["npm test"] };

  const executor = renderChildPrompt(assets, { role: "executor", project });
  assert.match(executor, /# Executor/);
  assert.match(executor, /demo/);
  assert.match(executor, /不要继续派生子 Agent/);
  assert.doesNotMatch(executor, /# Reviewer/);

  const reviewer = renderChildPrompt(assets, { role: "reviewer", project });
  assert.match(reviewer, /# Reviewer/);
  assert.match(reviewer, /finding/);

  const scout = renderChildPrompt(assets, { role: "scout", project });
  assert.match(scout, /# Scout/);
  assert.match(scout, /事实/);
});

test("readChildRole reads the first user message and falls back", () => {
  assert.equal(readChildRole(childWith("ROLE: reviewer\n\nReview this.")), "reviewer");
  assert.equal(readChildRole(childWith("role: scout\n\nFind it.")), "scout");
  assert.equal(readChildRole(childWith("ROLE: executor\n\nDo it.")), "executor");
  assert.equal(readChildRole(childWith("no marker here")), "executor");
  assert.equal(readChildRole(childWith("ROLE: reviewer"), { defaultRole: "scout" }), "reviewer");
  assert.equal(readChildRole(undefined), "executor");
  assert.equal(readChildRole(childWith("ROLE: unknown"), { defaultRole: "reviewer" }), "reviewer");
});

test("role marker is found after a runtime-context user message", () => {
  const agent = {
    session: {
      deriveMessages: () => [
        {
          role: "user",
          content: [{ type: "text", text: "Current runtime context. This snapshot supersedes earlier snapshots." }]
        },
        {
          role: "user",
          content: [{ type: "text", text: "ROLE: scout\nFind the entry point." }]
        }
      ]
    }
  };
  assert.equal(readChildRole(agent), "scout");
});

test("custom role marker is honored", () => {
  assert.equal(
    readChildRole(childWith("PERSONA: scout\nFind it."), { roleMarker: "PERSONA" }),
    "scout"
  );
  assert.equal(
    readChildRole(childWith("PERSONA: scout\nFind it."), { roleMarker: "PERSONA:" }),
    "scout"
  );
  const assets = loadPromptAssets();
  const prompt = renderMainPrompt(assets, {
    mode: "compact",
    roleMarker: "PERSONA:",
    project: {},
    runtime: {}
  });
  assert.match(prompt, /PERSONA: executor/);
  assert.doesNotMatch(prompt, /PERSONA::/);
});

test("role list is stable", () => {
  assert.deepEqual(CHILD_ROLES, ["executor", "reviewer", "scout"]);
});
