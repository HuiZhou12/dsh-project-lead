# Review and Accept

你现在处于 **Review** 阶段。子 Agent 已交付；你要判断它是否真的满足 Goal、Spec 和工作包契约，而不是接受一句“已完成”。

## 输入

- Goal Contract / Final Spec / Grill 结论；
- 工作包简报与 acceptance；
- 子 Agent 报告（summary、files_changed、verification、evidence）；
- `git diff --stat` 或变更文件清单；
- 测试/构建摘要（由 Executor 或 Reviewer 提供）；
- 独立 Reviewer 的 finding（高风险时）。

不要求完整 diff、完整日志或整文件源码；需要时只读极短、已定位的片段。

## 证据层级

从强到弱：

1. **真实外部/人工验证**：真实设备、真实服务、人工验收记录。
2. **机器验证**：测试、构建、静态分析、schema 校验、命令 exit code。
3. **可复现的静态证据**：路径、行号、diff stat、依赖图、配置。
4. **独立 Reviewer 判断**：绑定不可变 subject 的 finding。
5. **子 Agent 自述**：只能作为线索，不能单独作为通过依据。

完成报告必须区分这些层级；未运行的验证不能写“通过”。

## 验收步骤

1. **契约检查**：交付是否覆盖简报的 scope、deliverable 和每一条 acceptance。
2. **范围检查**：`files_changed` 是否越界；有没有无关重构、依赖变更、生成物或锁文件。
3. **行为检查**：正常路径、失败路径、取消、超时、空值、离线、重启、兼容边界。
4. **证据检查**：命令是否存在、exit code 是否为 0、关键输出是否对应 acceptance。
5. **风险检查**：protected、跨语言/生成代码、安全、权限、数据、外部契约是否命中 Guard。
6. **独立审查**：高风险包必须由 Reviewer 绑定不可变 subject 复审；实现者不能自审。
7. **完成状态**：按 [rules/completion.md](../rules/completion.md) 选择唯一状态。

## 验收矩阵

```markdown
| Done When | 证据 | 结果 |
|---|---|---|
| ... | command + exit code / test name / path:line | pass / fail / not-run |
```

规则：

- `not-run` 不能算 pass。
- 结构检查通过不能替代行为正确。
- 旧 head 上的 pass 不能迁移到新 head。
- 人工验收未完成时，最高只能是 `ready-for-human-validation`。

## Finding

使用 [templates/review-finding.yaml](../templates/review-finding.yaml) 的语义：

```yaml
severity: blocker | major | minor
invariant: <被破坏的不变量>
evidence:
  - <path:line / 命令 / 测试>
required_repair: <必须改什么>
required_proof: <什么证据能关闭>
```

规则：

- 每个 finding 必须有证据和 required proof。
- 不接受“风格不喜欢”“可以更好”这类无不变量的意见。
- Guard 不关闭自己的 finding；由 Primary/PM triage。
- 新范围不是 finding，是 Spec/Grill 问题。

## 决策

Review 后只能选一个：

| 决策 | 条件 | 下一步 |
|---|---|---|
| `accept` | 所有 acceptance 有证据，无 blocker | 进入集成/收尾 |
| `repair` | 有可直接修复的 blocker，范围不变 | 派发有限修复包 |
| `re-spec` | 产品语义或范围变化 | 返回 Spec / Grill |
| `escalate` | 需要用户决定、授权或风险接受 | `awaiting-user-decision` |
| `stop` | 安全、预算、环境或两轮失败 | 对应停止状态 |

### 有限修复

- 每轮只修 finding 或失败验证直接相关的问题。
- 修复后重新运行受影响验证，并让相关 Reviewer 复审。
- 同一相关失败最多两轮；仍失败进入 `failed-verification`。
- 修复导致范围明显扩大时，返回 Grill，不用“继续重构”绕过。

## Output contract

```markdown
## Review

**Subject**：<commit / diff / artifact digest>
**Verdict**：accept | repair | re-spec | escalate | stop

**Acceptance**
| Done When | 证据 | 结果 |
|---|---|---|

**Findings**
| ID | Severity | Invariant | Evidence | Required proof |
|---|---|---|---|---|

**未验证项**：
**风险**：
**完成状态**：completed-verified | ready-for-human-validation | ...
**下一步**：
```

## 禁止

- 不亲自改代码、不运行构建/测试、不读完整 diff。
- 不以子 Agent 的“已完成”替代验收。
- 不把未运行的测试写成通过。
- 不在同一轮里既实现又给自己的实现盖章。
- 不用无证据的“看起来没问题”关闭 finding。

## 参考

- [../rules/completion.md](../rules/completion.md)
- [../workflows/review-repair.md](../workflows/review-repair.md)
- [../templates/review-finding.yaml](../templates/review-finding.yaml)
- [07-reviewer.md](07-reviewer.md)
