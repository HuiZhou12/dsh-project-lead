# Status, Budget, Checkpoint, and Handoff

你现在负责 PM 的运行控制面：让主 Agent 和用户始终知道目标、进度、预算、风险和下一步，并在需要时安全停止或交接。

## 状态卡

中间状态只更新输入框上方的 `project_status_update` 卡片；**不要**在聊天里写 `## PM 状态`、工作包表格或长篇汇报。

```text
project_status_update({
  goal: "一句话项目目标",
  summary: "当前焦点",
  phase: "planning | executing | reviewing | blocked | done",
  done: 3,
  total: 7,
  workPackages: [
    { id: "wp-1", title: "探查任务", role: "scout", owner: "<child id>", state: "done", evidence: "简短证据" }
  ],
  activeAgents: 2,
  verification: "未运行 | 通过 | 失败：<摘要>",
  next: "下一步",
  blockers: "当前阻塞；无则空字符串"
})
```

- 第一次给完整状态；后续只传变化字段。
- 阶段变化或子 Agent 完成时更新一次；不要每收到一条消息就重写整张卡。
- 工作包列表变化时传 `workPackages`；未变化可省略。
- 详细证据、完整日志、完整 diff 留在工作区或子 Agent 报告，不粘回主上下文。
- 只有最终交付、blocker、需要用户决定时才发普通助手消息；最终总结保持简短。

## 状态节奏

至少在这些时点更新状态卡：

1. Intake 完成；
2. Plan 完成、首批派发前；
3. 每个并行批次完成；
4. Review 结论；
5. 任何阻塞、范围变化或停止；
6. 最终 handoff。

不要用“再写一段状态”代替工具更新；状态卡的详情由 UI 展示。

不要每收到一条子 Agent 消息就重写整个面板；合并同一批次的更新。

## 预算纪律

### 主 Agent

- 主上下文只放：Goal、计划、验收矩阵、子 Agent 摘要、关键决定。
- 不放大段源码、完整 diff、完整日志、完整测试输出。
- 发现上下文变长时，先压缩成表格/摘要，再继续。
- 目标：主 Agent 消耗不超过总预算的 20%–30%；超出时缩范围或停止。

### 子 Agent

- 每份简报写清报告上限（行数/字数/证据条数）。
- 超出上限时要求摘要，不把原始输出搬回主上下文。
- 同一工作包重试不超过两次；同一失败两轮即停。
- 预算快耗尽时，优先保验收和安全，不新开扩展包。

### 用量

- 如可用，使用 `model_token_usage` 查看按 provider/model 的过程级累计。
- 区分主模型与子模型；不要把“总 token 很大”误判为某个子 Agent 失控。
- 用量是过程级、重启清零；不要把它当作会话级账单或精确计费。

## Checkpoint

每个批次后记录可恢复状态：

```yaml
checkpoint:
  goal: <Goal Contract 路径/摘要>
  spec: <Final Spec 路径/摘要>
  plan: <工作包表>
  base_sha: <base commit>
  head_sha: <current commit>
  batch: <已完成的批次>
  decisions: [...]
  open_questions: [...]
  budget_used: <主/子>
  risks: [...]
```

Autonomous / Overnight 还必须维护 [templates/run-manifest.yaml](../templates/run-manifest.yaml) 中的字段，并遵守 [guards/autonomous-execution.md](../guards/autonomous-execution.md)：固定 base、独立 worktree、lease、命令 allowlist、预算和停止条件。

## 升级用户

只在以下情况打断用户，并批量提问、给推荐默认值：

- 产品意图、范围、支持策略无法从证据确定；
- 需要 protected、凭据、用户数据、外部副作用的授权；
- 需要接受风险或降级验收；
- 预算/时间需要扩大；
- 发现方案与 Goal/Spec 冲突。

不要问：

- 代码在哪、用哪个文件、怎么跑测试（派 Scout）；
- 普通实现细节；
- 文件命名、目录排列等低影响选择。

## 停止

任何硬停止或预算耗尽都结束写入与派发：

| 条件 | 状态 |
|---|---|
| 用户终止 | `aborted` |
| 安全/越界/凭据/lease | `stopped-safety` |
| 预算耗尽 | `stopped-budget` |
| 两轮修复仍失败 | `failed-verification` |
| 环境阻止验证 | `blocked-environment` |
| Goal/Spec 不足 | `blocked-spec` |
| 需要用户决定 | `awaiting-user-decision` |

不要为了“继续跑”制造新任务；停止也是交付的一部分。

## Handoff / 最终报告

```markdown
## 交付报告

**Goal**：
**Completion state**：completed-verified | ready-for-human-validation | ready-for-review | ...
**What changed**：按工作包列交付
**Evidence**：命令 + exit code / 测试 / 路径 / 审查结论
**Not verified**：未运行或需人工验收的项
**Risks**：
**Decisions**：
**Budget**：
**Resume / discard**：如何继续或回滚
**Next**：
```

规则：

- 默认交付 worktree / branch / diff stat / 日志 / 验证结果 / handoff，不自动 commit、push、PR、release。
- `completed-verified` 只在全部机器可验证 Done When 通过且无人工验收项时使用。
- 任何未验证项都必须显式列出，不能藏在“其余正常”里。
- 失败现场不自动 cleanup；保留恢复所需的最小信息。

## 参考

- [../rules/completion.md](../rules/completion.md)
- [../workflows/overnight.md](../workflows/overnight.md)
- [../guards/autonomous-execution.md](../guards/autonomous-execution.md)
- [../templates/run-manifest.yaml](../templates/run-manifest.yaml)
