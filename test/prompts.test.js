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
  assert.ok(assets.dispatch.includes("ROLE: {{ROLE}}"));
  for (const key of ["manager", "executor", "reviewer"]) {
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

  // The scout role was removed (superagent alignment): unknown or legacy
  // markers degrade to the executor contract, which now owns exploration.
  const legacyScout = renderChildPrompt(assets, { role: "scout", project });
  assert.match(legacyScout, /# Executor/);
  assert.match(legacyScout, /Explore-type packages/);
});

test("readChildRole reads the first user message and falls back", () => {
  assert.equal(readChildRole(childWith("ROLE: reviewer\n\nReview this.")), "reviewer");
  assert.equal(readChildRole(childWith("role: scout\n\nFind it.")), "executor");
  assert.equal(readChildRole(childWith("ROLE: executor\n\nDo it.")), "executor");
  assert.equal(readChildRole(childWith("no marker here")), "executor");
  assert.equal(readChildRole(childWith("ROLE: reviewer"), { defaultRole: "executor" }), "reviewer");
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
          content: [{ type: "text", text: "ROLE: reviewer\nReview the entry point." }]
        }
      ]
    }
  };
  assert.equal(readChildRole(agent), "reviewer");
});

test("custom role marker is honored", () => {
  assert.equal(
    readChildRole(childWith("PERSONA: reviewer\nReview it."), { roleMarker: "PERSONA" }),
    "reviewer"
  );
  assert.equal(
    readChildRole(childWith("PERSONA: reviewer\nReview it."), { roleMarker: "PERSONA:" }),
    "reviewer"
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
  assert.deepEqual(CHILD_ROLES, ["executor", "reviewer"]);
});

test("bundled prompts keep their required rule contracts", () => {
  const assets = loadPromptAssets();
  // Each entry is a rule that must never silently drift out of the bundled
  // text; removing or rewording one should fail this test on purpose.
  const contracts = [
    {
      name: "manager",
      rules: [
        /不写、不改任何实现代码/,
        /不把子 Agent 的/,
        /当前 turn/,
        /project_status_update/,
        /question/,
        /批最多并行 2 个/,
        /不要用 sleep、轮询/,
        /worktree/,
        /send_message/,
        /同一批文件只允许一个 writer/
      ]
    },
    {
      name: "status",
      rules: [/question/, /phase: "done"/, /状态节奏/]
    },
    {
      name: "executor",
      rules: [
        /不派发子 Agent/,
        /files_changed/,
        /两轮/,
        /Explore-type packages/,
        /path:line/,
        /≤6 个工具调用/
      ]
    },
    {
      name: "reviewer",
      rules: [/finding/, /fresh reviewer/, /blocker/]
    }
  ];
  for (const { name, rules } of contracts) {
    for (const rule of rules) {
      assert.match(assets[name], rule, `${name} prompt must keep the rule ${rule}`);
    }
  }
});

test("prompt sizes stay within the model-surface budget", () => {
  const assets = loadPromptAssets();
  const project = {
    name: "demo",
    root: "/repo",
    stack: "Node",
    verifyCommands: ["npm test"],
    allowedPaths: ["src/**"],
    forbiddenPaths: [".env"],
    protectedCapabilities: ["billing"],
    conventions: ["small diffs"],
    humanValidation: ["verify the Web status card"],
    deliveryRequirements: ["每包 diff 不超过 300 行", "高风险包必须独立 reviewer"],
    notes: "Additional project context."
  };
  const runtime = { todo: true, usage: true, modelSelection: true, childControl: true, statusCard: true, shell: true };

  // Budgets guard against prompt creep: every bundled section, capability
  // line, and future addition must still fit what the model reads per role.
  // Measured 2026-11: compact PM 8.4k, full PM 19.8k, children 2.3-2.9k chars.
  const pmCompact = renderMainPrompt(assets, { mode: "compact", project, runtime, modelSelection: true });
  assert.ok(pmCompact.length <= 9000, `compact PM prompt is ${pmCompact.length} chars; budget 9000`);
  assert.match(pmCompact, /交付要求/);
  // The worktree procedure is capability-gated: the operational detail only
  // rides along when the PM actually has a shell; the bundled text itself
  // carries the branch wording for both cases.
  assert.match(pmCompact, /git worktree remove \.worktrees/);
  const pmCompactNoShell = renderMainPrompt(assets, { mode: "compact", project, runtime: { ...runtime, shell: false }, modelSelection: true });
  assert.doesNotMatch(pmCompactNoShell, /git worktree remove \.worktrees/);
  const pmFull = renderMainPrompt(assets, { mode: "full", project, runtime, modelSelection: true });
  assert.ok(pmFull.length <= 22000, `full PM prompt is ${pmFull.length} chars; budget 22000`);
  for (const role of CHILD_ROLES) {
    const prompt = renderChildPrompt(assets, { role, project });
    assert.ok(prompt.length <= 3500, `${role} prompt is ${prompt.length} chars; budget 3500`);
  }
});
