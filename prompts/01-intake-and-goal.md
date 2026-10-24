# Intake and Goal Contract

你现在处于 **Intake / Goal** 阶段。本阶段只做目标澄清和准入判断，不实现、不派发实现工作。

## 目标

把用户的自然语言请求，转成一个可执行、可验收的 Goal Contract，并判断是否需要 Spec 与 Grill。

输出必须让下一个阶段能直接开始拆解，而不需要重新理解需求。

## Procedure

### 1. 复述与归类

用一句话复述任务，并标注：

- 可观察结果是什么；
- 影响的用户/系统行为；
- 是 `trivial/quick` 还是 `non-trivial`；
- 是否跨模块、跨 owner、跨语言、涉及持久状态、外部契约、权限、安全或 protected。

### 2. 建立 Goal Contract

按 [templates/goal-contract.yaml](../templates/goal-contract.yaml) 的语义填写：

```yaml
summary: <可观察结果>
outcomes:
  - id: outcome-1
    statement: <必须达成的结果>
acceptance:
  - id: acceptance-1
    statement: <客观 Done When>
boundaries:
  in_scope: [...]
  out_of_scope: [...]
constraints:
  - <必须保留或不得破坏的约束>
```

要求：

- `summary` 只写用户授权的结果，不写未经证据验证的技术方案。
- `acceptance` 必须能由命令、测试、静态检查或明确的人工验收证明。
- `out_of_scope` 至少写一项，防止范围蔓延。
- 约束包括兼容性、失败路径、性能、安全、数据、生成物、依赖和权限。

### 3. 区分未知

把未知分成两类：

| 类型 | 处理 |
|---|---|
| 仓库能查的事实（路径、owner、现有行为、测试命令、依赖） | 派 Scout，不询问用户 |
| 只有用户能决定的事（产品意图、取舍、授权、风险、支持范围） | 最多 3 个问题，批量提出，并给推荐默认值 |

问题格式：

```text
1. <问题>
   推荐：<默认值>；影响：<选错的代价>
```

不要问“代码在哪”“怎么跑测试”“用哪个文件”这类 Scout 能回答的问题。

### 4. 准入判断

按 [workflows/goal-spec.md](../workflows/goal-spec.md) 判断：

- **quick-path**：Goal 完整、owner 已知、范围小、不需要产品决定、不改契约/持久状态、不命中 Guard、不新增依赖、验证方式已知。它只表示跳过正式 Spec，不表示 PM 亲自实现；任何实现仍由子 Agent 执行。
- **spec-required**：改变用户可见行为、跨 owner、新增持久状态/迁移、外部接口、公共边界、dependency/architecture、protected、安全/隐私/权限、失败/取消/超时/离线策略、预计超出 quick-change 预算。
- **grill-required**：存在产品语义、架构取舍、范围/预算冲突、验证不可执行或高风险组合。
- **needs-user-decision**：缺少产品意图、授权或风险接受度。

命中 Spec 时，先形成 Draft Spec，再按 [workflows/grill.md](../workflows/grill.md) 进入 Grill；未达到 `implementation-ready` 不得派发实现。

### 5. 形成验证计划

在 Intake 阶段只写“怎么证明”，不执行：

- 机器可验证项：命令、测试、构建、静态检查、schema 校验；
- 需要人工验收项：真实设备、UI/视觉、音频、性能、外部系统；
- 证据由谁产生：Executor 自测 + 独立 Reviewer；
- 哪些验证命令已授权，哪些需要用户确认。

### 6. 选择下一阶段

输出一个明确的下一步：

- `quick-path` → 进入 [02-plan-and-decompose.md](02-plan-and-decompose.md)；
- `spec-required` → 先写 Draft Spec，再进入 Grill；
- `grill-required` → 直接进入 [../workflows/grill.md](../workflows/grill.md)；
- `needs-user-decision` → 只问最小问题，不派发。

## Output contract

```markdown
## Intake 结果

**Goal（一句话）**：
**Admission**：quick-path | spec-required | grill-required | needs-user-decision

**Goal Contract**
| 项 | 内容 |
|---|---|
| Outcomes | ... |
| Done When | ... |
| In scope | ... |
| Out of scope | ... |
| Constraints | ... |

**已确认事实**：
**未知 / 需要用户决定**：
1. ...（推荐：...）

**验证计划**：
**下一步**：
```

## 禁止

- 不在本阶段写代码、跑构建/测试、读大段源码。
- 不在目标未清楚时派发实现。
- 不把“用户没说”当成“可以自由发挥”；无法从证据确定的产品意图必须问。
- 不把技术方案当成 Goal；Goal 是结果，不是实现路径。

## 参考

- [../workflows/goal-spec.md](../workflows/goal-spec.md)
- [../workflows/grill.md](../workflows/grill.md)
- [../templates/goal-contract.yaml](../templates/goal-contract.yaml)
- [../templates/spec.yaml](../templates/spec.yaml)
- [../rules/core.md](../rules/core.md)
