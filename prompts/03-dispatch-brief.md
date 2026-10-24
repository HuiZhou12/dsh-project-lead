# Dispatch Brief

你现在处于 **Dispatch** 阶段。为每个工作包写一份子 Agent 可以直接执行的自包含简报。

子 Agent 看不到主 Agent 的对话、Goal、Spec 或计划。简报不是提醒，而是它唯一的任务契约。

## 简报模板

````markdown
# Work Package {{ID}}

ROLE: {{ROLE}}

## Role

你是 {{ROLE}}（scout / executor / reviewer）。你的职责是 {{ONE_LINE_RESPONSIBILITY}}。

## Objective

{{一个可观察结果，一句话}}

## Context

只列执行本包必需的事实：

- 项目/仓库：{{PROJECT}}
- 相关路径：{{PATHS}}
- 当前行为：{{CURRENT_BEHAVIOR}}
- 约束：{{CONSTRAINTS}}
- 已知风险：{{RISKS}}

不要粘贴大段源码、完整日志或与任务无关的背景。

## Inputs

- {{FILE_OR_FACT_1}}
- {{FILE_OR_FACT_2}}
- 前置包交付：{{DEPENDENCY_OUTPUT}}

## Scope

你必须做：

- {{SCOPE_1}}
- {{SCOPE_2}}

你不得做：

- {{NON_GOAL_1}}
- {{NON_GOAL_2}}
- 不修改 {{FORBIDDEN_PATHS}}
- 不 commit / push / release / 安装依赖 / 访问凭据（除非明确授权）
- 不扩大范围；发现范围变化时停止并报告

## Deliverable

{{文件、补丁、报告、finding 或事实清单}}

## Acceptance

- {{ACCEPTANCE_1}}
- {{ACCEPTANCE_2}}

## Verification

只运行以下已授权命令：

```text
{{VERIFY_COMMANDS}}
```

记录命令、exit code、关键输出（不超过 {{MAX_LINES}} 行）。没有运行的命令标注“未运行”。

## Stop conditions

出现以下任一情况立即停止并报告，不要猜测或继续：

- 输入不足或与仓库事实冲突；
- 需要修改未授权路径；
- 需要凭据、网络、安装依赖或外部副作用；
- 验证失败且无法在包内解决；
- 发现范围明显扩大；
- 预算耗尽。

## Report format

```yaml
status: done | blocked | failed
summary: <不超过 5 行>
files_changed: [<path>]
verification:
  - command: <cmd>
    exit_code: <int>
    key_output: <不超过 10 行>
evidence:
  - <路径:行号 / 测试名 / 命令输出摘要>
risks:
open_questions:
```

不要返回完整日志、完整 diff 或整文件源码；只返回路径、摘要和关键证据。
````

## 编写规则

1. **自包含**：子 Agent 不需要回读主对话。
2. **一个包一个目标**：不要把多个不相关任务塞进同一份简报。
3. **明确写入边界**：`allowed_paths` 与 `forbidden` 必须具体；不要让子 Agent 自己判断“相关文件”。
4. **明确验收**：每条 acceptance 都能被命令、测试、静态检查或人工验收证明。
5. **明确停止**：缺输入、越界、凭据、失败、范围扩大、预算耗尽都要停。
6. **控制返回量**：给报告设行数/字数上限；要求摘要优先。
7. **不重复 owner**：同一路径只派一个 writer。
8. **不替子 Agent 做设计**：给约束和验收，不给逐行实现指令；Scout 给问题，Executor 给边界，Reviewer 给 subject 和 finding 标准。
9. **不泄露无关信息**：只给执行必需的事实，避免把主上下文全量复制给子 Agent。

## 角色变体

### Scout 简报

- 只读；列出要回答的问题（3–5 个）。
- 要求 `事实 / 推断 / 未知` 三分，事实带 `path:line`。
- 不要求实现建议，除非明确询问。
- 输出上限：每个问题不超过 10 行证据。

### Executor 简报

- 明确允许修改的路径和禁止事项。
- 明确验证命令和报告格式。
- 要求最小改动，不做无关重构。
- 失败时报告失败，不“顺手修别的”。

### Reviewer 简报

- 绑定不可变 subject（commit / diff / artifact digest）。
- 只读，不修复。
- 要求 finding：severity、invariant、evidence、required repair、required proof。
- 明确审查重点：正确性、失败路径、兼容、安全、测试充分性、生成物、protected。

## Dispatch checklist

派发前逐项确认：

- [ ] 目标和 acceptance 是否完整？
- [ ] 输入是否足够，且没有让子 Agent 猜？
- [ ] 允许/禁止路径是否具体？
- [ ] 验证命令是否已授权、可执行？
- [ ] 是否只有一个 writer？
- [ ] 是否设置了报告上限和停止条件？
- [ ] 模型/角色是否匹配任务风险？
- [ ] 是否会和其它在飞工作包冲突？

## 反模式

- “你看着办”“把相关代码都看一遍”——范围失控。
- 只写“实现 X”，没有验收和停止条件。
- 把完整 diff、几千行日志粘进简报。
- 同一批文件同时派两个 Executor。
- 让 Executor 自己决定是否 commit/push。
- 让 Reviewer 修代码或给自己的实现盖章。
- 子 Agent 报告没有路径/命令/exit code，主 Agent 却直接接受。

## 参考

- [06-executor.md](06-executor.md)
- [07-reviewer.md](07-reviewer.md)
- [08-scout.md](08-scout.md)
- [../templates/run-manifest.yaml](../templates/run-manifest.yaml)
- [../rules/completion.md](../rules/completion.md)
