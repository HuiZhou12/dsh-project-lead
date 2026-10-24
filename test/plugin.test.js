import test from "node:test";
import assert from "node:assert/strict";

import { Config, apply, inject, name } from "../lib/index.js";

const TOP_LEVEL = {
  options: {},
  session: { header: { agentPreset: "pm" } }
};
const STANDARD_AGENT = {
  options: {},
  session: { header: { agentPreset: "standard" } }
};

function childAgent(text) {
  return {
    options: { subagentDepth: 1 },
    session: {
      header: { delegationDepth: 1 },
      deriveMessages: () => [{ role: "user", content: [{ type: "text", text }] }]
    }
  };
}

const CHILD = childAgent("ROLE: executor\n\nImplement the work package.");
const REVIEWER_CHILD = childAgent("ROLE: reviewer\n\nReview the result.");
const SCOUT_CHILD = childAgent("ROLE: scout\n\nFind the entry point.");

function createCtx(tools = ["subagent", "list_subagent_models"]) {
  const sections = [];
  const registered = [];
  const listeners = new Map();
  const visible = new Map(tools.map((tool) => [tool, { name: tool }]));
  return {
    sections,
    registered,
    listeners,
    on(event, handler, options) {
      listeners.set(event, { handler, options });
    },
    systemPrompt: {
      section(section) {
        sections.push(section);
      }
    },
    tools: {
      register(tool) {
        registered.push(tool);
      },
      get(toolName) {
        return visible.get(toolName);
      }
    }
  };
}

function setup(options = {}) {
  const ctx = createCtx(options.tools);
  apply(ctx, options.config ?? {});
  return ctx;
}

function sectionText(ctx, agent = TOP_LEVEL) {
  return ctx.sections[0].text({ agent, scope: agent });
}

function read(value) {
  return value !== null && value !== undefined && typeof value.get === "function" ? value.get() : value;
}

async function* chunkStream(chunks) {
  for (const chunk of chunks) yield chunk;
}

async function drain(iterable) {
  const chunks = [];
  for await (const chunk of iterable) chunks.push(chunk);
  return chunks;
}

function openStream(ctx, provider, model, chunks) {
  const listener = ctx.listeners.get("llm/stream");
  assert.ok(listener, "llm/stream listener was registered");
  assert.equal(listener.options?.global, true, "llm/stream listener must be global");
  return listener.handler({ provider, model }, () => chunkStream(chunks));
}

test("exports stable plugin metadata", () => {
  assert.equal(name, "project-lead");
  assert.deepEqual(inject, ["systemPrompt", "tools"]);
  assert.deepEqual(read(Config({}).modelNotes), {});
  assert.equal(read(Config({}).prompts).main, "compact");
  assert.equal(read(Config({}).prompts).childRoles, true);
  assert.equal(read(Config({}).prompts).pmPreset, "pm");
  assert.equal(read(Config({}).prompts).otherMain, "guidance");
  assert.deepEqual(read(Config({}).project).verifyCommands, []);
  assert.deepEqual(read(Config({}).subagent), {
    provider: "",
    model: "",
    reasoningEffort: ""
  });
  assert.equal(typeof Config({}).modelNotes.get, "function");
  assert.equal(typeof Config({}).project.get, "function");
  assert.equal(typeof Config({}).prompts.get, "function");
  assert.equal(typeof Config({}).subagent.get, "function");
});

test("registers the prompt section and usage tool without a settings service", () => {
  const ctx = setup();

  assert.equal(ctx.sections.length, 1);
  assert.equal(ctx.sections[0].name, "project-lead-orchestration");
  assert.equal(ctx.sections[0].order, 400);

  assert.equal(ctx.registered.length, 1);
  assert.equal(ctx.registered[0].name, "model_token_usage");
  assert.match(ctx.registered[0].description, /process-wide/);
  assert.match(ctx.registered[0].description, /not the built-in per-session token meter/);
});

test("compact PM prompt includes the configured project profile and role convention", () => {
  const ctx = setup({
    config: {
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
      prompts: { main: "compact" }
    }
  });
  const text = sectionText(ctx);
  assert.match(text, /Project Manager/);
  assert.match(text, /demo/);
  assert.match(text, /npm test/);
  assert.match(text, /billing/);
  assert.match(text, /ROLE: executor/);
  assert.match(text, /todo_write/);
  assert.match(text, /model_token_usage/);
  assert.doesNotMatch(text, /run_in_background/);
});

test("PM prompt includes the configured default child route", () => {
  const ctx = setup({
    config: {
      subagent: {
        provider: "commandcode",
        model: "deepseek/deepseek-v4.1-flash",
        reasoningEffort: "high"
      }
    }
  });
  const text = sectionText(ctx);
  assert.match(text, /子 Agent 默认路由/);
  assert.match(text, /commandcode/);
  assert.match(text, /deepseek\/deepseek-v4\.1-flash/);
  assert.match(text, /reasoning_effort: `high`/);
});

test("PM prompt is scoped to the configured preset", () => {
  const ctx = setup({
    config: { prompts: { main: "compact", pmPreset: "pm" } }
  });
  assert.match(sectionText(ctx), /Project Manager/);

  const standardText = sectionText(ctx, STANDARD_AGENT);
  assert.doesNotMatch(standardText, /Project Manager/);
  assert.match(standardText, /orchestrating agent/);

  const noPreset = { options: {}, session: { header: {} } };
  assert.doesNotMatch(sectionText(ctx, noPreset), /Project Manager/);

  const off = setup({
    config: { prompts: { main: "compact", pmPreset: "pm", otherMain: "off" } }
  });
  assert.equal(sectionText(off, STANDARD_AGENT), "");
});

test("an empty pmPreset makes the PM prompt apply to every top-level session", () => {
  const ctx = setup({
    config: { prompts: { main: "compact", pmPreset: "" } }
  });
  assert.match(sectionText(ctx, STANDARD_AGENT), /Project Manager/);
});

test("compact prompt uses the session cwd when project.root is empty", () => {
  const withCwd = {
    options: {},
    session: { header: { cwd: "/repo/from-session", agentPreset: "pm" } }
  };
  const ctx = setup({
    config: { project: { name: "demo" }, prompts: { main: "compact" } }
  });
  const text = sectionText(ctx, withCwd);
  assert.match(text, /\/repo\/from-session/);

  const configured = setup({
    config: {
      project: { name: "demo", root: "/configured/root" },
      prompts: { main: "compact" }
    }
  });
  const configuredText = sectionText(configured, withCwd);
  assert.match(configuredText, /\/configured\/root/);
  assert.doesNotMatch(configuredText, /\/repo\/from-session/);
});

test("compact prompt follows child model selection visibility", () => {
  const withSelection = setup({
    config: {
      prompts: { main: "compact" },
      modelNotes: {
        "glm/glm-4.6": {
          description: "Zhipu flagship",
          strengths: "reasoning, coding",
          weaknesses: "slower"
        }
      }
    }
  });
  const full = sectionText(withSelection);
  assert.match(full, /list_subagent_models/);
  assert.match(full, /provider 和 model/);
  assert.match(full, /glm\/glm-4\.6/);
  assert.match(full, /Zhipu flagship/);
  assert.match(full, /started subagent/);
  assert.doesNotMatch(full, /run_in_background/);

  const withoutSelection = setup({
    tools: ["subagent"],
    config: { prompts: { main: "compact" } }
  });
  const inherited = sectionText(withoutSelection);
  assert.doesNotMatch(inherited, /list_subagent_models/);
  assert.match(inherited, /没有子 Agent 模型选择/);
  assert.match(inherited, /已配置的路由/);
});

test("guidance mode keeps the legacy orchestration text", () => {
  const ctx = setup({ config: { prompts: { main: "guidance" } } });
  const text = sectionText(ctx);
  assert.match(text, /list_subagent_models/);
  assert.match(text, /provider and model together/);
  assert.match(text, /started subagent/);
  assert.match(text, /never treat it as task success/);
});

test("full mode includes stage contracts; off mode is silent", () => {
  const full = setup({ config: { prompts: { main: "full" } } });
  const fullText = sectionText(full);
  assert.match(fullText, /Intake and Goal Contract/);
  assert.match(fullText, /Review and Accept/);

  const off = setup({ config: { prompts: { main: "off" } } });
  assert.equal(sectionText(off), "");
});

test("children get their own role prompt, not the PM prompt", () => {
  const ctx = setup();
  const executor = sectionText(ctx, CHILD);
  assert.match(executor, /# Executor/);
  assert.doesNotMatch(executor, /Project Manager/);
  assert.match(executor, /不要继续派生子 Agent/);

  const reviewer = sectionText(ctx, REVIEWER_CHILD);
  assert.match(reviewer, /# Reviewer/);
  assert.match(reviewer, /finding/);

  const scout = sectionText(ctx, SCOUT_CHILD);
  assert.match(scout, /# Scout/);
  assert.match(scout, /事实/);
});

test("childRoles false disables child prompts; no subagent tool disables the main prompt", () => {
  const ctx = setup({ config: { prompts: { childRoles: false } } });
  assert.equal(sectionText(ctx, CHILD), "");
  assert.equal(sectionText(setup({ tools: [] })), "");
  assert.equal(ctx.sections[0].text({}), "");
});

test("usage is grouped per provider/model and counts one request per stream", async () => {
  const ctx = setup();

  await drain(openStream(ctx, "p1", "m1", [
    { type: "text-delta", index: 0, text: "hello" },
    { type: "usage", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } },
    {
      type: "usage",
      usage: {
        inputTokens: 10,
        outputTokens: 5,
        cacheReadTokens: 2,
        cacheWriteTokens: 1,
        reasoningTokens: 3,
        totalTokens: 18
      }
    }
  ]));
  await drain(openStream(ctx, "p2", "m2", [
    { type: "usage", usage: { inputTokens: 7, outputTokens: 4 } }
  ]));
  // Missing provider or model must not be coerced into a fake route.
  await drain(openStream(ctx, undefined, "m3", [
    { type: "usage", usage: { inputTokens: 99, outputTokens: 99 } }
  ]));
  await drain(openStream(ctx, "p4", "", [
    { type: "usage", usage: { inputTokens: 99, outputTokens: 99 } }
  ]));

  const output = await ctx.registered[0].execute({});
  assert.match(output, /process-wide/);
  assert.match(
    output,
    /p1\/m1: input 10, output 5, cache read 2, cache write 1, total 18, reasoning 3 \(subset of output\), 1 request\(s\), provider-reported total 18 across 1 request\(s\)/
  );
  assert.match(
    output,
    /p2\/m2: input 7, output 4, cache read 0, cache write 0, total 11, 1 request\(s\)/
  );
  assert.ok(output.indexOf("p1/m1") < output.indexOf("p2/m2"), "higher total sorts first");
  assert.doesNotMatch(output, /undefined\//);
  assert.doesNotMatch(output, /m3|p4/);
});

test("usage is committed when the consumer stops early", async () => {
  const ctx = setup();
  const iterable = openStream(ctx, "p", "m", [
    { type: "usage", usage: { inputTokens: 4, outputTokens: 2 } },
    { type: "text-delta", index: 0, text: "after-usage" }
  ]);

  for await (const chunk of iterable) {
    if (chunk.type === "usage") break;
  }

  const output = await ctx.registered[0].execute({});
  assert.match(output, /p\/m: input 4, output 2, cache read 0, cache write 0, total 6, 1 request\(s\)/);
});

test("usage tool reports an empty state before any usage arrives", async () => {
  const ctx = setup();
  const output = await ctx.registered[0].execute({});
  assert.match(output, /No records yet/);
});
