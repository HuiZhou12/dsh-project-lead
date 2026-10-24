window.__ModuleLoader__.load({
  id: "dsh-project-lead",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const React = require("react");
    const h = React.createElement;
    const { useCallback, useEffect, useMemo, useState, useSyncExternalStore } = React;
    const {
      SettingsForm,
      SettingsValueField,
      SegmentedControl,
      Switch
    } = require("@deepseek-ai/dsh-client-ui-primitives");

    const NS = "project-lead";
    const LOCALE_NS = "settings.projectLead";
    const SUBAGENT_SELECTION_NS = "subagent-model-selection-settings";
    const inject = ["slots", "configForms", "locale", "remote", "remote.session"];

    // The settings shell already supplies the card frame and footer; these
    // rules only lay out our fields inside it, using the same design tokens as
    // the first-party settings pages.
    const css = `
.pl-page{display:grid;gap:16px;min-width:0}
.pl-description{margin:0;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}
.pl-section{display:grid;gap:12px;min-width:0;padding:14px 0}
.pl-section+.pl-section{border-top:.5px solid var(--dsw-alias-border-l3)}
.pl-heading{margin:0;color:var(--dsw-alias-label-primary);font-size:13px;font-weight:600;line-height:1.5}
.pl-section-hint{margin:0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.5}
.pl-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;min-width:0}
.pl-field{display:grid;gap:4px;min-width:0;align-self:start}
.pl-field-full{grid-column:1/-1}
.pl-label{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500;line-height:1.5}
.pl-control{box-sizing:border-box;width:100%;height:32px;padding:0 8px;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-sm);outline:none;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:1.5}
.pl-control:focus{border-color:var(--dsw-alias-state-business-primary)}
.pl-control:disabled{color:var(--dsw-alias-label-dimmed);cursor:default;opacity:.6}
.pl-textarea{height:auto;min-height:96px;padding:6px 8px;resize:vertical;line-height:1.5}
.pl-hint{margin:0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.5}
.pl-error{margin:0;color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:1.5}
.pl-invalid .pl-control{border-color:var(--dsw-alias-state-error-primary)}
.pl-warning{margin:0;color:var(--dsw-alias-state-warn-label);font-size:12px;line-height:1.5}
.pl-toggle{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:2px 0}
.pl-toggle-copy{display:grid;gap:4px;min-width:0}
.pl-inline{display:flex;align-items:center;gap:8px;max-width:100%}
.pl-retry{padding:0;border:0;background:0 0;color:var(--dsw-alias-brand-primary);cursor:pointer;font:inherit;font-size:12px;line-height:1.5}
.pl-retry:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}
@media (max-width:720px){.pl-grid{grid-template-columns:1fr}}
`;
    const tagId = "dsh-project-lead/settings.css";
    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
      const tag = document.createElement("style");
      tag.dataset.plugin = "dsh-project-lead";
      tag.dataset.pluginCss = tagId;
      tag.textContent = css;
      document.head.appendChild(tag);
    }

    const en = {
      nav: "Project Lead",
      description:
        "Configure prompt scope, the default subagent route, and model notes. Project facts come from AGENTS.md, README, and project skills; the PM can read them or dispatch a Scout. The PM prompt is preset-scoped; Standard sessions keep their tools and get only lightweight guidance.",
      prompts: "Prompt scope",
      promptsHint: "compact/full apply only to the PM preset; other presets use the other-session prompt.",
      main: "Main prompt",
      mainHint: "compact adds the PM core and checklist; full adds the stage contracts.",
      pmPreset: "PM preset id",
      pmPresetHint: "Only this preset receives the PM prompt; empty means every top-level session.",
      otherMain: "Other sessions",
      otherMainHint: "Prompt for Standard and other presets.",
      childRoles: "Inject child role prompts",
      childRolesHint: "Use executor / reviewer / scout from the ROLE: line.",
      defaultChildRole: "Default child role",
      defaultChildRoleHint: "Used when the brief has no ROLE: line.",
      roleMarker: "Role marker",
      roleMarkerHint: "Default ROLE; a trailing colon is removed.",
      dir: "Custom prompt directory",
      dirHint: "Optional; use the same 00-08 filenames.",
      subagent: "Subagent default",
      subagentHint:
        "The PM is told to pass this route explicitly on every subagent call. Save also updates the Subagent allow-list unless disabled below.",
      model: "Subagent model",
      modelHint: "Loaded from the Host model catalog.",
      modelUnset: "Not configured (the PM chooses an authorized route)",
      effort: "Reasoning effort",
      effortDefault: "Default (model decides)",
      allowList: "Also add this route to the Subagent allow-list",
      allowListHint: "Required for model-selected subagents. Turn off if you manage the allow-list yourself.",
      loading: "Loading models…",
      loadFailed: "Models could not be loaded.",
      retry: "Retry",
      empty: "No provider currently advertises a model.",
      partial: "Some providers could not be loaded; saved choices remain removable.",
      unavailable: "currently unavailable",
      advanced: "Model notes",
      advancedHint: "Optional routing cheat-sheet for the PM; it does not authorize models.",
      modelNotes: "Model notes (JSON)",
      modelNotesHint: "Keys are provider/model; values may include description / strengths / weaknesses. Empty means no notes are injected.",
      invalidJson: "Enter a JSON object.",
      partialRoute: "Choose both provider and model, or leave both empty.",
      save: "Save",
      saving: "Saving…",
      saveFailed: "The deployment did not accept these values.",
      readOnly: "This deployment stores settings read-only.",
      settingsUnavailable: "This plugin is not mounted, so it cannot be configured right now.",
      saved: "Saved.",
      allowListFailed:
        "Settings saved, but the Subagent allow-list could not be updated; add the route in Subagent settings."
    };
    const zh = {
      nav: "项目编排",
      description:
        "配置提示词模式、子 Agent 默认路由和模型备注。项目事实以 AGENTS.md、README 和项目 skill 为准；主 Agent 可以直接 read，或派 Scout。PM 提示只在配置的 preset 中注入；Standard 会话保留自己的工具，只收到轻量提示。",
      prompts: "提示词模式",
      promptsHint: "compact/full 只作用于 PM preset；其他 preset 使用“其他会话提示”。",
      main: "主 Agent 提示",
      mainHint: "compact 注入 PM 核心和阶段清单；full 再加阶段契约。",
      pmPreset: "PM preset id",
      pmPresetHint: "只有这个 preset 的会话注入 PM 提示；留空 = 所有顶层会话。",
      otherMain: "其他会话提示",
      otherMainHint: "Standard 等非 PM preset 使用的提示。",
      childRoles: "为子 Agent 注入角色提示",
      childRolesHint: "根据 ROLE: 行注入 executor / reviewer / scout。",
      defaultChildRole: "默认子角色",
      defaultChildRoleHint: "简报没有 ROLE: 时使用。",
      roleMarker: "角色标记",
      roleMarkerHint: "默认 ROLE；末尾冒号会被移除。",
      dir: "自定义提示词目录",
      dirHint: "可选；使用同名 00-08 文件。",
      subagent: "子 Agent 默认",
      subagentHint:
        "PM 会被要求每次派发都显式传入这个路由。保存时还会把该路由加入 Subagent 允许列表，除非在下方关闭。",
      model: "子 Agent 模型",
      modelHint: "从 Host 模型目录加载。",
      modelUnset: "未配置（由 PM 选择授权路由）",
      effort: "思考等级",
      effortDefault: "默认（由模型决定）",
      allowList: "同时加入 Subagent 允许列表",
      allowListHint: "模型选择需要该路由在允许列表中；如果你自己维护允许列表，可以关闭。",
      loading: "正在加载模型…",
      loadFailed: "模型目录加载失败。",
      retry: "重试",
      empty: "当前没有 provider 声明可用模型。",
      partial: "部分 provider 加载失败；已保存的选择仍会保留。",
      unavailable: "当前不可用",
      advanced: "模型备注",
      advancedHint: "可选：给 PM 的路由 cheat-sheet；不会改变模型授权。",
      modelNotes: "模型备注（JSON）",
      modelNotesHint: "键为 provider/model；值可含 description / strengths / weaknesses。留空则不注入。",
      invalidJson: "请输入 JSON 对象。",
      partialRoute: "provider 和 model 要么都填，要么都留空。",
      save: "保存",
      saving: "保存中…",
      saveFailed: "部署没有接受这些值。",
      readOnly: "此部署的设置为只读。",
      settingsUnavailable: "插件当前未挂载，暂时无法配置。",
      saved: "已保存。",
      allowListFailed: "设置已保存，但 Subagent 允许列表未能更新；请在 Subagent 设置中添加该路由。"
    };

    function asList(value) {
      return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
    }

    function normalize(value) {
      const source = value !== null && typeof value === "object" ? value : {};
      const project = source.project !== null && typeof source.project === "object" ? source.project : {};
      const prompts = source.prompts !== null && typeof source.prompts === "object" ? source.prompts : {};
      const subagent = source.subagent !== null && typeof source.subagent === "object" ? source.subagent : {};
      const modelNotes = source.modelNotes !== null && typeof source.modelNotes === "object" && !Array.isArray(source.modelNotes)
        ? source.modelNotes
        : {};
      return {
        project: {
          name: typeof project.name === "string" ? project.name : "",
          root: typeof project.root === "string" ? project.root : "",
          stack: typeof project.stack === "string" ? project.stack : "",
          verifyCommands: asList(project.verifyCommands),
          allowedPaths: asList(project.allowedPaths),
          forbiddenPaths: asList(project.forbiddenPaths),
          protectedCapabilities: asList(project.protectedCapabilities),
          conventions: asList(project.conventions),
          humanValidation: asList(project.humanValidation),
          notes: typeof project.notes === "string" ? project.notes : ""
        },
        prompts: {
          main: ["compact", "full", "guidance", "off"].includes(prompts.main) ? prompts.main : "compact",
          childRoles: prompts.childRoles !== false,
          defaultChildRole: ["executor", "reviewer", "scout"].includes(prompts.defaultChildRole)
            ? prompts.defaultChildRole
            : "executor",
          roleMarker: typeof prompts.roleMarker === "string" && prompts.roleMarker.length > 0
            ? prompts.roleMarker
            : "ROLE",
          dir: typeof prompts.dir === "string" ? prompts.dir : "",
          pmPreset: typeof prompts.pmPreset === "string" ? prompts.pmPreset : "pm",
          otherMain: ["guidance", "off"].includes(prompts.otherMain) ? prompts.otherMain : "guidance"
        },
        subagent: {
          provider: typeof subagent.provider === "string" ? subagent.provider : "",
          model: typeof subagent.model === "string" ? subagent.model : "",
          reasoningEffort: typeof subagent.reasoningEffort === "string" ? subagent.reasoningEffort : ""
        },
        modelNotes
      };
    }

    function notesText(notes) {
      return JSON.stringify(notes ?? {}, null, 2);
    }

    function toDraft(value) {
      const normalized = normalize(value);
      return {
        project: normalized.project,
        prompts: normalized.prompts,
        subagent: normalized.subagent,
        modelNotesText: notesText(normalized.modelNotes)
      };
    }

    function sameValue(left, right) {
      return JSON.stringify(left) === JSON.stringify(right);
    }

    function routeKey(provider, model) {
      return JSON.stringify([provider, model]);
    }

    function parseRouteKey(value) {
      try {
        const parsed = JSON.parse(value);
        if (!Array.isArray(parsed) || parsed.length !== 2) return undefined;
        if (typeof parsed[0] !== "string" || typeof parsed[1] !== "string") return undefined;
        return { provider: parsed[0], model: parsed[1] };
      } catch {
        return undefined;
      }
    }

    function SectionBlock({ title, hint, children }) {
      return h("section", { className: "pl-section" }, [
        h("h3", { className: "pl-heading", key: "heading" }, title),
        hint ? h("p", { className: "pl-section-hint", key: "hint" }, hint) : null,
        h("div", { className: "pl-grid", key: "body" }, children)
      ]);
    }

    function TextField({ id, label, hint, value, onChange, disabled, invalid, placeholder }) {
      return h(SettingsValueField, {
        id,
        label,
        hint,
        text: value ?? "",
        placeholder: placeholder ?? "",
        disabled,
        invalid: invalid === true,
        overridden: false,
        numeric: false,
        onEdit: onChange
      });
    }

    function AreaField({ id, label, hint, value, onChange, disabled, invalid, rows = 6 }) {
      return h("div", { className: `pl-field pl-field-full${invalid ? " pl-invalid" : ""}` }, [
        h("label", { className: "pl-label", htmlFor: id }, label),
        h("textarea", {
          id,
          className: "pl-control pl-textarea",
          value: value ?? "",
          rows,
          disabled,
          "aria-invalid": invalid === true ? "true" : undefined,
          onChange: (event) => onChange(event.target.value)
        }),
        hint ? h("p", { className: invalid ? "pl-error" : "pl-hint" }, hint) : null
      ]);
    }

    function SelectField({ id, label, hint, value, onChange, disabled, children }) {
      return h("div", { className: "pl-field" }, [
        h("label", { className: "pl-label", htmlFor: id }, label),
        h("select", {
          id,
          className: "pl-control",
          value,
          disabled,
          onChange: (event) => onChange(event.target.value)
        }, children),
        hint ? h("p", { className: "pl-hint" }, hint) : null
      ]);
    }

    function SegmentField({ id, label, hint, value, options, onChange, disabled, full }) {
      return h("div", { className: `pl-field${full ? " pl-field-full" : ""}` }, [
        h("span", { className: "pl-label" }, label),
        h(SegmentedControl, { id, label, value, options, onChange, disabled }),
        hint ? h("p", { className: "pl-hint" }, hint) : null
      ]);
    }

    function ToggleField({ label, hint, checked, onChange, disabled }) {
      return h("div", { className: "pl-toggle" }, [
        h("div", { className: "pl-toggle-copy", key: "copy" }, [
          h("span", { className: "pl-label", key: "label" }, label),
          hint ? h("p", { className: "pl-hint", key: "hint" }, hint) : null
        ]),
        h(Switch, {
          key: "switch",
          checked,
          label,
          disabled,
          onChange
        })
      ]);
    }

    function Section(props) {
      let scope;
      try {
        scope = props.ctx.configForms.get(NS);
      } catch {
        scope = undefined;
      }
      if (!scope) return h("p", { className: "pl-hint" }, props.t("settingsUnavailable"));
      return h(SectionBody, { ...props, scope });
    }

    function SectionBody(props) {
      const { scope, t, ctx } = props;
      const subscribe = useCallback((listener) => scope.subscribe(listener), [scope]);
      const getSnapshot = useCallback(() => scope.getSnapshot(), [scope]);
      const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
      const [draft, setDraft] = useState(() => toDraft(snapshot.value));
      const [saving, setSaving] = useState(false);
      const [failed, setFailed] = useState(false);
      const [notice, setNotice] = useState("");
      const [allowList, setAllowList] = useState(true);
      const [catalog, setCatalog] = useState({ status: "loading", groups: [], error: null, partial: false });

      useEffect(() => {
        setDraft(toDraft(snapshot.value));
        setFailed(false);
      }, [snapshot.revision, snapshot.value]);

      const loadCatalog = useCallback(async () => {
        setCatalog((current) => ({ ...current, status: "loading", error: null }));
        try {
          if (!ctx.remote?.session?.modelCatalog) throw new Error(t("loadFailed"));
          const response = await ctx.remote.session.modelCatalog();
          if (response?.ok) {
            setCatalog({
              status: "ready",
              groups: Array.isArray(response.value?.groups) ? response.value.groups : [],
              error: null,
              partial: (response.value?.failures?.length ?? 0) > 0
            });
          } else {
            setCatalog({
              status: "error",
              groups: [],
              error: response?.error?.message ?? t("loadFailed"),
              partial: false
            });
          }
        } catch (error) {
          setCatalog({
            status: "error",
            groups: [],
            error: error?.message ?? t("loadFailed"),
            partial: false
          });
        }
      }, [ctx, t]);

      useEffect(() => {
        loadCatalog();
      }, [loadCatalog]);

      useEffect(() => {
        if (typeof ctx.remote?.$on !== "function") return undefined;
        const off = ctx.remote.$on("llm/adapters-updated", loadCatalog);
        return () => {
          if (typeof off === "function") off();
        };
      }, [ctx, loadCatalog]);

      const routes = useMemo(() => {
        const rows = [];
        for (const group of catalog.groups) {
          for (const model of group.models ?? []) {
            const efforts = Array.isArray(model?.reasoning?.efforts) ? model.reasoning.efforts : [];
            rows.push({
              key: routeKey(group.id, model.id),
              provider: group.id,
              model: model.id,
              providerName: group.name ?? group.id,
              modelName: model.name ?? model.id,
              efforts
            });
          }
        }
        return rows;
      }, [catalog.groups]);

      const selectedKey = draft.subagent.provider && draft.subagent.model
        ? routeKey(draft.subagent.provider, draft.subagent.model)
        : "";
      const selectedRoute = routes.find((route) => route.key === selectedKey);
      const routeMissing = selectedKey.length > 0 && selectedRoute === undefined;
      const efforts = selectedRoute?.efforts ?? [];
      const effortValue = draft.subagent.reasoningEffort;
      const effortInRoute = efforts.some((entry) => entry.id === effortValue);
      const partialRoute = (draft.subagent.provider.length > 0) !== (draft.subagent.model.length > 0);

      const snapshotDraft = useMemo(() => toDraft(snapshot.value), [snapshot.value]);
      const dirty = !sameValue(draft, snapshotDraft);
      const notesError = (() => {
        try {
          const parsed = JSON.parse(draft.modelNotesText.trim() === "" ? "{}" : draft.modelNotesText);
          return parsed === null || Array.isArray(parsed) || typeof parsed !== "object";
        } catch {
          return true;
        }
      })();
      const invalid = notesError || partialRoute;
      const available = snapshot.status === "ready";
      const writable = snapshot.writable !== false;
      const disabled = !available || !writable || saving;

      function clearStatus() {
        setFailed(false);
        setNotice("");
      }

      function setPrompt(key, value) {
        clearStatus();
        setDraft((current) => ({ ...current, prompts: { ...current.prompts, [key]: value } }));
      }

      function setSubagent(next) {
        clearStatus();
        setDraft((current) => ({ ...current, subagent: { ...current.subagent, ...next } }));
      }

      function changeModel(value) {
        clearStatus();
        if (value === "") {
          setSubagent({ provider: "", model: "", reasoningEffort: "" });
          return;
        }
        const parsed = parseRouteKey(value);
        if (!parsed) {
          setSubagent({ provider: "", model: "", reasoningEffort: "" });
          return;
        }
        const route = routes.find((entry) => entry.provider === parsed.provider && entry.model === parsed.model);
        const nextEffort = route?.efforts?.some((entry) => entry.id === draft.subagent.reasoningEffort)
          ? draft.subagent.reasoningEffort
          : "";
        setSubagent({
          provider: parsed.provider,
          model: parsed.model,
          reasoningEffort: nextEffort
        });
      }

      async function mergeAllowList(route) {
        try {
          if (typeof ctx.configForms?.get !== "function") return false;
          const form = ctx.configForms.get(SUBAGENT_SELECTION_NS);
          if (!form) return false;
          const selection = form.getSnapshot();
          if (selection.status !== "ready" || selection.writable === false) return false;
          const current = Array.isArray(selection.value?.allowedModels) ? selection.value.allowedModels : [];
          const exists = current.some((entry) =>
            entry?.provider === route.provider && entry?.model === route.model
          );
          const ops = [];
          if (selection.value?.enabled !== true) {
            ops.push({ op: "set", path: ["enabled"], value: true });
          }
          if (!exists) {
            ops.push({
              op: "set",
              path: ["allowedModels"],
              value: [...current, { provider: route.provider, model: route.model }]
            });
          }
          if (ops.length === 0) return true;
          return await form.mutate(ops, selection.revision);
        } catch {
          return false;
        }
      }

      async function save() {
        if (!available || !writable || !dirty || invalid || saving) return;
        setSaving(true);
        setFailed(false);
        setNotice("");
        try {
          let modelNotes;
          try {
            modelNotes = JSON.parse(draft.modelNotesText.trim() === "" ? "{}" : draft.modelNotesText);
          } catch {
            setSaving(false);
            setFailed(true);
            setNotice(t("invalidJson"));
            return;
          }
          if (modelNotes === null || Array.isArray(modelNotes) || typeof modelNotes !== "object") {
            setSaving(false);
            setFailed(true);
            setNotice(t("invalidJson"));
            return;
          }
          const subagent = { ...draft.subagent };
          if (catalog.status === "ready" && selectedRoute !== undefined) {
            const supported = selectedRoute.efforts.some((entry) => entry.id === subagent.reasoningEffort);
            if (!supported) subagent.reasoningEffort = "";
          }
          const ok = await scope.mutate([
            { op: "set", path: ["prompts"], value: draft.prompts },
            { op: "set", path: ["subagent"], value: subagent },
            { op: "set", path: ["modelNotes"], value: modelNotes }
          ], snapshot.revision);
          if (!ok) {
            setFailed(true);
            setNotice(t("saveFailed"));
            return;
          }
          let allowOk = true;
          if (allowList && subagent.provider.length > 0 && subagent.model.length > 0) {
            allowOk = await mergeAllowList(subagent);
          }
          setNotice(allowOk ? t("saved") : t("allowListFailed"));
        } catch {
          setFailed(true);
          setNotice(t("saveFailed"));
        } finally {
          setSaving(false);
        }
      }

      function discard() {
        setDraft(toDraft(snapshot.value));
        setFailed(false);
        setNotice("");
      }

      const labels = {
        unavailable: t("settingsUnavailable"),
        readOnly: t("readOnly"),
        saveFailed: t("saveFailed"),
        save: t("save"),
        saving: t("saving")
      };
      const state = {
        available,
        writable,
        dirty,
        invalid,
        saving,
        failed
      };

      const promptFields = [
        h(SegmentField, {
          key: "main",
          id: "pl-prompt-main",
          label: t("main"),
          hint: t("mainHint"),
          value: draft.prompts.main,
          options: [
            { value: "compact", label: "compact" },
            { value: "full", label: "full" },
            { value: "guidance", label: "guidance" },
            { value: "off", label: "off" }
          ],
          onChange: (value) => setPrompt("main", value),
          disabled: disabled,
          full: true
        }),
        h(TextField, {
          key: "pmPreset",
          id: "pl-prompt-pm-preset",
          label: t("pmPreset"),
          hint: t("pmPresetHint"),
          value: draft.prompts.pmPreset,
          onChange: (value) => setPrompt("pmPreset", value),
          disabled: disabled
        }),
        h(SegmentField, {
          key: "otherMain",
          id: "pl-prompt-other-main",
          label: t("otherMain"),
          hint: t("otherMainHint"),
          value: draft.prompts.otherMain,
          options: [
            { value: "guidance", label: "guidance" },
            { value: "off", label: "off" }
          ],
          onChange: (value) => setPrompt("otherMain", value),
          disabled: disabled
        }),
        h(SegmentField, {
          key: "defaultChildRole",
          id: "pl-prompt-default-role",
          label: t("defaultChildRole"),
          hint: t("defaultChildRoleHint"),
          value: draft.prompts.defaultChildRole,
          options: [
            { value: "executor", label: "executor" },
            { value: "reviewer", label: "reviewer" },
            { value: "scout", label: "scout" }
          ],
          onChange: (value) => setPrompt("defaultChildRole", value),
          disabled: disabled,
          full: true
        }),
        h(TextField, {
          key: "roleMarker",
          id: "pl-prompt-role-marker",
          label: t("roleMarker"),
          hint: t("roleMarkerHint"),
          value: draft.prompts.roleMarker,
          onChange: (value) => setPrompt("roleMarker", value),
          disabled: disabled
        }),
        h(TextField, {
          key: "dir",
          id: "pl-prompt-dir",
          label: t("dir"),
          hint: t("dirHint"),
          value: draft.prompts.dir,
          onChange: (value) => setPrompt("dir", value),
          disabled: disabled
        }),
        h("div", { key: "childRoles", className: "pl-field pl-field-full" },
          h(ToggleField, {
            label: t("childRoles"),
            hint: t("childRolesHint"),
            checked: draft.prompts.childRoles,
            onChange: (value) => setPrompt("childRoles", value),
            disabled: disabled
          })
        )
      ];

      const modelOptions = [
        h("option", { value: "", key: "unset" }, t("modelUnset"))
      ];
      if (routeMissing) {
        modelOptions.push(h("option", { value: selectedKey, key: "missing" },
          `${draft.subagent.provider}/${draft.subagent.model} — ${t("unavailable")}`
        ));
      }
      for (const group of catalog.groups) {
        const models = Array.isArray(group.models) ? group.models : [];
        if (models.length === 0) continue;
        modelOptions.push(h("optgroup", { key: group.id, label: group.name ?? group.id },
          models.map((model) => h("option", {
            key: routeKey(group.id, model.id),
            value: routeKey(group.id, model.id)
          }, model.name ?? model.id))
        ));
      }

      const effortOptions = [
        h("option", { value: "", key: "default" }, t("effortDefault")),
        ...efforts.map((entry) => h("option", { key: entry.id, value: entry.id }, entry.name ?? entry.id))
      ];
      if (!effortInRoute && effortValue.length > 0) {
        effortOptions.push(h("option", { key: "stale", value: effortValue },
          `${effortValue} — ${t("unavailable")}`
        ));
      }

      const subagentFields = [
        h(SelectField, {
          key: "model",
          id: "pl-subagent-model",
          label: t("model"),
          hint: catalog.status === "loading" ? t("loading") : t("modelHint"),
          value: selectedKey,
          onChange: changeModel,
          disabled: disabled || catalog.status === "loading"
        }, modelOptions)
      ];
      if (efforts.length > 0) {
        subagentFields.push(h(SelectField, {
          key: "effort",
          id: "pl-subagent-effort",
          label: t("effort"),
          value: effortValue,
          onChange: (value) => setSubagent({ reasoningEffort: value }),
          disabled: disabled
        }, effortOptions));
      }
      subagentFields.push(h("div", { key: "allow", className: "pl-field pl-field-full" },
        h(ToggleField, {
          label: t("allowList"),
          hint: t("allowListHint"),
          checked: allowList,
          onChange: setAllowList,
          disabled: disabled
        })
      ));

      const catalogNotice = catalog.status === "error"
        ? h("p", { className: "pl-error", key: "catalog-error" }, [
            h("span", { key: "text" }, `${t("loadFailed")} ${catalog.error ? `(${catalog.error})` : ""}`),
            " ",
            h("button", {
              key: "retry",
              type: "button",
              className: "pl-retry",
              disabled: disabled,
              onClick: loadCatalog
            }, t("retry"))
          ])
        : catalog.status === "ready" && routes.length === 0
          ? h("p", { className: "pl-hint", key: "catalog-empty" }, t("empty"))
          : catalog.partial
            ? h("p", { className: "pl-warning", key: "catalog-partial" }, t("partial"))
            : null;

      return h(SettingsForm, {
        labels,
        state,
        onSave: save,
        onDiscard: discard,
        children: h("div", { className: "pl-page" }, [
          h("p", { className: "pl-description", key: "description" }, t("description")),
          notice ? h("p", {
            key: "notice",
            className: failed ? "pl-error" : "pl-hint",
            role: "status"
          }, notice) : null,
          h(SectionBlock, { key: "prompts", title: t("prompts"), hint: t("promptsHint") }, promptFields),
          h(SectionBlock, { key: "subagent", title: t("subagent"), hint: t("subagentHint") }, [
            ...subagentFields,
            partialRoute ? h("p", { className: "pl-error", key: "partial" }, t("partialRoute")) : null,
            catalogNotice
          ].filter(Boolean)),
          h(SectionBlock, { key: "advanced", title: t("advanced"), hint: t("advancedHint") }, [
            h(AreaField, {
              key: "modelNotes",
              id: "pl-model-notes",
              label: t("modelNotes"),
              hint: notesError ? t("invalidJson") : t("modelNotesHint"),
              value: draft.modelNotesText,
              onChange: (value) => {
                clearStatus();
                setDraft((current) => ({ ...current, modelNotesText: value }));
              },
              disabled,
              invalid: notesError,
              rows: 8
            })
          ])
        ])
      });
    }

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(LOCALE_NS, { zh, en }), "project-lead: dictionaries");
      const t = ctx.locale.bind(LOCALE_NS);
      ctx.slots.inject("settings.section", () => {
        ctx.slots.register({
          name: "settings.section",
          id: NS,
          order: 20,
          locale: LOCALE_NS,
          label: () => t("nav")
        }, (props) => h(Section, { ...props, t, ctx }));
      });
    }

    exports.inject = inject;
    exports.apply = apply;
    return module.exports;
  }
});
