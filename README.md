# dsh-project-lead

[![MIT Licensed](https://img.shields.io/badge/license-MIT-brightgreen.svg?style=flat-square)](LICENSE)

`dsh-project-lead` is a DeepSeek Harness 0.2.x plugin that gives a top-level
agent a project-management workflow. The Project Lead plans and decomposes a
task, dispatches self-contained work packages, accepts evidence from child
agents, and reports the result. Children receive one of three focused role
contracts: `executor`, `reviewer`, or `scout`.

The plugin also provides a Web Settings page, an optional read-only Project
Manager preset, a collapsible project status card, and process-wide token
accounting grouped by `provider/model`.

中文文档：[README.zh.md](README.zh.md)

## What it provides

- **Scoped orchestration prompts.** `compact` and `full` Project Manager
  prompts apply only to the configured PM preset. Other top-level sessions can
  keep their normal tools and receive lightweight guidance or no guidance.
- **Role-specific children.** A `ROLE: executor`, `ROLE: reviewer`, or
  `ROLE: scout` marker selects the child contract. Children do not receive the
  PM contract and are instructed not to delegate again.
- **A clear tool boundary.** The optional PM preset keeps `read` and
  `read_image`, removes `write`, `edit`, and shell tools, and sends children to
  a code-capable preset such as `standard`.
- **Controlled model routing.** When model selection is enabled, only exact
  `provider/model` pairs in `allowedModels` can be selected. `modelNotes` adds
  dispatch advice but never grants access.
- **Child reuse and parallel dispatch.** When `list_agents` and `send_message`
  are available, related follow-ups can reuse an idle child; independent work
  packages can be launched together.
- **Evidence-based acceptance.** `started subagent <childId>` means that a
  child was accepted for execution. The completion notice carries its result,
  failure diagnostics, and any partial output.
- **Project status card.** The top-level agent can update work packages,
  owners, evidence, verification, blockers, and the next step above the
  composer with `project_status_update`.
- **Token accounting.** `model_token_usage` reports input, output, cache,
  reasoning, total, and request counts for every usage-bearing model stream
  seen by the plugin process.

## Requirements

- DeepSeek Harness `>=0.2.1-rc.2 <0.3.0-0` (verified against
  `0.2.1-rc.2`).
- A profile that provides `dsh-system-prompt`, `dsh-tools`, `dsh-llm`, and a
  `subagent` delegation tool.
- For selectable child models, an enabled
  `subagent-model-selection-settings` row with a non-empty allow-list and a
  preset-scoped delegation tool whose `modelSelectionSettings` is `true`.
  The shipped Web `standard`, `ptc`, and `cordis` presets provide this scope.

The package declares `@deepseek-ai/cordis` `^4.0.5` and matching 0.2.x
DeepSeek Harness peer packages as optional peers; the host supplies them.

## Installation

Install the published plugin in a Web profile:

```sh
dsh plugin --profile web add dsh-project-lead
```

To load a local checkout instead:

```sh
dsh plugin --profile web add link:/absolute/path/to/dsh-project-lead
```

The package bundle mounts its `project-lead` row through
[cordis.patch.yml](cordis.patch.yml). Restart the Harness after profile
changes when hot reload is not enabled.

## Quick start

1. Install the plugin. If the top-level agent must not edit files or run
   commands, add [the PM preset](examples/pm-preset.patch.yml) and select `pm`.
2. Configure a default child route, or enable model selection and authorize
   exact routes in `allowedModels`.
3. Give the Project Lead a goal, constraints, acceptance evidence, and the
   independent parts that may be delegated.
4. Begin every child brief with one marker:

   ```text
   ROLE: executor
   ROLE: reviewer
   ROLE: scout
   ```

   Without a marker, `prompts.defaultChildRole` (`executor` by default) is
   used. Child briefs must be self-contained because children cannot see the
   parent conversation.

## Configuration

Use **Settings -> Project Lead** in the Web client for prompt scope, the
default child route, reasoning effort, the child-model allow-list, and model
notes. The equivalent profile patch is shown in
[examples/cordis.patch.yml](examples/cordis.patch.yml). Merge the entries into
`$DSH_HOME/profiles/<profile>/cordis.patch.yml`; a patch replaces a target
row's whole `config:` value, so preserve existing settings when merging.

The Settings page does not expose the project profile. Configure `project`
fields in the profile patch when you want repository facts appended to PM and
child prompts.

### Plugin configuration

```yaml
- id: project-lead
  config:
    prompts:
      main: compact          # compact | full | guidance | off
      pmPreset: pm           # preset receiving the PM contract; empty = all
      otherMain: guidance    # other top-level sessions: guidance | off
      childRoles: true
      defaultChildRole: executor
      roleMarker: ROLE
      # dir: /optional/custom/prompt/directory
    project:
      name: my-project
      stack: Node.js
      verifyCommands:
        - npm test
      allowedPaths: [lib/**]
      forbiddenPaths: [.env]
      protectedCapabilities: [billing]
      conventions: [keep changes small]
      humanValidation: [verify the Web status card]
      notes: Additional project context for the PM.
    subagent:
      provider: glm
      model: glm-4-flash
      reasoningEffort: ""
    modelNotes:
      glm/glm-4.6:
        description: Strong reasoning route.
        strengths: complex reasoning, coding
        weaknesses: slower and pricier
```

| Key | Default | Description |
|---|---|---|
| `prompts.main` | `compact` | `compact`, `full`, legacy `guidance`, or `off`. `compact` and `full` use the PM contract only in `pmPreset`. |
| `prompts.pmPreset` | `pm` | Preset receiving the PM contract; empty applies it to every top-level session. |
| `prompts.otherMain` | `guidance` | Guidance or `off` for other top-level presets. |
| `prompts.childRoles` | `true` | Inject the executor/reviewer/scout contract into children. |
| `prompts.defaultChildRole` | `executor` | Role used when a brief has no valid marker. |
| `prompts.roleMarker` | `ROLE` | Prefix parsed from a line such as `ROLE: scout`. |
| `prompts.dir` | bundled | Custom directory using `00-project-manager.md` through `08-scout.md`; missing files fall back to bundled prompts. |
| `project.*` | empty | Optional project facts. An empty `project.root` uses the session working directory. |
| `subagent.provider/model` | empty | Default route passed by the PM. Empty values leave route selection to the authorized session. |
| `subagent.reasoningEffort` | empty | Passed only when the selected model advertises that effort. |
| `modelNotes` | `{}` | Per-route dispatch advice; it is not an authorization list. |

### PM preset and permissions

Prompt text alone does not remove tools. The optional preset in
[examples/pm-preset.patch.yml](examples/pm-preset.patch.yml) provides the
boundary:

- the PM keeps `read` and `read_image`;
- the PM omits `write`, `edit`, `pwsh`, and `bash`;
- the delegation tool sends children to `agentPreset: standard`;
- Standard remains the default for small tasks that do not need decomposition.

### Model routes and authorization

Model selection has two independent layers. First, define OpenAI-compatible
routes in the Web **Models** page or an `llm-pi-ai` row. A route declares a
provider, model, endpoint, and `apiKeyEnv`; `apiKeyEnv` is a name, not a secret.

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

Then authorize exact pairs and enable selection:

```yaml
- id: subagent-model-selection-settings
  config:
    enabled: true
    allowedModels:
      - { provider: glm, model: glm-4.6 }
      - { provider: kimi, model: kimi-k2-0711-preview }

# This row must be inside an agent-preset scope. Web presets already provide it.
- id: tool-subagent
  config:
    provider: spawn
    toolName: subagent
    modelSelectionSettings: true
```

Both layers are required. If the allow-list is disabled or empty, or the
delegation row is outside a preset scope, `list_subagent_models` is not
registered. The allow-list does not create providers or credentials; it only
limits exact routes that an already configured provider may use. Without model
selection, do not pass `provider`, `model`, or `reasoning_effort`.

### Built-in child roles

- **Executor:** implements, debugs, and verifies one bounded work package; it
  does not redefine the goal or spawn another child.
- **Reviewer:** performs an independent, read-only review and returns findings
  and a verdict; it does not fix the delivery.
- **Scout:** performs read-only reconnaissance of entry points, dependencies,
  conventions, and tests; it reports facts without implementing or making
  product decisions.

The bundled role files are `prompts/00-project-manager.md` through
`prompts/08-scout.md`.

## Runtime behavior

The plugin uses the public `systemPrompt`, `tools`, `sessionProjections`, and
`llm/stream` extension points. It does not patch Harness internals.

### Prompt assembly and dispatch

For each prompt assembly, the plugin checks delegation depth, visible tools,
the active preset, and configuration:

1. A delegated child receives its role contract and never the PM contract.
2. An agent without a visible `subagent` tool receives no orchestration prompt.
3. `main: off` disables the orchestration section.
4. A top-level session outside `pmPreset` receives `otherMain` and keeps its
   preset's tools.
5. A PM session receives `compact` or `full`; `full` adds intake, planning,
   review, and status contracts.

The PM prompt asks the agent to record work packages, discover authorized
routes when `list_subagent_models` is visible, write complete briefs, launch
independent packages together, and accept results only with evidence. When
`list_agents` and `send_message` are available, an idle child with the same
role and adjacent scope may receive a delta brief. A fresh child is used for a
different role or model, unrelated work, large context, fresh isolation, or an
independent final review. A follow-up is acceptance of a message, not
completion; the PM still waits for the completion notice.

### Project status card

The top-level PM can call `project_status_update` at phase boundaries and after
child completion. The Web client renders a collapsible card above the composer:

- collapsed: goal/focus, summary, phase, `done/total`, active children,
  verification, and update time;
- expanded: work packages with role, owner, state, evidence, blockers, and next
  step;
- the first update should be complete; later updates may contain changed fields;
  a supplied `workPackages` list replaces the previous list;
- child agents cannot update the card; on completion use `phase: done` and clear
  `next`.

![Collapsed project status card](docs/status-card-collapsed.png)

![Expanded project status card](docs/status-card-expanded.png)

### Sessions written by 0.6.1 and earlier

Older versions appended a custom `project-lead/status` event with no
`ignorable` marker. A current Harness refuses to open a log containing an
unknown required event, which surfaces as:

```text
failed to observe session "...": ... contains event type "project-lead/status"
(seq 44) unknown to this harness and not marked ignorable
```

Version 0.6.2 stores status in the standard `tool/result` presentation meta, so
new sessions never contain that event. Repair an existing log with the bundled
migration script (Node.js 22.15+ or 24+; it keeps a timestamped `.bak-*` copy):

```powershell
node scripts/migrate-status-events.mjs --write "$HOME\.dsh\sessions"
```

The script scans recursively when given a directory, or accepts one or more
`.jsonl.zstd` files. It renames only the legacy records to the ignorable
`plugin:project-lead/status` type, preserving sequence numbers and frame
layout. Run it without `--write` first to see what it would change.

### Token accounting

The plugin observes every global `llm/stream`, including child calls. Streams
without both a non-empty provider and model are ignored. The last usage chunk
in a stream is authoritative and contributes one request. Rows are grouped by
`provider/model` and sorted by computed total. `total = input + output + cache
read + cache write`; reasoning is a subset of output and is not added again.
Data covers all sessions since the plugin process started and resets when the
process restarts. Ask the top-level agent to call `model_token_usage`; this is
separate from the Harness per-session token meter.

## Repository layout

```text
lib/index.js       Runtime plugin, prompt gating, tools, and accounting
lib/prompts.js      Prompt loading, role parsing, and rendering
lib/client.js       Web Settings page and status-card client module
scripts/            One-shot session repair utilities
prompts/            Bundled PM and child-role Markdown prompts
examples/           Profile, PM preset, and legacy settings examples
docs/               Status-card screenshots
test/               Runtime and compatibility tests
cordis.patch.yml    Mount-only bundle patch
```

## Development and tests

The package is ESM and publishes `lib/index.js` as its main entry. The repository
defines this verification command:

```sh
npm test
```

It checks client syntax, prompt selection and role parsing, preset/tool gating,
status-card permissions and projection, token accounting, package compatibility,
and the shipped examples.

## Migration from 0.1.x

DeepSeek Harness 0.2.x imports `$DSH_HOME/settings.yaml` once and then renames
it to `settings.yaml.imported`; later edits are ignored. Move configuration to
the profile patch or Web Settings page. Current row ids are `llm-pi-ai`,
`subagent-model-selection-settings`, `tool-subagent`, and `project-lead`.
The old `subagent-model-selection` id and the former foreground/background
delegation switch are not part of the 0.2.x interface.

## Troubleshooting

- **`list_subagent_models` is missing:** check `enabled`, a non-empty
  `allowedModels`, and `modelSelectionSettings: true` on the preset-scoped row.
- **`standing modelSelectionSettings requires a scoped preset Context`:** move
  the setting into an agent-preset scope or use the configured child route.
- **A child route is rejected:** verify the exact provider/model is configured
  and is also present in `allowedModels`.
- **Only `started subagent ...` appears:** wait for the completion notice;
  acknowledgement is not success evidence.
- **`model_token_usage` is empty:** no usage-bearing model stream has completed
  since the plugin loaded.
- **Edits to `settings.yaml` do nothing:** migrate the values because 0.2.x
  imports that file once and renames it.
- **The status card is absent:** check that the Web client loads the packaged
  client module and that the top-level agent can see `project_status_update`.

## License

MIT. See [LICENSE](LICENSE).
