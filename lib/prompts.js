import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Bundled role prompts for the Project Manager mode.
 *
 * The nine Markdown files are shipped in `prompts/`. They are adapted for
 * runtime use here: relative documentation links and "load stage file" lines
 * are removed because those files are not part of an installed plugin, and
 * the configured project profile is appended separately.
 */

const PROMPT_FILES = {
  manager: "00-project-manager.md",
  intake: "01-intake-and-goal.md",
  plan: "02-plan-and-decompose.md",
  dispatch: "03-dispatch-brief.md",
  review: "04-review-and-accept.md",
  status: "05-status-budget-handoff.md",
  executor: "06-executor.md",
  reviewer: "07-reviewer.md",
  scout: "08-scout.md"
};

const DEFAULT_PROMPTS_DIR = fileURLToPath(new URL("../prompts/", import.meta.url));

export const CHILD_ROLES = ["executor", "reviewer", "scout"];

const FALLBACK_MANAGER = `You are the Project Manager for this project. You own the goal, the work plan, dispatch, acceptance, budget, and reporting. You do not write code, run builds or tests, or read large source files; delegate those to subagents. Every child brief must start with a ROLE line naming executor, reviewer, or scout.`;

const FALLBACK_CHILD = `You are a focused subagent. Follow the work package brief exactly, stay inside its allowed paths, run only its authorized verification, and return a compact report with files changed, commands, exit codes, and evidence. Stop and report if the brief is incomplete or you need an unauthorized path, credential, or scope change.`;

const STAGE_CHECKLIST = `## 阶段清单

1. **Intake**：复述目标，写 Goal / Scope / Non-goals / Done When；最多问 3 个用户决定型问题；仓库事实派 Scout。
2. **Plan**：拆成 3–7 个工作包；每个包一个 owner、一个交付、一个验收；标依赖、并行批次、模型档位和预算。
3. **Dispatch**：每个包一份自包含简报，第一行写角色标记（executor/reviewer/scout，见下方约定）；写清输入、边界、验收、停止条件和报告格式。
4. **Review**：用验收矩阵核对证据；高风险包交独立 Reviewer；同一相关失败最多两轮修复。
5. **Status / Handoff**：更新状态面板、预算、风险、决定；用完成状态收尾并给出恢复/回滚方式。`;

const DISPATCH_CONVENTION = `## 派发约定

派发前先查 idle child（\`list_agents\` 可用时）：同角色、相邻范围、仍可继续且上下文可接受的空闲 child 用 \`send_message\` 发 follow-up，否则用 \`subagent\` 新开。新子 Agent 简报必须包含：第一行角色标记（executor/reviewer/scout，见下方约定）；目标；最小上下文；允许/禁止路径；交付物；验收条件；已授权验证命令；停止条件；报告格式。子 Agent 看不到本对话，新孩子简报必须自包含。follow-up 简报只写上一包、新目标、增量上下文、边界、验收和报告格式；不要重复整份背景，也不要改变已有 child 的角色。`;

const CHILD_RUNTIME = `## Runtime

- 你是子 Agent（delegation depth > 0）；不要继续派生子 Agent。
- 严格按工作包简报执行；越界、缺输入、需要凭据或范围变化时停止并报告。
- 收到 follow-up 时把它当作新的工作包：复用已有上下文，不重做上一包，只做增量并报告增量；需要不同角色/模型/全新上下文时停止并报告。
- 返回紧凑报告：summary、files changed、命令与 exit code、证据、风险；不要粘贴完整日志或完整 diff。`;

const FALLBACK_PROJECT = {
  name: "",
  root: "",
  stack: "",
  verifyCommands: [],
  allowedPaths: [],
  forbiddenPaths: [],
  protectedCapabilities: [],
  conventions: [],
  humanValidation: [],
  notes: ""
};

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sanitizePrompt(text) {
  let result = text;
  // Relative docs links are not part of an installed plugin; keep the label.
  result = result.replace(/\[([^\]]+)\]\((?:\.\.?\/)[^)]*\)/g, "$1");
  // Remove trailing References/参考 sections: they point at files that are
  // not present in the plugin package and would invite dead reads.
  result = result.replace(/\n## (?:References|参考)[\s\S]*$/m, "");
  // The bundled prompt project tells the reader to load stage files; the
  // plugin injects the stages itself, so those instructions are misleading.
  result = result.replace(/^\s*-\s*加载\s*\[[^\]]+\]\([^)]*\)。?\s*$/gm, "");
  result = result.replace(/使用\s+03-dispatch-brief\.md/g, "使用下方的派发约定");
  return result.trim();
}

function loadOne(root, file) {
  try {
    return sanitizePrompt(readFileSync(join(root, file), "utf8"));
  } catch {
    return "";
  }
}

/**
 * Load the bundled role prompts, or a user-supplied prompt directory.
 * Missing files degrade to short built-in contracts rather than failing the
 * plugin load.
 */
export function loadPromptAssets(dir = "") {
  const root = typeof dir === "string" && dir.trim().length > 0
    ? resolve(dir.trim())
    : DEFAULT_PROMPTS_DIR;
  const assets = { sourceDir: root };
  for (const [key, file] of Object.entries(PROMPT_FILES)) {
    assets[key] = loadOne(root, file);
  }
  // A custom directory that lacks the manager prompt is treated as a broken
  // override; use the bundled copy rather than degrading to the short fallback.
  if (assets.manager.length === 0 && root !== DEFAULT_PROMPTS_DIR) {
    return loadPromptAssets("");
  }
  if (assets.manager.length === 0) assets.manager = FALLBACK_MANAGER;
  if (assets.executor.length === 0) assets.executor = FALLBACK_CHILD;
  if (assets.reviewer.length === 0) assets.reviewer = FALLBACK_CHILD;
  if (assets.scout.length === 0) assets.scout = FALLBACK_CHILD;
  return assets;
}

function asStringList(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string" && item.trim().length > 0)
    : [];
}

function renderProjectBrief(project, full) {
  const input = { ...FALLBACK_PROJECT, ...(project ?? {}) };
  const lines = [];
  if (input.name) lines.push(`- 项目：${input.name}`);
  if (input.root) lines.push(`- 根目录：${input.root}`);
  if (input.stack) lines.push(`- 技术栈：${input.stack}`);
  const verify = asStringList(input.verifyCommands);
  if (verify.length > 0) lines.push(`- 已授权验证命令：${verify.join("；")}`);
  const allowed = asStringList(input.allowedPaths);
  if (allowed.length > 0) lines.push(`- 允许路径：${allowed.join("；")}`);
  const forbidden = asStringList(input.forbiddenPaths);
  if (forbidden.length > 0) lines.push(`- 禁止路径/行为：${forbidden.join("；")}`);
  const protectedItems = asStringList(input.protectedCapabilities);
  if (protectedItems.length > 0) lines.push(`- Protected：${protectedItems.join("；")}`);
  const conventions = asStringList(input.conventions);
  if (conventions.length > 0) lines.push(`- 约定：${conventions.join("；")}`);
  if (full) {
    const human = asStringList(input.humanValidation);
    if (human.length > 0) lines.push(`- 人工验收：${human.join("；")}`);
    if (input.notes) lines.push(`- 备注：${input.notes}`);
  }
  if (lines.length === 0) return "";
  return `## 项目 Profile（由部署配置）\n\n${lines.join("\n")}`;
}

function renderRuntime(runtime) {
  const capabilities = runtime ?? {};
  const lines = ["## Runtime"];
  if (capabilities.todo === true) {
    lines.push("- todo_write 只写当前 turn 的 2–4 个可执行步骤，每轮重建；不要复制跨轮工作包列表、阶段或验收记录。");
  }
  lines.push("- 用 subagent 派发；它立即返回 child id 并在后台执行，完成通知才携带结果或失败诊断。`started subagent` 不是成功。");
  lines.push("- 目录、未知文件清单或项目 skill 的定位交给 Scout；子 Agent 有 glob/grep/pwsh，主 Agent 的 `read` 只用于已知路径。不要要求用户逐个提供文件名。");
  lines.push("- 项目约定、验证命令和路径以仓库中的 AGENTS.md / README / 项目 skill 为准；需要时自己用 `read` 查看，或派 Scout。不要要求用户把项目事实填成配置。");
  if (capabilities.childControl === true) {
    lines.push("- 派发前先 list_agents 查 idle 同角色 child；同项目/相邻范围、仍可继续、上下文可接受时优先用 send_message 发 follow-up，而不是新开。发送成功仍要等 completion notice；一个 child 同一时间只跑一个包。默认每个 child 最多 2 个 follow-up 或约 50% 上下文，超过后换新。");
  } else {
    lines.push("- 当前没有 list_agents/send_message；每个工作包用 subagent 新开，完成即结束。");
  }
  if (capabilities.statusCard === true) {
    lines.push("- 中间进度只调用 project_status_update 更新输入框上方的状态卡；不要输出 `## PM 状态`、工作包表格或重复汇报。状态卡负责跨 turn 的工作包/证据/验证/blocker；阶段变化或 child 完成时更新一次；首次给完整状态，后续可只传变化字段。有原生 goal 时不要重复同一句目标；完成后 phase=done、next 留空。最终交付时才发简短总结，详细内容看状态卡。");
  } else {
    lines.push("- 当前没有状态卡工具；状态汇报保持极简，只给结论、证据和下一步，不重复长文。");
  }
  if (capabilities.modelSelection === true) {
    lines.push("- `list_subagent_models` 可用时，先发现已授权路由；选子 Agent 时成对传 provider 和 model，必要时再传 reasoning_effort。");
  } else {
    lines.push("- 当前没有子 Agent 模型选择；不要传 provider/model/reasoning_effort，子 Agent 使用已配置的路由。");
  }
  if (capabilities.usage === true) {
    lines.push("- 需要看预算时调用 model_token_usage；它是进程级、跨会话累计，重启清零。");
  }
  return lines.join("\n");
}

function renderRoleConvention(roleMarker) {
  const raw = typeof roleMarker === "string" && roleMarker.trim().length > 0
    ? roleMarker.trim()
    : "ROLE";
  const marker = raw.replace(/:+$/, "") || "ROLE";
  return `## 子 Agent 角色约定

每份子 Agent 简报的第一行必须是 \`${marker}: executor\`、\`${marker}: reviewer\` 或 \`${marker}: scout\`。运行时按这一行注入对应的子 Agent 角色契约；不要使用其它角色名。`;
}

/**
 * Render the configured default child route for the main prompt.
 * @param subagent - provider, model, optional reasoningEffort.
 * @returns a Markdown section, always non-empty.
 */
function renderSubagentRoute(subagent, modelSelection) {
  const provider = typeof subagent?.provider === "string" ? subagent.provider.trim() : "";
  const model = typeof subagent?.model === "string" ? subagent.model.trim() : "";
  const effort = typeof subagent?.reasoningEffort === "string"
    ? subagent.reasoningEffort.trim()
    : "";
  const lines = ["## 子 Agent 默认路由", ""];
  if (provider.length > 0 && model.length > 0) {
    lines.push(`- provider: \`${provider}\``);
    lines.push(`- model: \`${model}\``);
    if (effort.length > 0) lines.push(`- reasoning_effort: \`${effort}\``);
    if (modelSelection === true) {
      lines.push(
        "- 分派子 Agent 时显式传入这些值；只有用户明确要求，或该路由不可用时才覆盖。"
      );
    } else {
      lines.push(
        "- 当前会话未开启模型选择；子 Agent 使用部署/父级默认路由。以上配置仅作为记录。"
      );
    }
  } else if (modelSelection === true) {
    lines.push(
      "- 未配置。使用 `list_subagent_models` 的授权路由，并在简报中显式指定 provider/model；没有授权路由时先问用户。"
    );
  } else {
    lines.push(
      "- 未配置。使用部署/父级默认路由；当前会话未开启模型选择，不要传 provider/model/reasoning_effort。"
    );
  }
  return lines.join("\n");
}

/**
 * Render the main (PM) system prompt.
 * @param assets - result of loadPromptAssets().
 * @param options - mode (compact|full), project, model notes, runtime flags.
 * @returns prompt text, or "" when mode is off.
 */
export function renderMainPrompt(assets, options = {}) {
  const mode = options.mode === "full" ? "full" : "compact";
  const parts = [];
  const manager = assets?.manager || FALLBACK_MANAGER;
  parts.push(manager);
  if (mode === "full") {
    for (const key of ["intake", "plan", "review", "status"]) {
      const text = assets?.[key];
      if (typeof text === "string" && text.length > 0) parts.push(text);
    }
    parts.push(DISPATCH_CONVENTION);
  } else {
    parts.push(STAGE_CHECKLIST);
    parts.push(DISPATCH_CONVENTION);
  }
  const brief = renderProjectBrief(options.project, true);
  if (brief) parts.push(brief);
  parts.push(renderRoleConvention(options.roleMarker));
  parts.push(renderSubagentRoute(options.subagent, options.modelSelection === true));
  parts.push(renderRuntime(options.runtime));
  if (options.modelSelection === true && typeof options.modelNotesText === "string" && options.modelNotesText.length > 0) {
    parts.push(options.modelNotesText);
  }
  return parts.filter((part) => typeof part === "string" && part.trim().length > 0).join("\n\n");
}

/**
 * Render one child role system prompt.
 * @param assets - result of loadPromptAssets().
 * @param options - role, project.
 * @returns prompt text.
 */
export function renderChildPrompt(assets, options = {}) {
  const role = CHILD_ROLES.includes(options.role) ? options.role : "executor";
  const roleText = assets?.[role] || FALLBACK_CHILD;
  const parts = [roleText];
  const brief = renderProjectBrief(options.project, false);
  if (brief) parts.push(brief);
  parts.push(CHILD_RUNTIME);
  return parts.filter((part) => typeof part === "string" && part.trim().length > 0).join("\n\n");
}

function messageText(message) {
  if (typeof message?.text === "string") return message.text;
  const content = message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block) => {
      if (typeof block === "string") return block;
      if (typeof block?.text === "string") return block.text;
      return "";
    })
    .filter((text) => text.length > 0)
    .join("\n");
}

/**
 * Read the child role marker from the first user message of a child session.
 * Falls back to the configured default when the marker or session API is
 * unavailable.
 */
export function readChildRole(agent, options = {}) {
  const fallback = CHILD_ROLES.includes(options.defaultRole) ? options.defaultRole : "executor";
  try {
    const messages = agent?.session?.deriveMessages?.();
    if (!Array.isArray(messages)) return fallback;
    const rawMarker = typeof options.roleMarker === "string" && options.roleMarker.trim().length > 0
      ? options.roleMarker.trim()
      : "ROLE";
    const marker = rawMarker.replace(/:+$/, "") || "ROLE";
    const pattern = new RegExp(`^\\s*${escapeRegExp(marker)}\\s*:\\s*(executor|reviewer|scout)\\b`, "im");
    // Dynamic runtime-context snapshots are user-role messages too. Scan every
    // user message in order and take the first role marker, so the task brief
    // is found even when a runtime snapshot precedes it.
    for (const message of messages) {
      if (message?.role !== "user") continue;
      const match = pattern.exec(messageText(message));
      if (match !== null) return match[1].toLowerCase();
    }
    return fallback;
  } catch {
    return fallback;
  }
}
