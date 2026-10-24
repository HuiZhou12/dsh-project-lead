# dsh-project-lead

[![MIT Licensed](https://img.shields.io/badge/license-MIT-brightgreen.svg?style=flat-square)](LICENSE)

`dsh-project-lead` 是一个 DeepSeek Harness 0.2.x 插件，用于运行顶层
Project Manager：规划工作、派发自包含的子任务、审查证据并汇报结果。被派发的
子 Agent 会分别获得 executor、reviewer 或 scout 提示词；插件还会按
`provider/model` 记录进程级 token 用量。

## 环境要求

- DeepSeek Harness `>=0.2.1-rc.2 <0.3.0-0`。
- profile 中挂载 `dsh-system-prompt`、`dsh-tools`、`dsh-llm` 和一个
  `subagent` 委派工具。
- 如需让子 Agent 选择模型，需要配置
  `subagent-model-selection-settings` 允许列表，以及位于 preset 作用域内、
  带有 `modelSelectionSettings: true` 的委派工具。Web 自带 preset 已提供该作用域。

## 安装

在 Web profile 中安装：

```sh
dsh plugin --profile web add dsh-project-lead
```

从本地 checkout 安装：

```sh
dsh plugin --profile web add link:/absolute/path/to/dsh-project-lead
```

包内的 [bundle patch](cordis.patch.yml) 会挂载 `project-lead` row。未启用 HMR
时，修改 profile 后请重启 harness。

## 配置

推荐使用 **设置 → 项目编排**，也可以把
[examples/cordis.patch.yml](examples/cordis.patch.yml) 中的对应条目合并到
`$DSH_HOME/profiles/<profile>/cordis.patch.yml`。profile patch 会整体替换目标
row 的 `config:`，合并时请保留已有配置。

[examples/pm-preset.patch.yml](examples/pm-preset.patch.yml) 中的可选 PM preset
为 PM 会话保留 `read` 和 `read_image`，移除 `write` 和 `edit`，且不暴露 shell
工具；其子 Agent 使用 Standard preset。

插件 row 支持以下配置：

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

`modelNotes` 只是路由参考，不会授权模型。请在
`subagent-model-selection-settings` 中授权确切的 `provider`/`model` 对。完整的
路由、允许列表和 preset 示例见
[examples/cordis.patch.yml](examples/cordis.patch.yml)。

## 快速开始

1. 安装插件；如果顶层会话不应编辑文件或运行命令，再应用可选的 PM preset。
2. 配置至少一个模型路由，并将其授权给子 Agent。路由的 `apiKeyEnv` 只指定
   环境变量或凭据库中的键名，不要把密钥本身写入 profile patch。
3. 使用配置好的 PM preset 启动会话并提交项目任务。PM 简报应说明目标、约束、
   验证证据，以及哪些独立部分可以派发。

子角色简报开头使用以下标记之一：

```text
ROLE: executor
ROLE: reviewer
ROLE: scout
```

插件会从子请求中读取标记。没有标记时使用 `defaultChildRole`。`subagent` 调用
会在子任务运行时立即返回 `started subagent <childId>`；完成通知会携带结果或
失败详情。

让主 Agent 调用 `model_token_usage`，即可查看插件进程启动以来所有带 usage 的
模型流的输入、输出、缓存、reasoning 和请求次数。

## 功能

- 只为配置的 `pmPreset` 注入 PM 提示；其他顶层会话保留原有工具，并可接收
  `otherMain` 轻量提示。
- 为子会话注入独立的 executor、reviewer 和 scout 内置契约。
- 支持 `compact`、`full`、`guidance`、`off` 提示模式，以及使用 `00-08` 文件名的
  自定义提示词目录。
- 跨会话和子 Agent 记录用量，按 `provider/model` 分组并按总用量排序；插件进程
  重启后清空。
- 提供 Web 设置页，用于编辑提示词作用域、子 Agent 路由、模型备注和本地化表单。

## 文档

- [Profile patch 示例](examples/cordis.patch.yml)
- [PM preset 示例](examples/pm-preset.patch.yml)
- [旧版 0.1.x settings 格式](examples/settings.yaml)
- [English README](README.md)

### 从 0.1.x 迁移

DeepSeek Harness 0.2.x 会一次性导入 `$DSH_HOME/settings.yaml`，随后将其重命名为
`settings.yaml.imported`；之后的修改不会再读取。请把配置迁移到 profile patch
或设置页。当前 row id 为 `llm-pi-ai`、`subagent-model-selection-settings`、
`tool-subagent` 和 `project-lead`。旧的 `subagent-model-selection` id，以及之前
的前台/后台委派开关，都不属于 0.2.x 接口。

## 故障排查

- **找不到 `list_subagent_models`：** 启用
  `subagent-model-selection-settings`，提供非空允许列表，并使用带
  `modelSelectionSettings: true` 的 preset 作用域委派 row。
- **`standing modelSelectionSettings requires a scoped preset Context`：** 将设置
  移入 agent-preset 作用域，或移除它并使用已配置的子 Agent 路由。
- **子 Agent 路由被拒绝：** 检查确切的 provider/model 是否在 `allowedModels` 中，
  以及是否达到委派深度限制。
- **只有 `started subagent ...` 没有结果：** 等待完成通知；启动确认不代表任务成功。
- **`model_token_usage` 没有记录：** 插件加载后还没有带 usage 的模型流完成。

## 测试

```sh
npm test
```

测试脚本会检查 JavaScript 语法、插件配置与提示词选择、角色标记解析、用量统计、
包兼容性以及随包发布的示例。

## 许可证

MIT，详见 [LICENSE](LICENSE)。
