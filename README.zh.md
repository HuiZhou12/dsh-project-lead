# dsh-project-lead

[![MIT Licensed](https://img.shields.io/badge/license-MIT-brightgreen.svg?style=flat-square)](LICENSE)

`dsh-project-lead` 是一个面向 DeepSeek Harness 0.2.x 的项目编排插件。它让
顶层 Agent 负责规划目标、拆分工作、派发自包含的工作包、根据证据验收子 Agent，
并汇报结果。子 Agent 会获得三种聚焦角色之一：`executor`、`reviewer` 或
`scout`。

插件还提供 Web 设置页、可选的只读 Project Manager preset、可折叠项目状态卡片，
以及按 `provider/model` 分组的进程级 token 统计。

English documentation: [README.md](README.md)

## 能力概览

- **按作用域注入编排提示**：`compact` 和 `full` PM 提示只作用于配置的 PM
  preset；其他顶层会话可以保留原有工具，使用轻量 guidance 或关闭编排提示。
- **子 Agent 角色契约**：`ROLE: executor`、`ROLE: reviewer` 或 `ROLE: scout`
  选择对应契约。子 Agent 不会获得 PM 契约，也不会继续派生子 Agent。
- **清晰的工具边界**：可选 PM preset 保留 `read` / `read_image`，移除
  `write`、`edit` 和 shell 工具，并把子 Agent 送入 `standard` 等代码能力完整的
  preset。
- **可控的模型路由**：启用模型选择时，只有 `allowedModels` 中精确的
  `provider/model` 才能被选择；`modelNotes` 只提供分派参考，不会授予权限。
- **并行派发与子 Agent 复用**：同时可见 `list_agents` 和 `send_message` 时，
  相关 follow-up 可以复用空闲子 Agent；独立工作包可以并行启动。
- **基于证据验收**：`started subagent <childId>` 只表示任务已受理；完成通知才携
  带结果、失败诊断和可能的部分输出。
- **项目状态卡片**：顶层 Agent 可以通过 `project_status_update` 更新工作包、
  执行者、证据、验证结果、阻塞项和下一步。
- **Token 统计**：`model_token_usage` 汇报插件进程内每条带 usage 的模型流的
  input、output、缓存、reasoning、total 和请求次数。

## 环境要求

- DeepSeek Harness `>=0.2.1-rc.2 <0.3.0-0`；已在 `0.2.1-rc.2` 验证。
- profile 中提供 `dsh-system-prompt`、`dsh-tools`、`dsh-llm` 和 `subagent` 委派工具。
- 如需子 Agent 选择模型，需要启用 `subagent-model-selection-settings`，配置非空
  允许列表，并让 preset 作用域内的 `subagent` 工具设置
  `modelSelectionSettings: true`。Web 自带 `standard`、`ptc`、`cordis` preset 已
  提供该作用域。

包声明了 `@deepseek-ai/cordis` `^4.0.5` 以及匹配 0.2.x 的 DeepSeek Harness peer
包；这些 peer 依赖由宿主提供，并标记为 optional。

## 安装

在 Web profile 中安装发布版插件：

```sh
dsh plugin --profile web add dsh-project-lead
```

从本地 checkout 安装：

```sh
dsh plugin --profile web add link:/absolute/path/to/dsh-project-lead
```

包通过 [cordis.patch.yml](cordis.patch.yml) 挂载自己的 `project-lead` row。未启用
热加载时，修改 profile 后请重启 Harness。

## 快速开始

1. 安装插件。如果不希望顶层 Agent 修改文件或运行命令，追加
   [PM preset](examples/pm-preset.patch.yml)，并在会话中选择 `pm`。
2. 配置默认子 Agent 路由，或启用模型选择并在 `allowedModels` 中授权精确路由。
3. 给 Project Lead 提供明确目标、约束、验收证据，以及可以独立派发的部分。
4. 每份子 Agent 简报第一行写角色标记：

   ```text
   ROLE: executor
   ROLE: reviewer
   ROLE: scout
   ```

   没有有效标记时使用 `prompts.defaultChildRole`，默认是 `executor`。子 Agent 看不到
   主对话，因此简报必须自包含。

## 配置

Web 客户端的 **设置 -> 项目编排** 页面可以配置提示作用域、默认子 Agent 路由、
reasoning effort、子模型允许列表和模型备注。等价的 profile patch 见
[examples/cordis.patch.yml](examples/cordis.patch.yml)。将需要的条目合并到
`$DSH_HOME/profiles/<profile>/cordis.patch.yml`；patch 会整体替换目标 row 的
`config:`，合并时请保留已有配置。

设置页不提供项目 profile 表单；如需把仓库事实注入 PM 和子 Agent 提示词，请在
profile patch 中配置 `project` 字段。

### 插件配置

```yaml
- id: project-lead
  config:
    prompts:
      main: compact          # compact | full | guidance | off
      pmPreset: pm           # 接收 PM 契约的 preset；留空 = 全部顶层会话
      otherMain: guidance    # 其他顶层会话：guidance | off
      childRoles: true
      defaultChildRole: executor
      roleMarker: ROLE
      # dir: /可选/自定义/提示词目录
    project:
      name: my-project
      stack: Node.js
      verifyCommands:
        - npm test
      allowedPaths: [lib/**]
      forbiddenPaths: [.env]
      protectedCapabilities: [billing]
      conventions: [保持改动小而聚焦]
      humanValidation: [检查 Web 状态卡片]
      notes: 提供给 PM 的额外项目上下文。
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

| 配置项 | 默认值 | 作用 |
|---|---|---|
| `prompts.main` | `compact` | `compact`、`full`、旧版 `guidance` 或 `off`；`compact` / `full` 只在 `pmPreset` 中使用 PM 契约。 |
| `prompts.pmPreset` | `pm` | 接收 PM 契约的 preset id；留空表示所有顶层会话。 |
| `prompts.otherMain` | `guidance` | 其他顶层 preset 使用轻量 guidance 或 `off`。 |
| `prompts.childRoles` | `true` | 是否给子 Agent 注入 executor/reviewer/scout 契约。 |
| `prompts.defaultChildRole` | `executor` | 没有有效角色标记时使用的角色。 |
| `prompts.roleMarker` | `ROLE` | 读取如 `ROLE: scout` 这一行时使用的前缀。 |
| `prompts.dir` | 内置 | 自定义 `00-project-manager.md` 到 `08-scout.md` 的目录；缺失文件回退到内置提示词。 |
| `project.*` | 空 | 附加到提示词中的项目事实；`project.root` 为空时使用会话工作目录。 |
| `subagent.provider/model` | 空 | PM 传给子 Agent 的默认路由；为空时由已授权会话决定。 |
| `subagent.reasoningEffort` | 空 | 仅在目标模型声明支持该 effort 时传递。 |
| `modelNotes` | `{}` | 按路由提供分派建议；不是授权列表。 |

### PM preset 与权限

只注入提示词不会删除工具。使用
[examples/pm-preset.patch.yml](examples/pm-preset.patch.yml) 后，权限边界如下：

- PM 保留 `read` / `read_image`；
- PM 不包含 `write`、`edit`、`pwsh`、`bash`；
- 委派工具把子 Agent 送入 `agentPreset: standard`；
- Standard 仍是默认 preset，适合不需要拆分的小任务。

### 模型路由与授权

模型选择需要两层配置同时成立。第一层是在 Web **Models** 页面或 `llm-pi-ai` row
中定义 OpenAI 兼容路由。路由声明 provider、model、接口地址和 `apiKeyEnv`；
`apiKeyEnv` 只写名称，不要写密钥值。

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

第二层是启用选择并授权精确的 provider/model 对：

```yaml
- id: subagent-model-selection-settings
  config:
    enabled: true
    allowedModels:
      - { provider: glm, model: glm-4.6 }
      - { provider: kimi, model: kimi-k2-0711-preview }

# 必须位于 agent-preset 作用域；Web preset 已提供该配置。
- id: tool-subagent
  config:
    provider: spawn
    toolName: subagent
    modelSelectionSettings: true
```

两层缺一不可。允许列表关闭、为空，或委派 row 不在 preset 作用域时，不会注册
`list_subagent_models`。允许列表不会创建 provider 或配置凭据，只限制已配置 provider
可以使用哪些精确路由。未开启模型选择时，不要传 `provider`、`model` 或
`reasoning_effort`；子 Agent 使用配置的默认路由。

### 内置子 Agent 角色

- **Executor**：在限定工作包内实现、调试和验证；不重新定义目标，也不继续派生子 Agent。
- **Reviewer**：独立、只读地审查交付，返回带证据的 finding 和 verdict；不负责修复交付物。
- **Scout**：只读侦察入口、依赖、约定和测试，报告事实，不实现功能，也不替 PM 做产品决策。

内置角色文件位于 `prompts/00-project-manager.md` 到 `prompts/08-scout.md`。

## 运行机制

插件使用公开的 `systemPrompt`、`tools`、`sessionProjections` 和 `llm/stream` 扩展点，
不修改 Harness 私有内部实现。

### 提示词装配与派发

每次装配 system prompt 时，插件会检查委派深度、可见工具、当前 preset 和配置：

1. 被委派的子 Agent 只接收对应角色契约，不接收 PM 契约。
2. 没有可见 `subagent` 工具的 Agent 不会收到编排提示。
3. `main: off` 会关闭编排部分。
4. 不在 `pmPreset` 中的顶层会话使用 `otherMain`，并保留自己的 preset 工具。
5. PM 会话使用 `compact` 或 `full`；`full` 额外加入 intake、plan、review、status 阶段契约。

PM 提示要求 Agent 记录工作包，在可见 `list_subagent_models` 时先发现授权路由，编写
完整简报，并行启动独立工作包，只依据证据验收结果。同时可见 `list_agents` 和
`send_message` 时，同角色、相邻范围且仍有上下文预算的空闲子 Agent 可以接收增量简报；
不同角色或模型、无关工作、上下文过大、需要全新隔离或独立最终审查时重新创建。follow-up
只代表消息已受理，仍需等待完成通知。

### 项目状态卡片

顶层 PM 可以在阶段边界或子 Agent 完成后调用 `project_status_update`。Web 客户端会把
最新 projection 渲染为输入框上方的可折叠卡片：

- 折叠态显示目标/焦点、摘要、阶段、`done/total`、运行中的子 Agent、验证结果和更新时间；
- 展开态显示工作包的角色、执行者、状态、证据、阻塞项和下一步；展开区域在限高卡片内
  独立滚动，工作包再多也能看到顶部的收起按钮；
- 第一次更新应提供完整状态，后续可以只传变化字段；提供 `workPackages` 时会替换旧列表；
- 子 Agent 更新状态卡会被拒绝；完成时设置 `phase: done` 并清空 `next`。

![折叠的项目状态卡片](docs/status-card-collapsed.png)

![展开的项目状态卡片](docs/status-card-expanded.png)

### 0.6.1 及更早版本写出的会话

旧版本会把自定义 `project-lead/status` 事件写进 session log，且没有
`ignorable` 标记。当前 Harness 遇到未知必需事件时会拒绝打开整份日志，表现为：

```text
failed to observe session "...": ... contains event type "project-lead/status"
(seq 44) unknown to this harness and not marked ignorable
```

0.6.2 改为把状态放进标准 `tool/result` 的 presentation meta，新会话不再产生该事件。
修复旧日志可使用仓库内的迁移脚本（需要 Node.js 22.15+ 或 24+，会自动保留带时间戳的
`.bak-*` 备份）：

```powershell
node scripts/migrate-status-events.mjs --write "$HOME\.dsh\sessions"
```

脚本接受目录（递归扫描）或一个/多个 `.jsonl.zstd` 文件；只把旧事件改名为可忽略的
`plugin:project-lead/status`，保留 seq、时间和原有帧布局。先不带 `--write` 运行可以
预览将要修改的内容。

### Token 统计

插件观察全局 `llm/stream`，包括子 Agent 调用。provider 和 model 任一为空的流会被忽略；
同一流最后一个 usage chunk 为准，并只计一个请求。结果按 `provider/model` 分组并按计算
出的 total 降序排列。`total = input + output + cache read + cache write`，reasoning 是
output 的子集，不会重复相加。数据覆盖插件进程启动以来的所有会话，进程重启后清零。
让顶层 Agent 调用 `model_token_usage` 查看报告；它不同于 Harness 自带的单会话 token meter。

## 仓库结构

```text
lib/index.js       运行时插件、提示门控、工具和 token 统计
lib/prompts.js      提示词加载、角色解析和渲染
lib/client.js       Web 设置页与状态卡片客户端模块
scripts/            一次性会话修复工具
prompts/            内置 PM 与子角色 Markdown 提示词
examples/           profile、PM preset 和旧版 settings 示例
docs/               状态卡片截图
test/               运行时与兼容性测试
cordis.patch.yml    只负责挂载插件的 bundle patch
```

## 开发与测试

包使用 ESM，主入口是 `lib/index.js`。仓库定义的验证命令是：

```sh
npm test
```

它会检查客户端语法、提示词与角色解析、preset/工具门控、状态卡权限与 projection、
token 统计、包兼容性以及随包发布的示例。

## 从 0.1.x 迁移

DeepSeek Harness 0.2.x 会一次性导入 `$DSH_HOME/settings.yaml`，随后改名为
`settings.yaml.imported`；之后的修改不会再读取。请迁移到 profile patch 或 Web 设置页。
当前 row id 为 `llm-pi-ai`、`subagent-model-selection-settings`、`tool-subagent` 和
`project-lead`。旧的 `subagent-model-selection` id 以及前台/后台委派开关不属于 0.2.x 接口。

## 故障排查

- **找不到 `list_subagent_models`**：检查 `enabled`、非空 `allowedModels`，以及 preset 作用域内委派 row 的 `modelSelectionSettings: true`。
- **出现 `standing modelSelectionSettings requires a scoped preset Context`**：把设置移到 agent-preset 作用域，或改用配置的默认子 Agent 路由。
- **子 Agent 路由被拒绝**：确认 provider/model 同时存在于已配置 provider 和 `allowedModels`。
- **只有 `started subagent ...`**：等待完成通知；启动确认不是成功证据。
- **`model_token_usage` 为空**：插件加载后还没有带 usage 的模型流完成。
- **修改 `settings.yaml` 不生效**：0.2.x 只导入一次并改名，请迁移配置。
- **没有状态卡片**：检查 Web 客户端是否加载了随包客户端模块，以及顶层 Agent 是否可见 `project_status_update`。

## 许可证

MIT，详见 [LICENSE](LICENSE)。
