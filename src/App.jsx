import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const API = "/api";
const ACTIVE_KEY = "mobileui.activeWorkflowId";
const DRAFT_PREFIX = "mobileui.draft.";
const ASPECT_OPTIONS = [
  ["1:1", "1:1 Square"],
  ["3:2", "3:2 Photo"],
  ["4:3", "4:3 Standard"],
  ["16:9", "16:9 Widescreen"],
  ["21:9", "21:9 Ultrawide"],
  ["2:3", "2:3 Portrait Photo"],
  ["3:4", "3:4 Portrait Standard"],
  ["9:16", "9:16 Portrait Widescreen"],
  ["9:21", "9:21 Portrait Ultrawide"],
];
const QUICK_ASPECTS = ["1:1", "3:2", "16:9", "21:9"];

function App() {
  const [user, setUser] = useState("defaultuser");
  const [workflows, setWorkflows] = useState([]);
  const [activeId, setActiveId] = useState(localStorage.getItem(ACTIVE_KEY) || "");
  const [active, setActive] = useState(null);
  const [values, setValues] = useState({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState({ type: "idle", text: "" });
  const [comfyStatus, setComfyStatus] = useState({ ok: false, text: "检查中..." });
  const [result, setResult] = useState(null);
  const [pendingUpload, setPendingUpload] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const outputPanelRef = useRef(null);

  useEffect(() => {
    boot();
  }, []);

  useEffect(() => {
    if (!activeId) return;
    localStorage.setItem(ACTIVE_KEY, activeId);
    loadWorkflow(activeId);
  }, [activeId]);

  useEffect(() => {
    if (!active?.manifest) return;
    saveDraft(draftKey(user, active.manifest), active.schema, values);
  }, [user, active?.manifest?.id, active?.manifest?.hash, values]);

  const inputFields = useMemo(() => uniqueInputFields(active?.schema?.inputs ?? []), [active]);
  const outputFields = useMemo(() => active?.schema?.outputs ?? [], [active]);
  const activeManifest = active?.manifest;
  const runDisabled = status.type === "busy" || !activeManifest?.valid;
  const filteredWorkflows = workflows.filter((workflow) => {
    const text = `${workflow.title} ${workflow.description} ${(workflow.tags ?? []).join(" ")}`.toLowerCase();
    return text.includes(query.toLowerCase());
  });

  async function boot() {
    await Promise.all([refreshComfyStatus(), loadConfig(), loadWorkflows()]);
  }

  async function loadConfig() {
    try {
      const response = await fetch(`${API}/config`);
      const payload = await response.json();
      setUser(payload.user || "defaultuser");
    } catch {
      setUser("defaultuser");
    }
  }

  async function loadWorkflows(selectId = activeId) {
    try {
      const response = await fetch(`${API}/workflows`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setWorkflows(payload.workflows ?? []);
      const selected = payload.workflows?.find((workflow) => workflow.id === selectId);
      if (selected) {
        setActiveId(selected.id);
        return;
      }
      setPickerOpen(true);
    } catch (error) {
      setStatus({ type: "error", text: error.message });
      setPickerOpen(true);
    }
  }

  async function deleteWorkflow(workflow) {
    if (!workflow) return;
    setStatus({ type: "busy", text: "正在删除 workflow..." });
    try {
      const response = await fetch(`${API}/workflows/${encodeURIComponent(workflow.id)}`, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      if (activeId === workflow.id) {
        localStorage.removeItem(ACTIVE_KEY);
        setActiveId("");
        setActive(null);
        setValues({});
        setResult(null);
      }
      clearDraftsForWorkflow(user, workflow.id);
      setDeleteTarget(null);
      await loadWorkflows(activeId === workflow.id ? "" : activeId);
      setPickerOpen(true);
      setStatus({ type: "ok", text: `已删除：${workflow.title}` });
    } catch (error) {
      setStatus({ type: "error", text: error.message });
    }
  }

  async function refreshComfyStatus() {
    try {
      const response = await fetch(`${API}/comfy/status`);
      const payload = await response.json();
      setComfyStatus({
        ok: payload.ok,
        text: payload.ok ? `ComfyUI 已连接：${payload.comfyUrl}` : `ComfyUI 未连接：${payload.error}`,
      });
    } catch (error) {
      setComfyStatus({ ok: false, text: `服务未连接：${error.message}` });
    }
  }

  async function loadWorkflow(id) {
    setStatus({ type: "busy", text: "正在载入 workflow..." });
    setResult(null);
    try {
      const response = await fetch(`${API}/workflows/${encodeURIComponent(id)}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setActive(payload);
      const key = draftKey(user, payload.manifest);
      setValues(loadDraft(key) ?? defaultValues(payload.schema));
      setStatus({ type: "ok", text: `已选择：${payload.manifest.title}` });
    } catch (error) {
      setStatus({ type: "error", text: error.message });
      setActive(null);
      setValues({});
      setPickerOpen(true);
    }
  }

  function selectWorkflow(id) {
    setActiveId(id);
    setPickerOpen(false);
  }

  async function handleUpload(file) {
    if (!file) return;
    setStatus({ type: "busy", text: "正在导入 workflow..." });
    setPendingUpload(null);
    try {
      const form = new FormData();
      form.append("workflow", file);
      const response = await fetch(`${API}/workflows/upload`, { method: "POST", body: form });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      if (payload.status === "conflict") {
        setPendingUpload({ file, ...payload });
        setStatus({ type: "busy", text: "检测到同名或同 ID workflow，请选择处理方式。" });
        return;
      }
      const workflow = payload.workflow;
      await loadWorkflows(workflow.id);
      selectWorkflow(workflow.id);
      setStatus({ type: "ok", text: payload.status === "exists" ? "已存在，已为你选中。" : "已导入并选中。" });
    } catch (error) {
      setStatus({ type: "error", text: error.message });
    }
  }

  async function resolveUploadConflict(action) {
    if (!pendingUpload) return;
    if (action === "cancel") {
      setPendingUpload(null);
      setStatus({ type: "idle", text: "" });
      return;
    }
    setStatus({ type: "busy", text: action === "overwrite" ? "正在覆盖 workflow..." : "正在增量另存 workflow..." });
    try {
      const form = new FormData();
      form.append("workflow", pendingUpload.file);
      const url =
        action === "overwrite"
          ? `${API}/workflows/${encodeURIComponent(pendingUpload.existing.id)}/overwrite`
          : `${API}/workflows/duplicate`;
      const response = await fetch(url, { method: "POST", body: form });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      const workflow = payload.workflow;
      setPendingUpload(null);
      await loadWorkflows(workflow.id);
      selectWorkflow(workflow.id);
      setStatus({ type: "ok", text: action === "overwrite" ? "已覆盖并选中。" : "已另存并选中。" });
    } catch (error) {
      setStatus({ type: "error", text: error.message });
    }
  }

  async function runWorkflow(event) {
    event.preventDefault();
    if (!active?.workflow || !active?.schema || !activeManifest?.valid) return;
    setStatus({ type: "busy", text: "正在提交 ComfyUI 任务..." });
    setResult(null);

    try {
      const form = new FormData();
      form.append("workflow", JSON.stringify(active.workflow));
      form.append("values", JSON.stringify(serializableValues(active.schema, values)));
      for (const field of inputFields.filter((item) => item.kind === "image")) {
        if (values[field.key] instanceof File) {
          form.append(field.key, values[field.key]);
        }
      }

      const response = await fetch(`${API}/run`, { method: "POST", body: form });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setResult(payload);
      setValues((current) => nextSeedValues(active.schema, current));
      setStatus({ type: "ok", text: "生成完成。" });
    } catch (error) {
      setStatus({ type: "error", text: error.message });
    }
  }

  function resetCurrentDraft() {
    if (!active?.manifest) return;
    localStorage.removeItem(draftKey(user, active.manifest));
    setValues(defaultValues(active.schema));
    setResult(null);
    setStatus({ type: "ok", text: "已恢复这个 workflow 的原始默认值。" });
  }

  function scrollToOutput() {
    outputPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <main className="app-shell">
      <header className="app-bar">
        <div className="brand-block">
          <span className="mark" aria-hidden="true"></span>
          <div>
            <strong>MobileUI Wrapper</strong>
            <small>{user}</small>
          </div>
        </div>
        <div className="active-title">
          <span className="eyebrow">active workflow</span>
          <strong>{activeManifest?.title || "选择 workflow"}</strong>
        </div>
        <div className="connection-state">
          <span className={`lamp ${comfyStatus.ok ? "on" : "off"}`}></span>
          <strong>{comfyStatus.ok ? "online" : "offline"}</strong>
          <button type="button" onClick={refreshComfyStatus} title="刷新连接">刷新</button>
        </div>
      </header>

      <div className="mobile-switcher">
        <button type="button" onClick={() => setPickerOpen(true)}>workflows</button>
        <strong>{activeManifest?.title || "选择 workflow"}</strong>
        <button type="button" onClick={scrollToOutput}>run/output</button>
      </div>

      <div className="layout">
        <aside className="library-panel surface">
          <div className="panel-head">
            <div>
              <span className="section-id">01</span>
              <h2>workflow library</h2>
            </div>
            <button type="button" onClick={() => setPickerOpen(true)}>切换</button>
          </div>
          <div className="tool-row">
            <input value={query} placeholder="搜索 workflow" onChange={(event) => setQuery(event.target.value)} />
            <UploadButton onFile={handleUpload} />
          </div>
          <div className="library-list">
            {filteredWorkflows.map((workflow) => (
              <button
                className={`workflow-card ${workflow.id === activeId ? "active" : ""}`}
                type="button"
                key={workflow.id}
                onClick={() => selectWorkflow(workflow.id)}
              >
                <Cover workflow={workflow} />
                <span className="workflow-card-body">
                  <strong>{workflow.title}</strong>
                  <small>{workflow.description || "未填写介绍"}</small>
                  <span className="tag-row">
                    <span>{workflow.source === "project" ? "项目内置" : "用户上传"}</span>
                    {hasDraft(user, workflow) && <span>已编辑</span>}
                    <span>{workflow.valid ? "可用" : workflow.status}</span>
                  </span>
                </span>
                {workflow.source === "user" && (
                  <span
                    className="delete-chip"
                    role="button"
                    tabIndex={0}
                    onClick={(event) => {
                      event.stopPropagation();
                      setDeleteTarget(workflow);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        event.stopPropagation();
                        setDeleteTarget(workflow);
                      }
                    }}
                  >
                    删除
                  </span>
                )}
              </button>
            ))}
            {filteredWorkflows.length === 0 && <p className="empty-copy">还没有匹配的 workflow。</p>}
          </div>
        </aside>

        <section className="main-panel">
          <section className="workflow-header surface">
            <div>
              <span className="section-id">active workflow</span>
              <h1>{activeManifest?.title || "选择 workflow"}</h1>
              {activeManifest?.description && <p className="subtitle">{activeManifest.description}</p>}
            </div>
            <div className="workflow-actions">
              <button type="button" onClick={() => setPickerOpen(true)}>切换</button>
              {activeManifest && <button type="button" onClick={resetCurrentDraft}>恢复默认</button>}
            </div>
          </section>

          <section className="status-strip surface">
            <div>
              <span className="section-id">comfy status</span>
              <strong>{comfyStatus.ok ? "online" : "offline"}</strong>
              <small>{comfyStatus.text}</small>
            </div>
            <div>
              <span className="section-id">workflow status</span>
              <strong>{activeManifest?.valid ? "可生成" : activeManifest ? "不可生成" : "未选择"}</strong>
              <small>{activeManifest ? (activeManifest.valid ? `${activeManifest.inputCount} 个输入 / ${activeManifest.outputCount} 个输出` : activeManifest.error) : "请先选择或上传 workflow"}</small>
            </div>
            <div>
              <span className="section-id">run state</span>
              <strong>{status.type === "busy" ? "running" : status.type}</strong>
              <small>{status.text || "等待操作"}</small>
            </div>
          </section>

          {!active && (
            <section className="empty-state">
              <button type="button" onClick={() => setPickerOpen(true)}>选择 workflow</button>
              <UploadButton onFile={handleUpload} />
            </section>
          )}

          {active?.schema && (
            <form id="workflow-run-form" className="form-stack" onSubmit={runWorkflow}>
              {inputFields.map((field) => (
                <FieldControl key={field.key} field={field} value={values[field.key]} onChange={(value) => setValues((current) => ({ ...current, [field.key]: value }))} />
              ))}
            </form>
          )}
        </section>

        <aside className="output-panel surface" ref={outputPanelRef}>
          <div className="panel-head">
            <div>
              <span className="section-id">03</span>
              <h2>run / output</h2>
            </div>
          </div>

          {outputFields.length > 0 && (
            <section className="outputs-summary">
              <span>声明输出</span>
              {outputFields.map((field) => (
                <div className="output-item" key={field.key}>
                  <strong>{field.label}</strong>
                  {field.description && <small>{field.description}</small>}
                </div>
              ))}
            </section>
          )}

          {!result && (
            <section className="result-placeholder">
              <span className="section-id">result</span>
              <p>生成完成后，声明输出图片会显示在这里。</p>
            </section>
          )}

          {result && (
            <section className="result-grid">
              {result.outputs.map((output) => (
                <article key={output.key} className="result-group">
                  <h2>{output.label}</h2>
                  {output.images.map((image) => (
                    <img key={`${image.filename}-${image.subfolder}`} src={image.url} alt={output.label} />
                  ))}
                </article>
              ))}
            </section>
          )}
        </aside>
      </div>

      {pickerOpen && (
        <WorkflowPicker
          workflows={filteredWorkflows}
          activeId={activeId}
          query={query}
          setQuery={setQuery}
          user={user}
          onSelect={selectWorkflow}
          onClose={() => setPickerOpen(false)}
          onUpload={handleUpload}
          onDelete={setDeleteTarget}
        />
      )}

      {pendingUpload && (
        <ConflictDialog pending={pendingUpload} onResolve={resolveUploadConflict} />
      )}

      {deleteTarget && (
        <DeleteDialog workflow={deleteTarget} onCancel={() => setDeleteTarget(null)} onConfirm={() => deleteWorkflow(deleteTarget)} />
      )}

      <div className="run-dock">
        <div className="run-dock-inner">
          <button className="run-button" type="submit" form="workflow-run-form" disabled={runDisabled}>
            {status.type === "busy" ? "生成中..." : "开始生成"}
          </button>
        </div>
      </div>
    </main>
  );
}

function WorkflowPicker({ workflows, activeId, query, setQuery, user, onSelect, onClose, onUpload, onDelete }) {
  return (
    <div className="modal-backdrop">
      <section className="workflow-modal">
        <div className="modal-head">
          <div>
            <h2>选择 workflow</h2>
            <small>选择后会自动关闭，已填写内容会按 workflow 保留。</small>
          </div>
          <button type="button" onClick={onClose}>关闭</button>
        </div>
        <div className="picker-tools">
          <input value={query} placeholder="搜索名字、介绍或标签" onChange={(event) => setQuery(event.target.value)} />
          <UploadButton onFile={onUpload} />
        </div>
        <div className="workflow-list">
          {workflows.map((workflow) => (
            <button
              className={`workflow-card ${workflow.id === activeId ? "active" : ""}`}
              type="button"
              key={workflow.id}
              onClick={() => onSelect(workflow.id)}
            >
              <Cover workflow={workflow} />
              <span className="workflow-card-body">
                <strong>{workflow.title}</strong>
                <small>{workflow.description || "未填写介绍"}</small>
                <span className="tag-row">
                  <span>{workflow.source === "project" ? "项目内置" : "用户上传"}</span>
                  {hasDraft(user, workflow) && <span>已编辑</span>}
                  <span>{workflow.valid ? "可用" : workflow.status}</span>
                </span>
              </span>
              {workflow.source === "user" && (
                <span
                  className="delete-chip"
                  role="button"
                  tabIndex={0}
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete(workflow);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      event.stopPropagation();
                      onDelete(workflow);
                    }
                  }}
                >
                  删除
                </span>
              )}
            </button>
          ))}
          {workflows.length === 0 && <p className="empty-copy">还没有 workflow，可以先上传一个。</p>}
        </div>
      </section>
    </div>
  );
}

function DeleteDialog({ workflow, onCancel, onConfirm }) {
  return (
    <div className="modal-backdrop">
      <section className="confirm-modal">
        <h2>删除 workflow</h2>
        <p>确定要删除「{workflow.title}」吗？这个操作会删除库里的 workflow 文件，但不会清理浏览器里其他 workflow 的草稿。</p>
        <div className="confirm-actions">
          <button type="button" className="danger-button" onClick={onConfirm}>确认删除</button>
          <button type="button" onClick={onCancel}>取消</button>
        </div>
      </section>
    </div>
  );
}

function ConflictDialog({ pending, onResolve }) {
  return (
    <div className="modal-backdrop">
      <section className="confirm-modal">
        <h2>发现 workflow 冲突</h2>
        <p>{pending.conflict.message}</p>
        <div className="compare-grid">
          <div>
            <span>已有</span>
            <strong>{pending.existing.title}</strong>
            <small>{pending.existing.version || pending.existing.hash.slice(0, 8)}</small>
          </div>
          <div>
            <span>上传</span>
            <strong>{pending.candidate.title}</strong>
            <small>{pending.candidate.version || pending.candidate.hash.slice(0, 8)}</small>
          </div>
        </div>
        <div className="confirm-actions">
          <button type="button" onClick={() => onResolve("overwrite")}>覆盖</button>
          <button type="button" onClick={() => onResolve("duplicate")}>增量另存</button>
          <button type="button" onClick={() => onResolve("cancel")}>取消</button>
        </div>
      </section>
    </div>
  );
}

function UploadButton({ onFile }) {
  return (
    <label className="upload-button">
      上传
      <input type="file" accept=".json,application/json" onChange={(event) => onFile(event.target.files?.[0])} />
    </label>
  );
}

function Cover({ workflow }) {
  if (workflow.coverUrl) return <img className="cover" src={workflow.coverUrl} alt={workflow.title} />;
  return <span className="cover fallback">{(workflow.title || "W").slice(0, 1).toUpperCase()}</span>;
}

function FieldControl({ field, value, onChange }) {
  if (field.kind === "text") {
    return (
      <label className="field">
        <FieldHeading field={field} />
        <textarea required={field.required} placeholder={field.placeholder} value={value ?? ""} onChange={(event) => onChange(event.target.value)} rows={5} />
      </label>
    );
  }

  if (field.kind === "image") {
    return (
      <label className="field">
        <FieldHeading field={field} />
        <input required={field.required} type="file" accept="image/*" onChange={(event) => onChange(event.target.files?.[0] ?? null)} />
        {value instanceof File && <small>{value.name}</small>}
      </label>
    );
  }

  if (field.kind === "seed") {
    const current = value ?? { seed: field.defaultSeed ?? 0, mode: field.mode ?? "fixed" };
    return (
      <section className="field seed-control">
        <div className="control-top">
          <FieldHeading field={field} />
          <div className="mini-actions">
            <select aria-label={`${field.label} mode`} value={current.mode ?? field.mode} onChange={(event) => onChange({ ...current, mode: event.target.value })}>
              <option value="fixed">fixed</option>
              <option value="randomize">random</option>
              <option value="increment">+1</option>
              <option value="decrement">-1</option>
            </select>
            <button type="button" aria-label="随机 seed" title="随机 seed" onClick={() => onChange({ ...current, seed: Math.floor(Math.random() * Number.MAX_SAFE_INTEGER) })}>#</button>
            <button type="button" aria-label="恢复默认 seed" title="恢复默认 seed" onClick={() => onChange({ seed: field.defaultSeed ?? 0, mode: field.mode ?? "fixed" })}>↻</button>
          </div>
        </div>
        <input className="seed-number" type="number" value={current.seed ?? 0} onChange={(event) => onChange({ ...current, seed: Number(event.target.value) })} />
      </section>
    );
  }

  if (field.kind === "size") {
    const current = value ?? sizeDefault(field);
    return (
      <section className="field size-control">
        <div className="control-top">
          <FieldHeading field={field} />
          <div className="mini-actions">
            <button className={current.mode === "manual" ? "active" : ""} type="button" onClick={() => onChange(resolveSizeValue(field, { ...current, mode: "manual" }))}>宽高</button>
            <button className={current.mode === "aspect_mp" ? "active" : ""} type="button" onClick={() => onChange(resolveSizeValue(field, { ...current, mode: "aspect_mp" }))}>比例</button>
            <button type="button" aria-label="恢复默认尺寸" title="恢复默认尺寸" onClick={() => onChange(sizeDefault(field))}>↻</button>
          </div>
        </div>
        {current.mode === "manual" ? (
          <div className="dimension-stack">
            <CompactStepper label="宽" value={current.width} step={field.step} min={field.minWidth} max={field.maxWidth} onChange={(width) => onChange(resolveSizeValue(field, { ...current, width }))} />
            <CompactStepper label="高" value={current.height} step={field.step} min={field.minHeight} max={field.maxHeight} onChange={(height) => onChange(resolveSizeValue(field, { ...current, height }))} />
          </div>
        ) : (
          <div className="aspect-stack">
            <div className="aspect-row" aria-label="选择画幅比例">
              {visibleAspectOptions(current.aspectRatio).map((optionValue) => {
                const nextAspect = orientAspect(optionValue, aspectOrientation(current.aspectRatio));
                return (
                <button
                  className={baseAspect(current.aspectRatio) === optionValue ? "active" : ""}
                  key={optionValue}
                  type="button"
                  onClick={() => onChange(resolveSizeValue(field, { ...current, aspectRatio: nextAspect }))}
                >
                  {optionValue}
                </button>
                );
              })}
              <button className="orientation-toggle" type="button" onClick={() => onChange(resolveSizeValue(field, { ...current, aspectRatio: toggleAspectOrientation(current.aspectRatio) }))}>
                {aspectOrientation(current.aspectRatio) === "portrait" ? "纵向" : "横向"}
              </button>
            </div>
            <CompactStepper label="MP" value={current.megapixels} step={0.05} min={0.1} max={16} onChange={(megapixels) => onChange(resolveSizeValue(field, { ...current, megapixels }))} />
            <small className="size-readout">{current.width} x {current.height} · {aspectOrientationLabel(current.aspectRatio)}</small>
          </div>
        )}
      </section>
    );
  }

  if (field.kind === "number") {
    const current = value ?? field.defaultValue ?? 0;
    return (
      <label className="field">
        <FieldHeading field={field} />
        {field.display === "slider" && <input type="range" min={field.min} max={field.max} step={field.step} value={current} onChange={(event) => onChange(resolveNumberValue(field, Number(event.target.value)))} />}
        {field.display === "stepper" ? (
          <Stepper label={field.numberType} value={current} step={field.step} min={field.min} max={field.max} onChange={(next) => onChange(resolveNumberValue(field, next))} />
        ) : (
          <input type="number" min={field.min} max={field.max} step={field.step} value={current} onChange={(event) => onChange(resolveNumberValue(field, Number(event.target.value)))} />
        )}
      </label>
    );
  }

  if (field.kind === "select") {
    return (
      <label className="field">
        <FieldHeading field={field} />
        <select required={field.required} value={value ?? field.defaultValue ?? ""} onChange={(event) => onChange(event.target.value)}>
          {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </label>
    );
  }

  if (["vae_selector", "sampler_selector", "scheduler_selector"].includes(field.kind)) {
    return <OptionField field={field} value={value ?? simpleDefault(field)} onChange={onChange} />;
  }

  if (field.kind === "clip_selector") {
    const current = value ?? { clipName: field.defaultClipName, type: field.defaultType, device: field.defaultDevice };
    return (
      <OptionField field={field} value={current.clipName} onChange={(clipName) => onChange({ ...current, clipName })}>
        <select value={current.type} onChange={(event) => onChange({ ...current, type: event.target.value })}>
          {field.clipTypes.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select value={current.device} onChange={(event) => onChange({ ...current, device: event.target.value })}>
          {field.devices.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </OptionField>
    );
  }

  if (field.kind === "diffusion_model_selector") {
    const current = value ?? { unetName: field.defaultUnetName, weightDtype: field.defaultWeightDtype };
    return (
      <OptionField field={field} value={current.unetName} onChange={(unetName) => onChange({ ...current, unetName })}>
        <select value={current.weightDtype} onChange={(event) => onChange({ ...current, weightDtype: event.target.value })}>
          {field.weightDtypes.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </OptionField>
    );
  }

  return null;
}

function OptionField({ field, value, onChange, children }) {
  const { options, loading, error, refresh } = useFieldOptions(field);
  const [query, setQuery] = useState("");
  const filtered = options.filter((option) => option.toLowerCase().includes(query.toLowerCase()));
  const groups = groupOptions(filtered, value);
  const missing = value && options.length > 0 && !options.includes(value);

  return (
    <label className="field">
      <FieldHeading field={field} />
      <div className="option-tools">
        <input placeholder="搜索..." value={query} onChange={(event) => setQuery(event.target.value)} />
        <button type="button" onClick={refresh}>刷新</button>
      </div>
      {error && <small className="warning">{error}</small>}
      {loading && <small>读取选项中...</small>}
      {missing && <small className="warning">当前默认值不在列表中，请重新选择：{value}</small>}
      <select required={field.required} value={value ?? ""} onChange={(event) => onChange(event.target.value)}>
        <option value="">请选择</option>
        {groups.map((group) => (
          <optgroup key={group.name} label={group.name}>
            {group.options.map((option) => <option key={option} value={option}>{option}</option>)}
          </optgroup>
        ))}
      </select>
      {children}
    </label>
  );
}

function useFieldOptions(field) {
  const [state, setState] = useState({ options: [], loading: false, error: "" });

  async function load() {
    if (!field.modelFolder && !field.objectInfoNode) {
      setState({ options: field.options ?? [], loading: false, error: "" });
      return;
    }
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      if (field.modelFolder) {
        const response = await fetch(`${API}/comfy/models/${field.modelFolder}`);
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error);
        setState({ options: payload.models ?? [], loading: false, error: "" });
        return;
      }
      const response = await fetch(`${API}/comfy/object-info/${field.objectInfoNode}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      const options = payload?.[field.objectInfoNode]?.input?.required?.[field.objectInfoInput]?.[0] ?? [];
      setState({ options, loading: false, error: "" });
    } catch (error) {
      setState({ options: [], loading: false, error: error.message });
    }
  }

  useEffect(() => {
    load();
  }, [field.modelFolder, field.objectInfoNode, field.objectInfoInput]);

  return { ...state, refresh: load };
}

function Stepper({ label, value, step, min, max, onChange }) {
  return (
    <div className="stepper">
      <span>{label}</span>
      <button type="button" onClick={() => onChange(clamp(Number(value) - Number(step), min, max))}>-</button>
      <input type="number" value={value} min={min} max={max} step={step} onChange={(event) => onChange(clamp(Number(event.target.value), min, max))} />
      <button type="button" onClick={() => onChange(clamp(Number(value) + Number(step), min, max))}>+</button>
    </div>
  );
}

function CompactStepper({ label, value, step, min, max, onChange }) {
  return (
    <div className="compact-stepper">
      <span>{label}</span>
      <button type="button" onClick={() => onChange(clamp(Number(value) - Number(step), min, max))}>-</button>
      <input type="number" value={value} min={min} max={max} step={step} onChange={(event) => onChange(clamp(Number(event.target.value), min, max))} />
      <button type="button" onClick={() => onChange(clamp(Number(value) + Number(step), min, max))}>+</button>
    </div>
  );
}

function FieldHeading({ field }) {
  return (
    <span className="field-heading">
      <strong>{field.label}</strong>
      {field.description && <small>{field.description}</small>}
    </span>
  );
}

function aspectOrientation(value) {
  const [width, height] = String(value).split(":").map(Number);
  if (width > height) return "landscape";
  if (height > width) return "portrait";
  return "square";
}

function orientAspect(aspect, orientation) {
  if (aspect === "1:1") return aspect;
  const [width, height] = String(aspect).split(":");
  return orientation === "portrait" ? `${height}:${width}` : `${width}:${height}`;
}

function toggleAspectOrientation(aspect) {
  if (aspect === "1:1") return aspect;
  const [width, height] = String(aspect).split(":");
  return `${height}:${width}`;
}

function baseAspect(aspect) {
  if (aspect === "1:1") return "1:1";
  const [width, height] = String(aspect).split(":").map(Number);
  const landscape = width >= height ? `${width}:${height}` : `${height}:${width}`;
  return QUICK_ASPECTS.includes(landscape) ? landscape : aspect;
}

function visibleAspectOptions(current) {
  const base = baseAspect(current);
  return QUICK_ASPECTS.includes(base) ? QUICK_ASPECTS : [...QUICK_ASPECTS, current];
}

function aspectOrientationLabel(value) {
  const orientation = aspectOrientation(value);
  if (orientation === "landscape") return "横向";
  if (orientation === "portrait") return "纵向";
  return "方形";
}

function defaultValues(schema) {
  const next = {};
  for (const field of schema.inputs ?? []) {
    if (field.kind === "text") next[field.key] = field.defaultValue ?? "";
    if (field.kind === "image") next[field.key] = null;
    if (field.kind === "seed") next[field.key] = { seed: field.defaultSeed ?? 0, mode: field.mode ?? "fixed" };
    if (field.kind === "size") next[field.key] = sizeDefault(field);
    if (field.kind === "number") next[field.key] = field.defaultValue ?? 0;
    if (field.kind === "select") next[field.key] = field.defaultValue ?? field.options?.[0] ?? "";
    if (field.kind === "vae_selector") next[field.key] = field.defaultValue ?? "";
    if (field.kind === "sampler_selector") next[field.key] = field.defaultSamplerName ?? "";
    if (field.kind === "scheduler_selector") next[field.key] = field.defaultScheduler ?? "";
    if (field.kind === "clip_selector") next[field.key] = { clipName: field.defaultClipName ?? "", type: field.defaultType ?? "stable_diffusion", device: field.defaultDevice ?? "default" };
    if (field.kind === "diffusion_model_selector") next[field.key] = { unetName: field.defaultUnetName ?? "", weightDtype: field.defaultWeightDtype ?? "default" };
  }
  return next;
}

function uniqueInputFields(fields) {
  const seen = new Set();
  const result = [];
  for (const field of fields) {
    const key = `${field.kind}:${field.key}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(field);
  }
  return result;
}

function serializableValues(schema, values) {
  const next = {};
  for (const field of schema.inputs ?? []) {
    if (field.kind !== "image") next[field.key] = values[field.key];
  }
  return next;
}

function simpleDefault(field) {
  if (field.kind === "vae_selector") return field.defaultValue ?? "";
  if (field.kind === "sampler_selector") return field.defaultSamplerName ?? "";
  if (field.kind === "scheduler_selector") return field.defaultScheduler ?? "";
  return "";
}

function sizeDefault(field) {
  return resolveSizeValue(field, {
    mode: field.mode ?? "manual",
    width: field.defaultWidth,
    height: field.defaultHeight,
    aspectRatio: field.defaultAspectRatio,
    megapixels: field.defaultMegapixels,
  });
}

function resolveSizeValue(field, value) {
  const step = Number(field.step || 8);
  const mode = value.mode ?? "manual";
  if (mode === "aspect_mp") {
    const aspectRatio = value.aspectRatio ?? field.defaultAspectRatio ?? "1:1";
    const megapixels = clamp(Number(value.megapixels ?? field.defaultMegapixels ?? 1), 0.1, 16);
    const [rw, rh] = aspectRatio.split(":").map(Number);
    const pixels = megapixels * 1000000;
    const rawWidth = Math.sqrt((pixels * rw) / rh);
    const rawHeight = rawWidth * (rh / rw);
    return {
      mode,
      aspectRatio,
      megapixels,
      width: clamp(snap(rawWidth, step), field.minWidth, field.maxWidth),
      height: clamp(snap(rawHeight, step), field.minHeight, field.maxHeight),
    };
  }
  return {
    mode: "manual",
    aspectRatio: value.aspectRatio ?? field.defaultAspectRatio ?? "1:1",
    megapixels: Number(value.megapixels ?? field.defaultMegapixels ?? 1),
    width: clamp(snap(value.width ?? field.defaultWidth ?? 1024, step), field.minWidth, field.maxWidth),
    height: clamp(snap(value.height ?? field.defaultHeight ?? 1024, step), field.minHeight, field.maxHeight),
  };
}

function resolveNumberValue(field, value) {
  const clamped = clamp(value, field.min, field.max);
  return field.numberType === "int" ? Math.trunc(clamped) : clamped;
}

function groupOptions(options, selected) {
  const ordered = selected && options.includes(selected) ? [selected, ...options.filter((item) => item !== selected)] : options;
  const groups = new Map();
  for (const option of ordered) {
    const group = option.includes("/") || option.includes("\\") ? option.split(/[\\/]/)[0] : "Models";
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(option);
  }
  return [...groups.entries()].map(([name, groupOptions]) => ({ name, options: groupOptions }));
}

function draftKey(user, workflow) {
  return `${DRAFT_PREFIX}${user}.${workflow.id}.${workflow.hash}`;
}

function loadDraft(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}

function saveDraft(key, schema, values) {
  const clean = {};
  for (const field of schema?.inputs ?? []) {
    clean[field.key] = values[field.key] instanceof File ? null : values[field.key];
  }
  localStorage.setItem(key, JSON.stringify(clean));
}

function hasDraft(user, workflow) {
  return Boolean(localStorage.getItem(draftKey(user, workflow)));
}

function clearDraftsForWorkflow(user, workflowId) {
  const prefix = `${DRAFT_PREFIX}${user}.${workflowId}.`;
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index);
    if (key?.startsWith(prefix)) localStorage.removeItem(key);
  }
}

function snap(value, step) {
  return Math.max(step, Math.round(Number(value) / step) * step);
}

function clamp(value, min = -Infinity, max = Infinity) {
  return Math.min(Math.max(Number(value), Number(min)), Number(max));
}

function nextSeedValues(schema, values) {
  const next = { ...values };
  for (const field of schema.inputs ?? []) {
    if (field.kind !== "seed") continue;
    const current = next[field.key] ?? { seed: field.defaultSeed ?? 0, mode: field.mode ?? "fixed" };
    const seed = Number(current.seed ?? field.defaultSeed ?? 0);
    const mode = current.mode ?? field.mode ?? "fixed";
    if (mode === "increment") next[field.key] = { ...current, seed: seed + 1 };
    if (mode === "decrement") next[field.key] = { ...current, seed: Math.max(0, seed - 1) };
    if (mode === "randomize") next[field.key] = { ...current, seed: Math.floor(Math.random() * Number.MAX_SAFE_INTEGER) };
  }
  return next;
}

createRoot(document.getElementById("root")).render(<App />);
