# dsh-project-lead

[![MIT Licensed](https://img.shields.io/badge/license-MIT-brightgreen.svg?style=flat-square)](LICENSE)

`dsh-project-lead` 是一个 DeepSeek Harness 0.2.x 插件。它把顶层 Agent 变成负责规划、拆解、派发、验收和汇报的 Project Manager，并为子 Agent 注入 executor、reviewer、scout 三类角色提示词；同时按 `provider/model` 统计整个插件进程中的模型 token 用量。

## 项目优势

- **职责分离**：PM 负责目标、计划和验收，Executor 负责实现，Reviewer 负责独立审查，Scout 负责只读侦察，避免一个 Agent 同时规划、编码和自审。
- **提示词按作用域生效**：PM 提示只注入配置的 PM preset；普通 Standard 会话保留原有工具，不会被误变成只读项目经理。
- **权限边界清晰**：可选 PM preset 只保留 `read` / `read_image`，移除 `write` / `edit` 和 shell；子 Agent 进入 Standard preset 后再执行代码修改。
- **模型路由可控**：只有 `allowedModels` 中的精确 `provider/model` 才能被子 Agent 选择；模型备注只用于分派参考，不会绕过授权。
- **上下文和成本可控**：独立任务并行派发；相关后续工作可以复用空闲子 Agent 的上下文；主 Agent 只保留计划、验收矩阵和摘要，并可通过 `model_token_usage` 查看进程级用量。
- **失败结果可追踪**：`started subagent` 只代表任务已受理，完成通知才携带成功结果、失败诊断或部分输出，PM 必须基于证据验收。
- **配置入口统一**：支持 Web 设置页和 profile patch，九份角色/阶段提示词随包发布，也支持自定义提示词目录。

## 运行机制

插件通过公开扩展点 `systemPrompt`、`tools` 和 `llm/stream` 工作，不修改 Harness 私有内部实现。启动后主要执行三条运行链路。

### 1. 提示词装配链路

每次组装 Agent 的 system prompt 时，插件会检查当前 Agent 的委派深度、可见工具、当前生效的 preset，以及 `project-lead` 配置：

1. **子 Agent（委派深度大于 0）**：读取子请求中的角色标记，例如 `ROLE: reviewer`，注入对应角色契约；没有标记时使用 `defaultChildRole`，默认是 `executor`。子 Agent 不会再次获得 PM 提示，也不会被提示递归派发任务。
2. **没有 `subagent` 工具的 Agent**：不注入编排提示，避免提示 Agent 调用不存在的工具。
3. **`main: off`**：不注入编排提示。
4. **非 PM preset 的顶层会话**：使用 `otherMain` 配置；默认是轻量 guidance，并保留该 preset 原有工具。
5. **PM preset 的顶层会话**：使用 `compact` 或 `full` PM 提示。`compact` 注入 PM 核心、阶段清单和派发约定；`full` 还会加入 intake、plan、review、status 等阶段契约。

当前 preset 不是只读取创建会话时的值：如果 Harness 的 session projection 记录了运行中的 preset 切换，插件会优先使用最新的 preset 状态。

### 2. 派发与子 Agent 复用链路

PM 提示会要求 Agent：

1. 先记录要派发的工作包，以及自己保留的工作；
2. 如果可见 `list_subagent_models`，先查询当前授权的 provider、model 和 reasoning effort；
3. 给每个子 Agent 发送包含目标、上下文、范围、交付物和验收条件的自包含简报；
4. 把独立工作包放在同一条消息中并行派发；
5. 等待每个子 Agent 的完成通知，再根据文件、命令、测试或审查 finding 验收。

如果当前同时可见 `list_agents` 和 `send_message`，PM 在相关 follow-up 前会先查找现有子 Agent：同一角色、同一项目且仍有上下文预算的空闲子 Agent 可以通过增量简报继续工作，默认最多两次 follow-up 或使用约一半上下文；不同角色、不同模型、无关任务、上下文较大或需要独立最终审查时重新创建子 Agent。`send_message` 只表示消息已受理，仍然要等待完成通知。

所有 `subagent` 调用都是异步的。`started subagent <childId>` 不是成功证据；子 Agent 结束后，运行时会发送最终回答、失败诊断和可能的部分输出。PM 不能仅凭启动确认宣布任务完成。

### 3. Token 统计链路

插件在全局 `llm/stream` 流水线上观察模型调用，包括子 Agent 调用：

- 只有同时提供非空 `provider` 和 `model` 的流才会被记录；
- 同一模型流如果产生多个 usage chunk，以最后一个为准；一个带 usage 的流只计一次请求；
- 统计 `input`、`output`、`cache read`、`cache write`、`reasoning` 和请求次数；
- `total = input + output + cache read + cache write`，reasoning 是 output 的子集，不会重复相加；
- 结果按 `provider/model` 分组，并按计算出的总 token 用量排序；
- 数据覆盖插件进程启动以来的所有会话和子 Agent，Harness 或插件进程重启后清空。

主 Agent 可调用 `model_token_usage` 查看报告。它不同于 Harness 自带的单会话 token meter。

## 环境要求

- DeepSeek Harness `>=0.2.1-rc.2 <0.3.0-0`，已在 `0.2.1-rc.2` 验证。
- profile 中挂载 `dsh-system-prompt`、`dsh-tools`、`dsh-llm` 和 `subagent` 委派工具。
- 如需子 Agent 选择模型，需要启用 `subagent-model-selection-settings`，并让实际生效的 `subagent` 工具位于 agent-preset 作用域且设置 `modelSelectionSettings: true`。Web 自带 preset 已提供该作用域。

## 安装

在 Web profile 中安装：

```sh
dsh plugin --profile web add dsh-project-lead
```

从本地 checkout 安装：

```sh
dsh plugin --profile web add link:/absolute/path/to/dsh-project-lead
```

插件自带的 [bundle patch](cordis.patch.yml) 会挂载 `project-lead` row。未启用 HMR 时，修改 profile 后请重启 Harness。

## 配置

推荐通过 **设置 → 项目编排** 配置，也可以把 [examples/cordis.patch.yml](examples/cordis.patch.yml) 中的条目合并到 `$DSH_HOME/profiles/<profile>/cordis.patch.yml`。profile patch 会整体替换目标 row 的 `config:`，合并时请保留已有值。

### PM preset 与工具边界

插件注入提示词本身不会删除工具；真正的工具边界来自可选 PM preset。使用 [examples/pm-preset.patch.yml](examples/pm-preset.patch.yml) 后：

- PM 会话保留 `read` / `read_image`；
- PM 会话移除 `write` / `edit`，且不包含 `pwsh` / `bash`；
- 子 Agent 通过 `agentPreset: standard` 进入代码能力完整的 Standard preset；
- Standard 仍然是默认 preset，适合小任务或不需要拆解的会话。

### 插件配置

```yaml
- id: project-lead
  config:
    prompts:
      main: compact          # compact | full | guidance | off
      pmPreset: pm           # 接收 PM 提示的 preset；留空 = 全部顶层会话
      otherMain: guidance    # 其他顶层会话：guidance | off
      childRoles: true
      defaultChildRole: executor
      roleMarker: ROLE
      # dir: /可选/自定义/提示词目录
    subagent:
      provider: glm
      model: glm-4-flash
      reasoningEffort: ""
    modelNotes:
      glm/glm-4.6:
        description: 强推理路由。
        strengths: complex reasoning, coding
        weaknesses: slower and pricier
```

| 配置 | 默认值 | 作用 |
|---|---|---|
| `prompts.main` | `compact` | `compact`、`full`、旧版轻量 `guidance` 或 `off`。`compact` / `full` 只对 `pmPreset` 会话使用 PM 提示。 |
| `prompts.pmPreset` | `pm` | 接收 PM 提示的 preset id；留空表示所有顶层会话。 |
| `prompts.otherMain` | `guidance` | 非 PM 顶层会话的提示，可设为 `guidance` 或 `off`。 |
| `prompts.childRoles` | `true` | 是否给子 Agent 注入角色契约。 |
| `prompts.defaultChildRole` | `executor` | 子简报没有角色标记时使用的角色。 |
| `prompts.roleMarker` | `ROLE` | 角色标记前缀；插件会读取如 `ROLE: scout` 的行。 |
| `prompts.dir` | 内置 | 自定义 Markdown 提示词目录，使用 `00-project-manager.md` 到 `08-scout.md` 文件名；缺失文件回退到内置提示词。 |
| `subagent.provider/model` | 空 | PM 传给子 Agent 的默认路由；为空时由 PM 使用当前授权路由。 |
| `subagent.reasoningEffort` | 空 | 仅在目标模型声明支持该 effort 时传入。 |
| `modelNotes` | `{}` | 按 `provider/model` 编写的路由参考，包含 `description`、`strengths`、`weaknesses`；不会授予权限。 |

## 模型路由与授权逻辑

模型选择需要两层条件同时满足。

### 第一层：模型来源

在 Web **Models** 页或 `llm-pi-ai` row 中配置 OpenAI 兼容路由。每个路由包含 provider、model、API 地址和 `apiKeyEnv`；`apiKeyEnv` 只写密钥名称，密钥由环境变量、`$DSH_HOME/.credentials.yaml` 或 Models 页提供。

```yaml
- id: llm-pi-ai
  config:
    providers:
      glm:
        displayName: Zhipu GLM
        apiKeyEnv: GLM_API_KEY
        api: openai-completions
        baseURL: https://open.bigmodel.cn/api/paas/v4
        models:
          - id: glm-4.6
            name: GLM-4.6
            contextWindow: 200000
```

### 第二层：允许列表与工具作用域

允许列表只接受精确的 provider/model 对：

```yaml
- id: subagent-model-selection-settings
  config:
    enabled: true
    allowedModels:
      - { provider: glm, model: glm-4.6 }
      - { provider: kimi, model: kimi-k2-0711-preview }
```

同时，实际提供给 Agent 的 `subagent` 工具必须位于 agent-preset 作用域，并设置：

```yaml
- id: tool-subagent
  config:
    provider: spawn
    toolName: subagent
    modelSelectionSettings: true
```

两层缺一不可：

- 允许列表关闭、为空或工具不在 preset 作用域时，`list_subagent_models` 不会注册；
- 此时子 Agent 不应传 `provider`、`model` 或 `reasoning_effort`，而是使用配置的默认子 Agent 路由；
- 允许列表只决定“能选哪些精确路由”，不会自动创建 provider，也不会替代 API key 配置；
- `modelNotes` 只影响 PM 对强模型、便宜模型、长上下文模型的分派建议，不是权限来源；
- reasoning effort 只有在模型目录声明支持时才会显示或传递。

Web 的 standard / ptc / cordis preset 已经提供 preset 作用域的委派工具，通常只需要配置允许列表。direct-agent 或 headless 组合无法通过 host 级 row 开启该模型选择能力。

## 子 Agent 角色

PM 给每个子 Agent 的简报开头应写一个角色标记：

```text
ROLE: executor
ROLE: reviewer
ROLE: scout
```

- **executor**：在明确的范围和允许路径内实现、调试和验证，不重新定义目标，也不再派发子 Agent。
- **reviewer**：只读、对抗式审查交付，输出带证据的 finding 和 verdict，不修复代码。
- **scout**：只读侦察代码、依赖、入口和测试，输出事实与证据，不实现功能，也不替 PM 做产品决策。

子 Agent 看不到主对话，因此简报必须自包含，包括目标、上下文、范围、禁止事项、交付物、验收条件和验证命令。

## 文档与迁移

- [Profile patch 示例](examples/cordis.patch.yml)
- [PM preset 示例](examples/pm-preset.patch.yml)
- [旧版 0.1.x settings 格式](examples/settings.yaml)
- [English README](README.md)

### 从 0.1.x 迁移

DeepSeek Harness 0.2.x 会一次性导入 `$DSH_HOME/settings.yaml`，然后将其重命名为 `settings.yaml.imported`；之后的修改不会再读取。请迁移到 profile patch 或设置页。当前 row id 为 `llm-pi-ai`、`subagent-model-selection-settings`、`tool-subagent` 和 `project-lead`。旧的 `subagent-model-selection` id 以及前台/后台委派开关都不属于 0.2.x 接口。

## 故障排查

- **找不到 `list_subagent_models`：** 检查 `enabled`、非空 `allowedModels` 和 preset 作用域内的 `modelSelectionSettings: true`。
- **出现 `standing modelSelectionSettings requires a scoped preset Context`：** 不要在 host 级 direct-agent row 上设置它；移到 agent-preset 作用域，或改用默认子 Agent 路由。
- **子 Agent 路由被拒绝：** 检查 provider/model 是否精确出现在 `allowedModels` 中、provider 是否声明该 model，以及委派深度是否达到上限。
- **只有 `started subagent ...` 没有结果：** 等待完成通知；启动确认不代表成功。
- **`model_token_usage` 显示没有记录：** 插件加载后还没有带 usage 的模型流完成。
- **修改 `settings.yaml` 不生效：** 0.2.x 只导入一次并已改名；请把配置迁移到 profile patch。
- **`modelNotes` 不生效：** 检查 row id 是否为 `project-lead`、`config:` 缩进是否正确，并 reload 或重启。

## 测试

```sh
npm test
```

测试脚本会检查客户端 JavaScript 语法、插件配置与 preset 门控、PM/子角色提示词选择、角色标记解析、子 Agent 复用提示、token 用量统计、包兼容性以及随包发布的示例。

## 许可证

MIT，详见 [LICENSE](LICENSE)。
