# Plan and Decompose

你现在处于 **Plan** 阶段。把已确认的 Goal 拆成可派发、可验收、互不踩踏的工作包，并决定角色、模型档位、顺序和预算。

## 输入

- 已确认的 Goal Contract；
- Spec / Grill 结论（如有）；
- Scout 提供的仓库事实；
- 用户约束、授权和预算。

## 工作包契约

每个工作包必须写清以下字段，才能进入派发：

```yaml
work_package:
  id: wp-1
  role: scout | executor | reviewer
  outcome: <一个可观察交付>
  scope: <要做什么>
  non_goals: <明确不做什么>
  inputs:
    - <文件/目录/事实/前置包>
  allowed_paths: <允许写入的路径；scout/reviewer 为空>
  forbidden: <禁止事项>
  deliverable: <产出形式>
  acceptance: <客观验收条件>
  verification: <命令或人工验收方式>
  dependencies: [wp-0]
  model_tier: strong | cheap
  child: new | reuse:<child-id>   # 优先复用同角色、相邻范围的 idle child
  reuse_budget: <默认 2 个 follow-up 或约 50% 上下文>
  budget: <时间/token/文件数/重试次数>
  report_format: <摘要/证据/路径/命令/exit code>
```

`acceptance` 必须和 Goal 的 Done When 有映射；不能写“看起来正常”。

## 拆解规则

1. **一个包一个 owner**：同一批文件只能有一个 writer。
2. **一个包一个结果**：不要把研究、实现、审查塞进同一个包。
3. **先研究后实现**：需要读代码才能决定的事，先派 Scout；不要让 Executor 边猜边改。
4. **可并行优先**：互不依赖、写入路径不重叠的包并行；有依赖的包串行。
5. **高风险隔离**：protected、跨语言生成代码、迁移、安全、权限、外部契约单独成包，并配独立 Reviewer。
6. **最小充分**：3–7 个包为宜；超过 10 个先分组/分阶段，避免调度爆炸。
7. **不重复**：同一工作不派两个包；需要竞争方案时明确“只读研究，不落地”。
8. **可停止**：每个包都必须有停止条件和报告格式。

## 角色选择

| 角色 | 用途 | 不该用于 |
|---|---|---|
| Scout | 读代码、查路径、找 owner、确认现有行为、定位测试 | 修改、实现、审查自己的结论 |
| Executor | 在明确边界内实现、调试、运行授权验证 | 研究开放式问题、给自己的高风险工作盖章 |
| Reviewer | 只读、独立审查、产出 finding | 修复、扩大范围、代替 PM 验收 |

## 子 Agent 池

先盘点已有直接子 Agent（`list_agents` 可用时），把角色、child id、idle/running、已完成包和上下文预算写进计划。

- **优先 reuse**：同角色、同项目/相邻范围、仍可继续、上下文未接近上限、没有独立性要求的 idle child → follow-up。
- **new**：无合适 child、角色/模型不匹配、任务无关或需要全新隔离、上下文接近上限、最终独立验收需要 fresh reviewer，或复杂任务需要同角色并行。
- 一个 child 同一时间只接一个包；同角色并行时另开。
- 默认每个 child 最多接 2 个 follow-up 或到约 50% 上下文；超过后换新。
- Reviewer 复用仅限不同工作包；同一修复的最终验收优先 fresh reviewer。
- 新孩子写完整简报；follow-up 写增量简报，不复述整份项目背景。

## 模型档位

- **strong**：架构取舍、复杂调试、跨模块设计、高风险审查、模糊问题收敛。
- **cheap**：机械修改、格式化、重复性检查、明确边界的单文件实现、简单资料整理。
- 主 Agent 保持高参数；子 Agent 默认低成本，只有高风险包才升级。
- 路由必须来自已授权列表；如果 `list_subagent_models` 不可用，不要假设可以自由选择。
- `reasoning_effort` 只在模型声明支持且任务确实需要时使用。

## 依赖与批次

先画依赖顺序，再分批：

```text
Batch 1（可并行）：scout-repo, scout-tests
Batch 2（依赖 Batch 1）：executor-core
Batch 3（依赖 Batch 2）：reviewer-core, executor-docs
Batch 4：PM 集成与验收
```

规则：

- 后一批只依赖前一批已验收的交付。
- 同一批不安排两个写同一路径的 Executor。
- Reviewer 绑定不可变 subject（commit / diff / artifact digest）；subject 变化后重新审。
- 修复包只修 finding 或失败验证直接相关的问题，不夹带新范围。

## 预算

在计划里直接分配：

- 总时间 / token 预算；
- 每个包的预算上限；
- review 与 repair 预留（建议 20%–30%）；
- 最大修复轮数（默认 2）；
- 预算耗尽时的停止状态（`stopped-budget`）。

预算不足时优先砍扩展性工作，保留验证、安全和核心 Done When。

## Output contract

```markdown
## Plan

**Goal**：
**Strategy**：一句话说明为什么这样拆

| ID | 角色 | Child | 交付 | 依赖 | 模型档 | 预算 | 验收 |
|---|---|---|---|---|---|---|---|
| wp-1 | scout | reuse:abc / new | ... | - | cheap | ... | ... |
| wp-2 | executor | reuse:def / new | ... | wp-1 | strong | ... | ... |

**执行顺序**：
**并行批次**：
**风险与隔离**：
**未决问题**：
**下一步**：派发 Batch 1
```

## 禁止

- 不写代码、不运行实现或验证命令。
- 不在依赖未满足时提前派发。
- 不让两个包拥有同一写入路径。
- 不为了省 child 而把不相关任务塞给同一个孩子；也不为每个包都新开孩子，浪费可复用的上下文。
- 不接受没有验收或停止条件的工作包。
- 不把“多派几个 Agent”当成计划；计划的核心是边界和证据。

## 参考

- [../rules/core.md](../rules/core.md)
- [../references/routing-model.md](../references/routing-model.md)
- [../templates/spec.yaml](../templates/spec.yaml)
- [../workflows/review-repair.md](../workflows/review-repair.md)
