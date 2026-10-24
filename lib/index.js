import z from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";
import {
  loadPromptAssets,
  readChildRole,
  renderChildPrompt,
  renderMainPrompt
} from "./prompts.js";

/**
 * dsh-project-lead
 *
 * A DeepSeek Harness 0.2.x plugin that adds a Project Lead (Project Manager)
 * preset: the top-level agent plans, dispatches self-contained work packages,
 * reviews evidence, and reports, while delegated children get executor /
 * reviewer / scout contracts. Standard sessions keep their own tools.
 *
 * It also tracks per-(provider/model) token usage for the whole process.
 *
 * Runtime capabilities (all self-contained, none rely on patching harness
 * internals):
 *   1. llm/stream waterfall accounting of token usage per provider/model.
 *   2. A system-prompt section coaching top-level orchestrating agents how to
 *      delegate, using the user-supplied "model notes" (strengths / weaknesses)
 *      as the basis for route assignment.
 *   3. A `model_token_usage` tool exposing the accumulated process-wide usage.
 *
 * Configuration arrives through the plugin's own Config (the `project-lead`
 * profile row) and the Web Settings page served by `lib/client.js`.
 *
 * Verified against DeepSeek Harness 0.2.1-rc.2.
 */

const name = "project-lead";

/** Required services. */
const inject = ["systemPrompt", "tools"];

/** One model note: a short rationale for dispatching work to a route. */
const ModelNote = z.object({
  description: z.string().default(""),
  strengths: z.string().default(""),
  weaknesses: z.string().default("")
});

/**
 * Project facts rendered into the PM and child prompts. Empty fields are
 * omitted, so a user can start with only the values they actually know.
 */
const ProjectProfile = z.object({
  name: z.string().default(""),
  root: z.string().default(""),
  stack: z.string().default(""),
  verifyCommands: z.array(z.string()).default([]),
  allowedPaths: z.array(z.string()).default([]),
  forbiddenPaths: z.array(z.string()).default([]),
  protectedCapabilities: z.array(z.string()).default([]),
  conventions: z.array(z.string()).default([]),
  humanValidation: z.array(z.string()).default([]),
  notes: z.string().default("")
});

/**
 * Prompt mode:
 * - `compact`: bundled PM core + phase checklist + dispatch convention;
 * - `full`: PM core + intake/plan/review/status prompts;
 * - `guidance`: the previous lightweight orchestration guidance;
 * - `off`: no orchestration section.
 *
 * `compact` and `full` apply only to sessions using `pmPreset`; every other
 * preset gets `otherMain` (lightweight guidance by default), so a Standard
 * session for a small tool keeps its normal tools and behavior.
 */
const PromptConfig = z.object({
  main: z.union([
    z.const("guidance"),
    z.const("compact"),
    z.const("full"),
    z.const("off")
  ]).default("compact"),
  childRoles: z.boolean().default(true),
  defaultChildRole: z.union([
    z.const("executor"),
    z.const("reviewer"),
    z.const("scout")
  ]).default("executor"),
  roleMarker: z.string().default("ROLE"),
  dir: z.string().default(""),
  pmPreset: z.string().default("pm"),
  otherMain: z.union([
    z.const("guidance"),
    z.const("off")
  ]).default("guidance")
});

/** Default route the PM tells its children to use. */
const SubagentRoute = z.object({
  provider: z.string().default(""),
  model: z.string().default(""),
  reasoningEffort: z.string().default("")
});

/** Plugin-level config, supplied by the profile row's `config:`. */
const Config = z.object({
  modelNotes: z.dict(ModelNote).default({}).volatile(),
  project: ProjectProfile.default({}).volatile(),
  prompts: PromptConfig.default({}).volatile(),
  subagent: SubagentRoute.default({}).volatile()
});

/** Render model notes as a "model cheat-sheet" paragraph, if any are given. */
function renderModelNotes(modelNotes) {
  const notes = modelNotes ?? {};
  const lines = [];
  for (const [route, note] of Object.entries(notes)) {
    const desc = note.description ? ` — ${note.description}` : "";
    const strengths = note.strengths ? `strengths: ${note.strengths}` : "";
    const weaknesses = note.weaknesses ? `weaknesses: ${note.weaknesses}` : "";
    const trail = [strengths, weaknesses].filter(Boolean).join("; ");
    lines.push(`- ${route}${desc}${trail ? ` (${trail})` : ""}`);
  }
  if (lines.length === 0) return "";
  return `\n### Model cheat-sheet\n${lines.join("\n")}\n`;
}

/**
 * Read an agent's delegation depth. Absence means a top-level agent (depth 0).
 * Mirrors the harness's own depth rule: the persisted session header is
 * authoritative, while the runtime option may only deepen the count.
 */
function delegationDepthOf(agent) {
  try {
    const runtime = agent?.options?.subagentDepth;
    const persisted = agent?.session?.header?.delegationDepth;
    const depths = [runtime, persisted].filter(
      (value) => Number.isSafeInteger(value) && value > 0
    );
    return depths.length === 0 ? 0 : Math.max(...depths);
  } catch {
    return 0;
  }
}

/** Whether a tool is visible in one assembly scope. */
function hasVisibleTool(ctx, toolName, scope) {
  try {
    return ctx.tools.get(toolName, scope) !== undefined;
  } catch {
    return false;
  }
}

/**
 * Fill the project root from the session working directory when the user did
 * not configure one. This keeps the PM prompt project-aware without forcing a
 * profile-wide absolute path.
 */
function projectForAgent(project, agent) {
  const configured = project && typeof project === "object" ? project : {};
  if (typeof configured.root === "string" && configured.root.length > 0) {
    return configured;
  }
  const cwd = agent?.session?.header?.cwd;
  if (typeof cwd !== "string" || cwd.length === 0) return configured;
  return { ...configured, root: cwd };
}

/**
 * Coaching text for one prompt assembly.
 *
 * The section is registered globally, but it renders only for a top-level
 * agent that can actually see the `subagent` tool. Delegated children (depth
 * > 0) and agents without delegation tools get an empty section, so the text
 * cannot coach a child into re-decomposing its single focused task or into
 * calling a tool it does not have.
 *
 * @param modelNotes - per-route strengths/weaknesses from the plugin config.
 * @param capabilities - tools visible to this agent and its delegation depth.
 * @returns the guidance text, or "" when this agent should not orchestrate.
 */
function buildGuidance(modelNotes, capabilities) {
  if (!capabilities.delegates || capabilities.depth > 0) return "";

  const selection = capabilities.modelSelection
    ? `Call list_subagent_models to see the routes authorized for this session. With no arguments it lists providers; pass provider to list that provider's models; pass provider and model to inspect that model's reasoning efforts. Only routes in the authorization list can be selected.`
    : `Child model selection is not enabled in this session. The child uses the configured route; do not pass provider, model, or reasoning_effort.`;

  const routeChoice = capabilities.modelSelection
    ? ` Pass provider and model together to choose a route; reasoning_effort is optional and only for routes that advertise it.`
    : "";

  const configuredRoute = renderSubagentRouteLine(capabilities.subagent);

  return `You are the orchestrating agent for this session. Decompose only when a task genuinely contains independent parts or needs different expertise; otherwise do the work directly.

How to delegate:
1. Record the delegated parts with todo_write and state which parts you keep.
2. ${selection}
3. Choose the best-fit authorized route for each part; use the model cheat-sheet below when it is present.
4. Call subagent with a 3–5 word description and a self-contained prompt.${routeChoice}
5. Launch independent delegations together in one message. Every call returns \`started subagent <childId>\` immediately and runs in the background; there is no foreground/blocking switch. Continue with work that does not depend on that child.
6. A completion notice arrives when each child settles. It carries the child's final answer, or its failure diagnostics and any partial output. \`started subagent\` only acknowledges acceptance — never treat it as task success. If a child fails, handle the failure (retry, fall back, or report it).
7. When all delegated parts settle, synthesize the results and finish the task.

Rules:
- Children do not see this conversation; every child prompt must be complete and self-contained.
- Project conventions, commands, and paths come from AGENTS.md, README, and project skills; read them directly or delegate a Scout. Do not ask the user to fill a project profile.
- Parallelize independent parts; serialize only when a later part needs an earlier result.
- Complex reasoning, coding, and long-context work → the strongest authorized route; simple or high-volume work → the fastest/cheapest authorized route.
- Do not delegate the same work twice, and do not recursively delegate a delegated subtask.${configuredRoute}${renderModelNotes(modelNotes)}`;
}

/** One compact route line for the legacy orchestration guidance. */
function renderSubagentRouteLine(subagent) {
  const provider = typeof subagent?.provider === "string" ? subagent.provider.trim() : "";
  const model = typeof subagent?.model === "string" ? subagent.model.trim() : "";
  if (provider.length === 0 || model.length === 0) return "";
  const effort = typeof subagent?.reasoningEffort === "string"
    ? subagent.reasoningEffort.trim()
    : "";
  return `\n- Configured child route: provider=\`${provider}\`, model=\`${model}\`${effort.length > 0 ? `, reasoning_effort=\`${effort}\`` : ""}. Pass these explicitly; only override when the user asks or the route is unavailable.`;
}

/** A finite non-negative token count, or zero for a missing/invalid value. */
function tokenCount(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

/** Read a plain value or a schemastery volatile reference. */
function unwrap(value) {
  return value !== null && value !== undefined && typeof value.get === "function"
    ? value.get()
    : value;
}

/**
 * Process-wide usage accumulated per provider/model. One stream contributes at
 * most one request; the last usage chunk of that stream is authoritative, so a
 * provider that emits intermediate usage samples cannot inflate the counts.
 */
function createUsageStore() {
  const byRoute = new Map();

  function record(provider, model, usage) {
    if (usage === null || typeof usage !== "object") return;
    const key = `${provider}\u0000${model}`;
    let entry = byRoute.get(key);
    if (entry === void 0) {
      entry = {
        provider,
        model,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        reasoningTokens: 0,
        reportedTotalTokens: 0,
        reportedTotalRequests: 0,
        requests: 0
      };
      byRoute.set(key, entry);
    }
    entry.inputTokens += tokenCount(usage.inputTokens);
    entry.outputTokens += tokenCount(usage.outputTokens);
    entry.cacheReadTokens += tokenCount(usage.cacheReadTokens);
    entry.cacheWriteTokens += tokenCount(usage.cacheWriteTokens);
    entry.reasoningTokens += tokenCount(usage.reasoningTokens);
    entry.requests += 1;
    if (typeof usage.totalTokens === "number") {
      entry.reportedTotalTokens += tokenCount(usage.totalTokens);
      entry.reportedTotalRequests += 1;
    }
  }

  function rows() {
    return [...byRoute.values()]
      .map((entry) => ({
        ...entry,
        totalTokens:
          entry.inputTokens +
          entry.outputTokens +
          entry.cacheReadTokens +
          entry.cacheWriteTokens
      }))
      .sort(
        (a, b) =>
          b.totalTokens - a.totalTokens ||
          b.reportedTotalTokens - a.reportedTotalTokens ||
          a.provider.localeCompare(b.provider) ||
          a.model.localeCompare(b.model)
      );
  }

  return { record, rows };
}

function apply(ctx, config) {
  const usage = createUsageStore();
  const promptConfig = unwrap(config?.prompts) ?? {};
  const project = unwrap(config?.project) ?? {};
  const assets = loadPromptAssets(promptConfig.dir);

  // llm/stream is the waterfall every model call passes through. Wrapping
  // next() lets us account usage chunks per provider/model. global: true so we
  // observe every model call (including sub-agents) regardless of realm.
  //
  // Missing provider/model is never coerced into a fake route: such a stream
  // simply passes through unrecorded, so unrelated calls cannot be merged.
  ctx.on("llm/stream", (options, next) => {
    const provider = options?.provider;
    const model = options?.model;
    if (
      typeof provider !== "string" ||
      provider.length === 0 ||
      typeof model !== "string" ||
      model.length === 0
    ) {
      return next();
    }
    return (async function* () {
      let lastUsage;
      try {
        for await (const chunk of next()) {
          if (chunk?.type === "usage" && chunk.usage !== undefined) {
            lastUsage = chunk.usage;
          }
          yield chunk;
        }
      } finally {
        // Commit once per stream, even when the consumer stops early. This
        // keeps `requests` at one per usage-bearing model call.
        if (lastUsage !== undefined) usage.record(provider, model, lastUsage);
      }
    })();
  }, { global: true });

  function currentModelNotes() {
    const value = unwrap(config?.modelNotes);
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function currentSubagentRoute() {
    const value = unwrap(config?.subagent);
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  /**
   * Resolve the live agent preset. The session header keeps the preset a
   * session was created with; selecting another preset later appends an
   * `agent-preset/selected` event and updates the `agentPreset` projection.
   * Prefer that projection so the PM prompt follows a live preset switch.
   */
  function activeAgentPreset(agent) {
    try {
      const projections = typeof ctx.get === "function" ? ctx.get("sessionProjections") : undefined;
      const state = projections?.stateOf?.(agent?.session, "agentPreset");
      if (typeof state === "string") return state;
    } catch {
      // Older compositions may not expose session projections; fall back.
    }
    return agent?.session?.header?.agentPreset;
  }

  // ── Orchestration and child-role prompts ─────────────────────────────────
  // One global section renders differently by delegation depth:
  // - top-level agent in the configured PM preset -> Project Manager prompt;
  // - other top-level presets -> lightweight guidance (or off);
  // - delegated child -> its executor/reviewer/scout contract.
  // The PM prompt is deliberately preset-scoped: a Standard session kept for
  // a small tool must not be told to stop using its code tools.
  // Order 400 keeps the text near the plan/tool guidance without taking a
  // first-party slot.
  ctx.systemPrompt.section({
    name: "project-lead-orchestration",
    order: 400,
    text: (context) => {
      const agent = context?.agent;
      if (agent === undefined) return "";
      const scope = context?.scope ?? agent;
      const depth = delegationDepthOf(agent);
      const delegates = hasVisibleTool(ctx, "subagent", scope);
      const projectView = projectForAgent(project, agent);

      if (depth > 0) {
        if (promptConfig.childRoles === false) return "";
        const role = readChildRole(agent, {
          defaultRole: promptConfig.defaultChildRole,
          roleMarker: promptConfig.roleMarker
        });
        return renderChildPrompt(assets, { role, project: projectView });
      }

      if (!delegates) return "";
      const mode = promptConfig.main ?? "compact";
      if (mode === "off") return "";
      const modelSelection = hasVisibleTool(ctx, "list_subagent_models", scope);
      const subagentRoute = currentSubagentRoute();
      const legacy = () =>
        buildGuidance(currentModelNotes(), {
          delegates,
          modelSelection,
          depth,
          subagent: subagentRoute
        });
      if (mode === "guidance") return legacy();

      const pmPreset = typeof promptConfig.pmPreset === "string"
        ? promptConfig.pmPreset
        : "pm";
      const presetId = activeAgentPreset(agent);
      const isPmSession = pmPreset.length === 0 || presetId === pmPreset;
      if (!isPmSession) {
        return promptConfig.otherMain === "off" ? "" : legacy();
      }

      return renderMainPrompt(assets, {
        mode: mode === "full" ? "full" : "compact",
        project: projectView,
        roleMarker: promptConfig.roleMarker,
        modelSelection,
        subagent: subagentRoute,
        modelNotesText: modelSelection ? renderModelNotes(currentModelNotes()) : "",
        runtime: {
          todo: hasVisibleTool(ctx, "todo_write", scope),
          usage: hasVisibleTool(ctx, "model_token_usage", scope),
          modelSelection
        }
      });
    }
  });

  // ── Process-wide per-model token usage tool ───────────────────────────────
  ctx.tools.register(defineTool({
    name: "model_token_usage",
    description: "Report process-wide token usage per model (provider/model) since this plugin process started, across every session and sub-agent: input, output, cache read/write, reasoning, and request counts, sorted by total usage descending. This is deliberately not the built-in per-session token meter. One request is counted per usage-bearing model stream, and the last usage chunk of that stream wins.",
    parameters: {},
    output: {
      schema: { type: "string" },
      render: (_args, result) => [{ type: "text", text: result }]
    },
    isConcurrencySafe: () => true,
    execute() {
      const rows = usage.rows();
      if (rows.length === 0) {
        return "No records yet: no model call has returned usage since this plugin loaded.";
      }
      const lines = [
        "Per-model token usage (process-wide, since this process started; includes every session and sub-agent):",
        ""
      ];
      for (const row of rows) {
        const reasoning = row.reasoningTokens > 0
          ? `, reasoning ${row.reasoningTokens} (subset of output)`
          : "";
        const reported = row.reportedTotalRequests > 0
          ? `, provider-reported total ${row.reportedTotalTokens} across ${row.reportedTotalRequests} request(s)`
          : "";
        lines.push(
          `- ${row.provider}/${row.model}: input ${row.inputTokens}, output ${row.outputTokens}, cache read ${row.cacheReadTokens}, cache write ${row.cacheWriteTokens}, total ${row.totalTokens}${reasoning}, ${row.requests} request(s)${reported}`
        );
      }
      lines.push(
        "",
        "total = input + output + cache read + cache write; reasoning is a subset of output and is not added again. Provider-reported totals are shown separately and are not mixed into the computed total."
      );
      return lines.join("\n");
    }
  }));
}

export { Config, apply, inject, name };
