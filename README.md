# dsh-project-lead

[![MIT Licensed](https://img.shields.io/badge/license-MIT-brightgreen.svg?style=flat-square)](LICENSE)

`dsh-project-lead` is a DeepSeek Harness 0.2.x plugin for running a top-level
Project Manager that plans work, dispatches self-contained child tasks, reviews
evidence, and reports results. Delegated children receive separate executor,
reviewer, or scout prompts, while the plugin records process-wide token usage by
`provider/model`.

## Requirements

- DeepSeek Harness `>=0.2.1-rc.2 <0.3.0-0`.
- A profile that mounts `dsh-system-prompt`, `dsh-tools`, `dsh-llm`, and a
  `subagent` delegation tool.
- For child model selection, the `subagent-model-selection-settings` allow-list
  and a preset-scoped delegation tool with `modelSelectionSettings: true`.
  Shipped Web presets provide the required scope.

## Installation

Install the plugin in a Web profile:

```sh
dsh plugin --profile web add dsh-project-lead
```

For a local checkout:

```sh
dsh plugin --profile web add link:/absolute/path/to/dsh-project-lead
```

The package's [bundle patch](cordis.patch.yml) mounts the `project-lead` row.
Restart the harness after profile changes when HMR is not enabled.

## Configuration

Use **Settings → 项目编排** for the plugin settings, or merge the equivalent
entries from [examples/cordis.patch.yml](examples/cordis.patch.yml) into
`$DSH_HOME/profiles/<profile>/cordis.patch.yml`. A profile patch replaces a
target row's whole `config:` value, so preserve any existing values when
merging.

The optional PM preset in
[examples/pm-preset.patch.yml](examples/pm-preset.patch.yml) gives the PM
session `read` and `read_image`, removes `write` and `edit`, and does not expose
shell tools. Its children use the Standard preset.

The plugin row accepts these settings:

```yaml
- id: project-lead
  config:
    prompts:
      main: compact          # compact | full | guidance | off
      pmPreset: pm           # preset that receives the PM prompt; empty = all
      otherMain: guidance    # guidance | off for other top-level sessions
      childRoles: true
      defaultChildRole: executor
      roleMarker: ROLE
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

`modelNotes` is a routing guide; it does not authorize models. Authorize exact
`provider`/`model` pairs in `subagent-model-selection-settings`. The complete
route, allow-list, and preset examples are in
[examples/cordis.patch.yml](examples/cordis.patch.yml).

## Quick start

1. Install the plugin and apply the optional PM preset if the top-level session
   must not edit files or run commands.
2. Configure at least one model route and authorize it for child agents. The
   route's `apiKeyEnv` names the environment variable or credential-store key
   that supplies its API key; do not put the key itself in the profile patch.
3. Start a session with the configured PM preset and give it a project task. A
   PM brief should identify the goal, constraints, verification evidence, and
   which independent parts may be delegated.

For a child role, begin the delegation brief with one of these markers:

```text
ROLE: executor
ROLE: reviewer
ROLE: scout
```

The plugin reads the marker from the child request. When it is absent,
`defaultChildRole` applies. A `subagent` call returns `started subagent <childId>`
while the child runs; the completion notice contains its result or failure
details.

Ask the main agent to call `model_token_usage` to report input, output, cache,
reasoning, and request counts for every usage-bearing model stream since the
plugin process started.

## What it does

- Injects a PM prompt only for the configured `pmPreset`; other top-level
  sessions keep their normal tools and receive `otherMain` guidance when enabled.
- Injects separate bundled executor, reviewer, and scout contracts into child
  sessions.
- Supports `compact`, `full`, `guidance`, and `off` prompt modes plus an optional
  custom prompt directory using the bundled `00-08` filenames.
- Tracks usage across sessions and sub-agents, grouped and sorted by
  `provider/model`. The store resets when the plugin process restarts.
- Adds a Web Settings page for prompt scope, child routing, model notes, and
  locale-aware form editing.

## Documentation

- [Profile patch example](examples/cordis.patch.yml)
- [PM preset example](examples/pm-preset.patch.yml)
- [Legacy 0.1.x settings format](examples/settings.yaml)
- [中文 README](README.zh.md)

### Migrating from 0.1.x

DeepSeek Harness 0.2.x imports `$DSH_HOME/settings.yaml` once and then renames
it to `settings.yaml.imported`; later edits are ignored. Move configuration to
the profile patch or the Settings page. Use the current row ids
`llm-pi-ai`, `subagent-model-selection-settings`, `tool-subagent`, and
`project-lead`. The old `subagent-model-selection` id and the former
foreground/background delegation switch are not part of the 0.2.x interface.

## Troubleshooting

- **`list_subagent_models` is missing:** enable
  `subagent-model-selection-settings`, provide a non-empty allow-list, and use a
  preset-scoped delegation row with `modelSelectionSettings: true`.
- **`standing modelSelectionSettings requires a scoped preset Context`:** move
  the setting inside an agent-preset scope, or omit it and use the configured
  child route.
- **A child route is rejected:** check that the exact provider/model pair is in
  `allowedModels` and that the delegation depth limit has not been reached.
- **`started subagent ...` has no answer yet:** wait for the completion notice;
  the start acknowledgement is not task success.
- **`model_token_usage` reports no records:** no usage-bearing model stream has
  completed since the plugin loaded.

## Testing

```sh
npm test
```

The test script checks JavaScript syntax, plugin configuration and prompt
selection, role-marker parsing, usage accounting, package compatibility, and
the shipped examples.

## License

MIT. See [LICENSE](LICENSE).
