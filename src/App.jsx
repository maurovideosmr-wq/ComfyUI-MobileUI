import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const API = "/api";
const ACTIVE_KEY = "mobileui.activeWorkflowId";
const DRAFT_PREFIX = "mobileui.draft.";
const HISTORY_LIMIT = 20;
const COMPARE_LIMIT = 2;
const LORA_PATTERN = /<lora:([^:>]+):([-+]?\d*\.?\d+)(?::([-+]?\d*\.?\d+))?>/gi;
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
  const [outputTab, setOutputTab] = useState("current");
  const [historyFilters, setHistoryFilters] = useState({ sort: "newest", favorite: false, outputKey: "" });
  const [history, setHistory] = useState({ runs: [], nextCursor: "", loading: false, error: "" });
  const [selectedImages, setSelectedImages] = useState({});
  const [compareImages, setCompareImages] = useState([]);
  const [previewImage, setPreviewImage] = useState(null);
  const [mobileView, setMobileView] = useState("params");

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

  useEffect(() => {
    if (!active?.manifest?.id) {
      setHistory({ runs: [], nextCursor: "", loading: false, error: "" });
      return;
    }
    loadHistory({ reset: true, workflowId: active.manifest.id });
  }, [active?.manifest?.id, historyFilters.sort, historyFilters.favorite, historyFilters.outputKey]);

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
    setSelectedImages({});
    setCompareImages([]);
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
      form.append("workflowId", activeManifest.id);
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
      setOutputTab("current");
      setMobileView("output");
      setValues((current) => nextSeedValues(active.schema, current));
      await loadHistory({ reset: true, workflowId: activeManifest.id });
      setStatus({ type: "ok", text: "生成完成。" });
    } catch (error) {
      setStatus({ type: "error", text: error.message });
    }
  }

  async function loadHistory({ reset = false, workflowId = activeManifest?.id } = {}) {
    if (!workflowId) return;
    setHistory((current) => ({ ...current, loading: true, error: "" }));
    try {
      const params = new URLSearchParams({
        limit: String(HISTORY_LIMIT),
        sort: historyFilters.sort,
      });
      if (!reset && history.nextCursor) params.set("cursor", history.nextCursor);
      if (historyFilters.favorite) params.set("favorite", "true");
      if (historyFilters.outputKey) params.set("outputKey", historyFilters.outputKey);
      const response = await fetch(`${API}/workflows/${encodeURIComponent(workflowId)}/runs?${params.toString()}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setHistory((current) => ({
        runs: reset ? payload.runs ?? [] : [...current.runs, ...(payload.runs ?? [])],
        nextCursor: payload.nextCursor || "",
        loading: false,
        error: "",
      }));
    } catch (error) {
      setHistory((current) => ({ ...current, loading: false, error: error.message }));
    }
  }

  async function toggleFavorite(image, favorite) {
    if (!activeManifest?.id) return;
    try {
      const response = await fetch(`${API}/workflows/${encodeURIComponent(activeManifest.id)}/runs/${encodeURIComponent(image.runId)}/images/${encodeURIComponent(image.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favorite }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      updateRunInState(payload.run);
    } catch (error) {
      setStatus({ type: "error", text: error.message });
    }
  }

  async function deleteRun(run) {
    if (!activeManifest?.id || !window.confirm(`删除这次生成记录？${run.createdAt}`)) return;
    try {
      const response = await fetch(`${API}/workflows/${encodeURIComponent(activeManifest.id)}/runs/${encodeURIComponent(run.id)}`, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setHistory((current) => ({ ...current, runs: current.runs.filter((item) => item.id !== run.id) }));
      setSelectedImages((current) => Object.fromEntries(Object.entries(current).filter(([, ref]) => ref.runId !== run.id)));
      setCompareImages((current) => current.filter((image) => image.runId !== run.id));
      setPreviewImage((current) => (current?.runId === run.id ? null : current));
      if (result?.run?.id === run.id) setResult(null);
      setStatus({ type: "ok", text: "已删除生成记录。" });
    } catch (error) {
      setStatus({ type: "error", text: error.message });
    }
  }

  function updateRunInState(run) {
    setResult((current) => {
      if (!current?.run || current.run.id !== run.id) return current;
      return { ...current, run, outputs: run.outputs };
    });
    setHistory((current) => ({
      ...current,
      runs: current.runs.map((item) => (item.id === run.id ? mergeRunSummary(item, run) : item)),
    }));
    setCompareImages((current) => current.map((image) => findRunImage(run, image.id) ?? image));
  }

  function toggleSelectedImage(image) {
    const key = imageRefKey(image);
    setSelectedImages((current) => {
      const next = { ...current };
      if (next[key]) delete next[key];
      else next[key] = { runId: image.runId, imageId: image.id };
      return next;
    });
  }

  function toggleCompareImage(image) {
    const key = imageRefKey(image);
    setCompareImages((current) => {
      if (current.some((item) => imageRefKey(item) === key)) {
        return current.filter((item) => imageRefKey(item) !== key);
      }
      if (current.length >= COMPARE_LIMIT) {
        setStatus({ type: "error", text: `最多选择 ${COMPARE_LIMIT} 张图进行对比。` });
        return current;
      }
      return [...current, image];
    });
    setOutputTab("compare");
  }

  async function downloadSelectedImages() {
    const refs = Object.values(selectedImages);
    if (!activeManifest?.id || refs.length === 0) {
      setStatus({ type: "error", text: "请先在历史里选择要下载的图片。" });
      return;
    }
    await downloadZip({ imageRefs: refs });
  }

  async function downloadAllHistoryImages() {
    await downloadZip({
      all: true,
      sort: historyFilters.sort,
      favorite: historyFilters.favorite,
      outputKey: historyFilters.outputKey,
    });
  }

  async function downloadZip(body) {
    if (!activeManifest?.id) return;
    try {
      const response = await fetch(`${API}/workflows/${encodeURIComponent(activeManifest.id)}/runs/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error);
      }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") || "";
      downloadBlob(blob, filenameFromDisposition(disposition) || `${activeManifest.id}-outputs.zip`);
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

  return (
    <main className={`app-shell mobile-view-${mobileView}`}>
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
        <button className={mobileView === "params" ? "active" : ""} type="button" onClick={() => setMobileView("params")}>参数</button>
        <strong>{activeManifest?.title || "选择 workflow"}</strong>
        <button className={mobileView === "output" ? "active" : ""} type="button" onClick={() => setMobileView("output")}>结果</button>
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
                <FieldControl key={field.key} field={field} value={values[field.key]} values={values} fields={inputFields} onChange={(value) => setValues((current) => ({ ...current, [field.key]: value }))} />
              ))}
            </form>
          )}
        </section>

        <aside className="output-panel surface">
          <OutputPanel
            activeManifest={activeManifest}
            outputFields={outputFields}
            result={result}
            outputTab={outputTab}
            setOutputTab={setOutputTab}
            history={history}
            historyFilters={historyFilters}
            setHistoryFilters={setHistoryFilters}
            selectedImages={selectedImages}
            compareImages={compareImages}
            onLoadMore={() => loadHistory()}
            onRefreshHistory={() => loadHistory({ reset: true })}
            onToggleFavorite={toggleFavorite}
            onDeleteRun={deleteRun}
            onToggleSelected={toggleSelectedImage}
            onToggleCompare={toggleCompareImage}
            onPreviewImage={setPreviewImage}
            onDownloadSelected={downloadSelectedImages}
            onDownloadAll={downloadAllHistoryImages}
          />
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

      {previewImage && (
        <ImagePreviewModal image={previewImage} onClose={() => setPreviewImage(null)} />
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

function OutputPanel({
  activeManifest,
  outputFields,
  result,
  outputTab,
  setOutputTab,
  history,
  historyFilters,
  setHistoryFilters,
  selectedImages,
  compareImages,
  onLoadMore,
  onRefreshHistory,
  onToggleFavorite,
  onDeleteRun,
  onToggleSelected,
  onToggleCompare,
  onPreviewImage,
  onDownloadSelected,
  onDownloadAll,
}) {
  const selectedCount = Object.keys(selectedImages).length;
  return (
    <>
      <div className="panel-head output-head">
        <div>
          <span className="section-id">03</span>
          <h2>run / output</h2>
        </div>
        <div className="output-tabs" role="tablist" aria-label="output views">
          {["current", "history", "compare"].map((tab) => (
            <button className={outputTab === tab ? "active" : ""} key={tab} type="button" onClick={() => setOutputTab(tab)}>
              {tab === "current" ? "当前" : tab === "history" ? "历史" : "对比"}
            </button>
          ))}
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

      {outputTab === "current" && (
        <CurrentOutputTab
          result={result}
          onToggleFavorite={onToggleFavorite}
          onToggleCompare={onToggleCompare}
          onPreview={onPreviewImage}
          compareImages={compareImages}
        />
      )}

      {outputTab === "history" && (
        <HistoryOutputTab
          activeManifest={activeManifest}
          outputFields={outputFields}
          history={history}
          filters={historyFilters}
          setFilters={setHistoryFilters}
          selectedImages={selectedImages}
          selectedCount={selectedCount}
          compareImages={compareImages}
          onLoadMore={onLoadMore}
          onRefresh={onRefreshHistory}
          onToggleFavorite={onToggleFavorite}
          onDeleteRun={onDeleteRun}
          onToggleSelected={onToggleSelected}
          onToggleCompare={onToggleCompare}
          onPreview={onPreviewImage}
          onDownloadSelected={onDownloadSelected}
          onDownloadAll={onDownloadAll}
        />
      )}

      {outputTab === "compare" && (
        <CompareOutputTab compareImages={compareImages} onToggleCompare={onToggleCompare} />
      )}
    </>
  );
}

function CurrentOutputTab({ result, onToggleFavorite, onToggleCompare, onPreview, compareImages }) {
  if (!result) {
    return (
      <section className="result-placeholder">
        <span className="section-id">result</span>
        <p>生成完成后，声明输出图片会显示在这里。</p>
      </section>
    );
  }

  return (
    <section className="result-grid">
      <div className="run-meta">
        <strong>{result.run?.createdAt ? formatTime(result.run.createdAt) : "当前结果"}</strong>
        <small>{result.promptId}</small>
      </div>
      {result.outputs.map((output) => (
        <article key={output.key} className="result-group">
          <h2>{output.label}</h2>
          <div className="image-grid current-images">
            {output.images.map((image) => (
              <ImageTile
                image={image}
                key={image.id}
                variant="current"
                compareImages={compareImages}
                onToggleFavorite={onToggleFavorite}
                onToggleCompare={onToggleCompare}
                onPreview={onPreview}
              />
            ))}
          </div>
        </article>
      ))}
    </section>
  );
}

function HistoryOutputTab({
  activeManifest,
  outputFields,
  history,
  filters,
  setFilters,
  selectedImages,
  selectedCount,
  compareImages,
  onLoadMore,
  onRefresh,
  onToggleFavorite,
  onDeleteRun,
  onToggleSelected,
  onToggleCompare,
  onPreview,
  onDownloadSelected,
  onDownloadAll,
}) {
  return (
    <section className="history-panel">
      <div className="history-tools">
        <select value={filters.sort} onChange={(event) => setFilters((current) => ({ ...current, sort: event.target.value }))}>
          <option value="newest">最新优先</option>
          <option value="oldest">最旧优先</option>
        </select>
        <select value={filters.outputKey} onChange={(event) => setFilters((current) => ({ ...current, outputKey: event.target.value }))}>
          <option value="">全部输出</option>
          {outputFields.map((field) => <option key={field.key} value={field.key}>{field.label}</option>)}
        </select>
        <label className="filter-check">
          <input type="checkbox" checked={filters.favorite} onChange={(event) => setFilters((current) => ({ ...current, favorite: event.target.checked }))} />
          收藏
        </label>
      </div>

      <div className="history-actions">
        <button type="button" onClick={onRefresh} disabled={!activeManifest || history.loading}>刷新</button>
        <button type="button" onClick={onDownloadSelected} disabled={selectedCount === 0}>选中 {selectedCount}</button>
        <button type="button" onClick={onDownloadAll} disabled={!activeManifest || history.runs.length === 0}>全部下载</button>
      </div>

      {history.error && <p className="empty-copy">{history.error}</p>}
      {!history.loading && history.runs.length === 0 && <p className="empty-copy">这个 workflow 还没有历史结果。</p>}

      <div className="history-list">
        {history.runs.map((run) => (
          <RunCard
            key={run.id}
            run={run}
            selectedImages={selectedImages}
            compareImages={compareImages}
            onToggleFavorite={onToggleFavorite}
            onDeleteRun={onDeleteRun}
            onToggleSelected={onToggleSelected}
            onToggleCompare={onToggleCompare}
            onPreview={onPreview}
          />
        ))}
      </div>

      {history.nextCursor && (
        <button className="load-more" type="button" onClick={onLoadMore} disabled={history.loading}>
          {history.loading ? "读取中..." : "加载更多"}
        </button>
      )}
      {history.loading && !history.nextCursor && <p className="empty-copy">读取历史中...</p>}
    </section>
  );
}

function RunCard({ run, selectedImages, compareImages, onToggleFavorite, onDeleteRun, onToggleSelected, onToggleCompare, onPreview }) {
  return (
    <article className="run-card">
      <div className="run-card-head">
        <div>
          <strong>{formatTime(run.createdAt)}</strong>
          <small>{run.imageCount} 张 / 收藏 {run.favoriteCount} / 缺失 {run.missingCount}</small>
        </div>
        <button className="danger-button" type="button" onClick={() => onDeleteRun(run)}>删除</button>
      </div>
      <details>
        <summary>参数快照</summary>
        <InputSummary items={run.inputSummary} />
      </details>
      {run.outputs.map((output) => (
        <section className="history-output" key={output.key}>
          <h2>{output.label}</h2>
          <div className="image-grid">
            {output.images.map((image) => (
              <ImageTile
                image={image}
                key={image.id}
                variant="history"
                selected={Boolean(selectedImages[imageRefKey(image)])}
                compareImages={compareImages}
                onToggleSelected={onToggleSelected}
                onToggleFavorite={onToggleFavorite}
                onToggleCompare={onToggleCompare}
                onPreview={onPreview}
              />
            ))}
          </div>
        </section>
      ))}
    </article>
  );
}

function CompareOutputTab({ compareImages, onToggleCompare }) {
  const [mode, setMode] = useState("split");
  const [activeImage, setActiveImage] = useState("A");
  const [splitAxis, setSplitAxis] = useState("vertical");
  const [splitValue, setSplitValue] = useState(50);
  const [opacity, setOpacity] = useState(50);
  const stageRef = useRef(null);

  if (compareImages.length === 0) {
    return (
      <section className="result-placeholder">
        <span className="section-id">compare</span>
        <p>从当前结果或历史里选择 2 张图进行 AB 对比。</p>
      </section>
    );
  }
  if (compareImages.length < 2) {
    const image = compareImages[0];
    return (
      <section className="compare-panel">
        <div className="compare-labels single">
          <span>
            <strong>A</strong>
            <em>{image.filename}</em>
            <button type="button" onClick={() => onToggleCompare(image)}>移出</button>
          </span>
        </div>
        <div className="compare-stage single">
          <img src={image.url} alt={image.filename} />
        </div>
        <p className="empty-copy">再选择 1 张图即可进行 AB 对比。</p>
      </section>
    );
  }

  const [a, b] = compareImages;
  const clipStyle = splitAxis === "vertical"
    ? { clipPath: `inset(0 ${100 - splitValue}% 0 0)` }
    : { clipPath: `inset(0 0 ${100 - splitValue}% 0)` };
  const dividerStyle = splitAxis === "vertical" ? { left: `${splitValue}%` } : { top: `${splitValue}%` };

  function updateSplitFromPointer(event) {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const raw = splitAxis === "vertical"
      ? ((event.clientX - rect.left) / rect.width) * 100
      : ((event.clientY - rect.top) / rect.height) * 100;
    setSplitValue(clamp(raw, 0, 100));
  }

  function startDrag(event) {
    updateSplitFromPointer(event);
    const move = (moveEvent) => updateSplitFromPointer(moveEvent);
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }

  return (
    <section className="compare-panel">
      <div className="compare-labels">
        <span>
          <strong>A</strong>
          <em>{a.filename}</em>
          <button type="button" onClick={() => onToggleCompare(a)}>移出</button>
        </span>
        <span>
          <strong>B</strong>
          <em>{b.filename}</em>
          <button type="button" onClick={() => onToggleCompare(b)}>移出</button>
        </span>
      </div>

      <div className={`compare-stage ${mode} ${splitAxis}`} ref={stageRef} onPointerDown={mode === "split" ? startDrag : undefined}>
        <div className="compare-stage-controls" onPointerDown={(event) => event.stopPropagation()}>
          <div className="segmented compare-mode-control">
            <button className={mode === "toggle" ? "active" : ""} type="button" onClick={() => setMode("toggle")}>A/B</button>
            <button className={mode === "split" ? "active" : ""} type="button" onClick={() => setMode("split")}>分割</button>
            <button className={mode === "fade" ? "active" : ""} type="button" onClick={() => setMode("fade")}>透明</button>
          </div>
          <div className="compare-operation">
            {mode === "toggle" && (
              <div className="segmented">
                <button className={activeImage === "A" ? "active" : ""} type="button" onClick={() => setActiveImage("A")}>A</button>
                <button className={activeImage === "B" ? "active" : ""} type="button" onClick={() => setActiveImage("B")}>B</button>
              </div>
            )}
            {mode === "split" && (
              <>
                <div className="segmented">
                  <button className={splitAxis === "vertical" ? "active" : ""} type="button" onClick={() => setSplitAxis("vertical")}>左右</button>
                  <button className={splitAxis === "horizontal" ? "active" : ""} type="button" onClick={() => setSplitAxis("horizontal")}>上下</button>
                </div>
                <label>
                  <span>{Math.round(splitValue)}%</span>
                  <input type="range" min="0" max="100" value={splitValue} onChange={(event) => setSplitValue(Number(event.target.value))} />
                </label>
              </>
            )}
            {mode === "fade" && (
              <label>
                <span>B {Math.round(opacity)}%</span>
                <input type="range" min="0" max="100" value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} />
              </label>
            )}
          </div>
        </div>
        {mode === "toggle" ? (
          <img src={activeImage === "A" ? a.url : b.url} alt={activeImage === "A" ? a.filename : b.filename} />
        ) : (
          <>
            <img className="compare-image-a" src={a.url} alt={a.filename} />
            <img
              className="compare-image-b"
              src={b.url}
              alt={b.filename}
              style={mode === "fade" ? { opacity: opacity / 100 } : clipStyle}
            />
            {mode === "split" && <span className="compare-divider" style={dividerStyle}></span>}
          </>
        )}
      </div>
    </section>
  );
}

function ImageTile({ image, variant = "history", selected = false, compareImages = [], onToggleSelected, onToggleFavorite, onToggleCompare, onPreview }) {
  const inCompare = compareImages.some((item) => imageRefKey(item) === imageRefKey(image));
  const imageUrl = variant === "current" ? image.url : image.thumbUrl || image.url;
  const canPreview = Boolean(onPreview && !image.missing);
  return (
    <figure className={`image-tile ${variant} ${image.missing ? "missing" : ""}`}>
      {canPreview ? (
        <button className="image-preview-button" type="button" onClick={() => onPreview(image)} aria-label={`预览 ${image.filename}`}>
          <img src={imageUrl} alt={image.filename} loading="lazy" />
        </button>
      ) : (
        <span className="image-preview-static">
          <img src={imageUrl} alt={image.filename} loading="lazy" />
        </span>
      )}
      <figcaption>
        <strong>{image.filename}</strong>
        <small>{image.outputLabel || image.outputKey}</small>
      </figcaption>
      <div className="image-actions">
        {onToggleSelected && (
          <button className={selected ? "active" : ""} type="button" onClick={() => onToggleSelected(image)}>
            {selected ? "已选" : "选择"}
          </button>
        )}
        <button className={image.favorite ? "active" : ""} type="button" onClick={() => onToggleFavorite(image, !image.favorite)}>
          {image.favorite ? "已收藏" : "收藏"}
        </button>
        <button className={inCompare ? "active" : ""} type="button" onClick={() => onToggleCompare(image)}>
          {inCompare ? "对比中" : "对比"}
        </button>
        <a className="button-link" href={image.downloadUrl}>下载</a>
      </div>
      {image.missing && <small className="warning">ComfyUI 原图不可用。</small>}
    </figure>
  );
}

function ImagePreviewModal({ image, onClose }) {
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="image-preview-modal" role="dialog" aria-modal="true" aria-label={`预览 ${image.filename}`} onClick={onClose}>
      <button className="image-preview-close" type="button" onClick={onClose}>关闭</button>
      <figure className="image-preview-frame" onClick={(event) => event.stopPropagation()}>
        <img src={image.url} alt={image.filename} />
        <figcaption>
          <strong>{image.filename}</strong>
          <small>{image.outputLabel || image.outputKey}</small>
        </figcaption>
      </figure>
    </div>
  );
}

function InputSummary({ items = [] }) {
  return (
    <dl className="input-summary">
      {items.map((item) => (
        <div key={`${item.kind}:${item.key}`}>
          <dt>{item.label}</dt>
          <dd>{item.summary || "默认"}</dd>
        </div>
      ))}
    </dl>
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
        <div className="conflict-grid">
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

function FieldControl({ field, value, values, fields, onChange }) {
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

  if (field.kind === "lora_stack") {
    return <LoraStackField field={field} value={value} onChange={onChange} />;
  }

  if (field.kind === "trigger_words_toggle") {
    return <TriggerWordsToggleField field={field} value={value} values={values} fields={fields} onChange={onChange} />;
  }

  return null;
}

function LoraStackField({ field, value, onChange }) {
  const current = normalizeLoraStackValue(field, value);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState({ items: [], loading: false, error: "" });
  const selectedNames = new Set(current.entries.map((entry) => entry.name));
  const activeCount = current.entries.filter((entry) => entry.active !== false).length;
  const allActive = current.entries.length > 0 && activeCount === current.entries.length;

  async function load() {
    setResults((state) => ({ ...state, loading: true, error: "" }));
    try {
      const params = new URLSearchParams({ page: "1", pageSize: "40" });
      if (query.trim()) params.set("search", query.trim());
      const response = await fetch(`${API}/comfy/lm/loras?${params.toString()}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setResults({ items: payload.items ?? [], loading: false, error: "" });
    } catch (error) {
      setResults({ items: [], loading: false, error: error.message });
    }
  }

  useEffect(() => {
    if (!pickerOpen) return;
    const id = setTimeout(load, 180);
    return () => clearTimeout(id);
  }, [pickerOpen, query]);

  useEffect(() => {
    const missing = current.entries.filter((entry) => entry.name && !entry.triggerWordsLoaded);
    if (missing.length === 0) return;
    let cancelled = false;
    Promise.all(missing.map((entry) => loadLoraTriggerWords(entry.name))).then((loaded) => {
      if (cancelled) return;
      const byName = new Map(loaded.map((item) => [item.name, item.triggerWords]));
      const entries = current.entries.map((entry) => (
        byName.has(entry.name)
          ? { ...entry, trainedWords: byName.get(entry.name), triggerWordsLoaded: true }
          : entry
      ));
      onChange({ ...current, entries });
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [current.entries.map((entry) => `${entry.name}:${entry.triggerWordsLoaded ? "1" : "0"}`).join("|")]);

  function updateEntries(entries) {
    onChange({ ...current, entries: limitLoraEntries(field, entries) });
  }

  function addLora(item) {
    const entry = loraItemToEntry(field, item);
    const existing = current.entries.find((candidate) => candidate.name === entry.name);
    const entries = existing
      ? current.entries.map((candidate) => candidate.name === entry.name ? { ...candidate, ...entry, active: true, strength: candidate.strength } : candidate)
      : [...current.entries, entry];
    updateEntries(entries);
    setPickerOpen(false);
  }

  return (
    <section className="field lora-stack-control">
      <div className="control-top">
        <FieldHeading field={field} />
        <div className="mini-actions">
          <button type="button" onClick={() => setPickerOpen(true)}>添加</button>
          <button type="button" disabled={current.entries.length === 0} onClick={() => updateEntries(current.entries.map((entry) => ({ ...entry, active: !allActive })))}>{allActive ? "静音" : "启用"}</button>
          <button type="button" onClick={() => onChange(loraStackDefault(field))}>↻</button>
        </div>
      </div>
      <div className="lora-summary">
        <strong>{activeCount}/{current.entries.length}</strong>
        <span>{formatLoraSyntax(current.entries, field) || "未选择 LoRA"}</span>
      </div>
      <div className="lora-stack-list">
        {current.entries.map((entry, index) => (
          <div className={`lora-row ${entry.active === false ? "muted" : ""}`} key={entry.name}>
            <LoraThumb entry={entry} />
            <div className="lora-row-main">
              <strong>{entry.displayName || entry.name}</strong>
              <small>{entry.baseModel || entry.name}</small>
              {entry.trainedWords?.length > 0 && <small>{entry.trainedWords.join(", ")}</small>}
            </div>
            <div className="lora-row-actions">
              <button type="button" className={entry.active !== false ? "active" : ""} onClick={() => updateEntries(current.entries.map((candidate) => candidate.name === entry.name ? { ...candidate, active: candidate.active === false } : candidate))}>
                {entry.active === false ? "off" : "on"}
              </button>
              <CompactStepper label="w" value={entry.strength} step={field.strengthStep} min={field.minStrength} max={field.maxStrength} onChange={(strength) => updateEntries(current.entries.map((candidate) => candidate.name === entry.name ? { ...candidate, strength } : candidate))} />
              <div className="lora-order-actions">
                <button type="button" disabled={index === 0} onClick={() => updateEntries(moveItem(current.entries, index, index - 1))}>↑</button>
                <button type="button" disabled={index === current.entries.length - 1} onClick={() => updateEntries(moveItem(current.entries, index, index + 1))}>↓</button>
                <button type="button" onClick={() => updateEntries(current.entries.filter((candidate) => candidate.name !== entry.name))}>删</button>
              </div>
            </div>
          </div>
        ))}
        {current.entries.length === 0 && <small className="empty-copy">还没有 LoRA。</small>}
      </div>
      {pickerOpen && (
        <div className="lora-picker-overlay">
          <section className="lora-picker">
            <div className="modal-head">
              <div>
                <h2>选择 LoRA</h2>
                <small>{results.loading ? "读取中..." : `${results.items.length} 个候选`}</small>
              </div>
              <button type="button" onClick={() => setPickerOpen(false)}>关闭</button>
            </div>
            <div className="option-tools">
              <input value={query} placeholder="搜索 LoRA" onChange={(event) => setQuery(event.target.value)} />
              <button type="button" onClick={load}>刷新</button>
            </div>
            {results.error && <small className="warning">{results.error}</small>}
            <div className="lora-result-list">
              {results.items.map((item) => (
                <button className="lora-result" type="button" key={item.name} onClick={() => addLora(item)} disabled={!selectedNames.has(item.name) && current.entries.length >= field.maxLoras}>
                  <LoraThumb entry={item} />
                  <span>
                    <strong>{item.displayName}</strong>
                    <small>{[item.baseModel, item.folder, ...(item.tags ?? []).slice(0, 2)].filter(Boolean).join(" / ") || item.name}</small>
                    {item.trainedWords?.length > 0 && <small>{item.trainedWords.join(", ")}</small>}
                  </span>
                  <em>{selectedNames.has(item.name) ? "已选" : "添加"}</em>
                </button>
              ))}
              {!results.loading && results.items.length === 0 && <p className="empty-copy">没有匹配的 LoRA。</p>}
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

function LoraThumb({ entry }) {
  if (entry.previewUrl) return <img className="lora-thumb" src={entry.previewUrl} alt="" loading="lazy" />;
  return <span className="lora-thumb fallback">{(entry.displayName || entry.name || "L").slice(0, 1).toUpperCase()}</span>;
}

function TriggerWordsToggleField({ field, value, values, fields, onChange }) {
  const current = normalizeTriggerToggleValue(field, value);
  const sourceGroups = triggerGroupsFromLoras(fields, values);
  const groups = mergeTriggerGroups(sourceGroups, current.groups, current.defaultActive);
  const words = mergeTriggerWords(sourceGroups, current.groups, current.defaultActive);

  function update(next) {
    onChange({ ...current, ...next });
  }

  function updateGroup(text, updater) {
    update({ groups: groups.map((group) => group.text === text ? updater(group) : group) });
  }

  function updateWord(text, updater) {
    update({ groups: words.map((word) => word.text === text ? updater(word) : word) });
  }

  return (
    <section className="field trigger-toggle-control">
      <div className="control-top">
        <FieldHeading field={field} />
        <div className="mini-actions">
          <button className={current.groupMode ? "active" : ""} type="button" onClick={() => update({ groupMode: true, groups })}>组</button>
          <button className={!current.groupMode ? "active" : ""} type="button" onClick={() => update({ groupMode: false, groups: words })}>词</button>
          <button type="button" onClick={() => onChange(triggerToggleDefault(field))}>↻</button>
        </div>
      </div>
      {current.groupMode ? (
        <div className="trigger-group-list">
          {groups.map((group) => (
            <div className={`trigger-group ${group.active ? "active" : ""}`} key={group.text}>
              <div className="trigger-group-head">
                <button type="button" onClick={() => updateGroup(group.text, (item) => ({ ...item, active: !item.active }))}>{group.label || group.text}</button>
              </div>
              <div className="trigger-chip-row">
                {group.items.map((item) => (
                  <button className={item.active ? "active" : ""} type="button" key={item.text} disabled={!group.active} onClick={() => updateGroup(group.text, (groupItem) => ({ ...groupItem, items: groupItem.items.map((child) => child.text === item.text ? { ...child, active: !child.active } : child) }))}>
                    {item.text}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="trigger-chip-row flat">
          {words.map((word) => (
            <button className={word.active ? "active" : ""} type="button" key={word.text} onClick={() => updateWord(word.text, (item) => ({ ...item, active: !item.active }))}>
              {word.text}
            </button>
          ))}
        </div>
      )}
      {sourceGroups.length === 0 && <small className="empty-copy">已选 LoRA 没有 trigger words。</small>}
    </section>
  );
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
    if (field.kind === "lora_stack") next[field.key] = loraStackDefault(field);
    if (field.kind === "trigger_words_toggle") next[field.key] = triggerToggleDefault(field);
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

function loraStackDefault(field) {
  return {
    entries: parseLoraSyntaxValue(field.defaultLoraSyntax).map((entry) => ({
      ...entry,
      strength: clamp(entry.strength, field.minStrength, field.maxStrength),
      triggerWordsLoaded: false,
    })),
  };
}

function normalizeLoraStackValue(field, value) {
  const source = value && typeof value === "object" ? value : loraStackDefault(field);
  const entries = Array.isArray(source.entries) ? source.entries : [];
  return {
    entries: limitLoraEntries(field, entries.map((entry) => ({
      name: normalizeLoraName(entry.name),
      displayName: entry.displayName || entry.name || "",
      strength: clamp(Number(entry.strength ?? field.defaultStrength ?? 1), field.minStrength, field.maxStrength),
      active: entry.active !== false,
      previewUrl: entry.previewUrl || "",
      baseModel: entry.baseModel || "",
      folder: entry.folder || "",
      tags: Array.isArray(entry.tags) ? entry.tags : [],
      trainedWords: Array.isArray(entry.trainedWords) ? entry.trainedWords : [],
      triggerWordsLoaded: Boolean(entry.triggerWordsLoaded),
    })).filter((entry) => entry.name)),
  };
}

function parseLoraSyntaxValue(value) {
  const entries = [];
  const text = String(value ?? "");
  LORA_PATTERN.lastIndex = 0;
  let match;
  while ((match = LORA_PATTERN.exec(text)) !== null) {
    entries.push({
      name: normalizeLoraName(match[1]),
      displayName: normalizeLoraName(match[1]),
      strength: Number(match[2]),
      active: true,
    });
  }
  return entries;
}

function limitLoraEntries(field, entries) {
  const seen = new Set();
  const result = [];
  for (const entry of entries) {
    const name = normalizeLoraName(entry.name);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    result.push({
      ...entry,
      name,
      strength: clamp(Number(entry.strength ?? field.defaultStrength ?? 1), field.minStrength, field.maxStrength),
      active: entry.active !== false,
    });
    if (result.length >= field.maxLoras) break;
  }
  return result;
}

function formatLoraSyntax(entries, field) {
  return entries
    .filter((entry) => entry.active !== false)
    .slice(0, field.maxLoras)
    .map((entry) => `<lora:${normalizeLoraName(entry.name)}:${Number(entry.strength ?? field.defaultStrength ?? 1).toFixed(2)}>`)
    .join(" ");
}

function loraItemToEntry(field, item) {
  const trainedWords = Array.isArray(item.trainedWords) ? item.trainedWords : [];
  return {
    name: normalizeLoraName(item.name),
    displayName: item.displayName || item.name,
    strength: clamp(Number(field.defaultStrength ?? 1), field.minStrength, field.maxStrength),
    active: true,
    previewUrl: item.previewUrl || "",
    baseModel: item.baseModel || "",
    folder: item.folder || "",
    tags: Array.isArray(item.tags) ? item.tags : [],
    trainedWords,
    triggerWordsLoaded: trainedWords.length > 0,
  };
}

function normalizeLoraName(value) {
  return String(value ?? "").trim().replace(/\\/g, "/");
}

async function loadLoraTriggerWords(name) {
  const response = await fetch(`${API}/comfy/lm/loras/trigger-words?name=${encodeURIComponent(name)}`);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error);
  return { name, triggerWords: payload.triggerWords ?? [] };
}

function triggerToggleDefault(field) {
  return {
    groupMode: Boolean(field.groupMode),
    defaultActive: Boolean(field.defaultActive),
    allowStrengthAdjustment: false,
    groups: Array.isArray(field.toggleState) ? field.toggleState : [],
  };
}

function normalizeTriggerToggleValue(field, value) {
  const source = value && typeof value === "object" ? value : triggerToggleDefault(field);
  return {
    groupMode: "groupMode" in source ? Boolean(source.groupMode) : Boolean(field.groupMode),
    defaultActive: "defaultActive" in source ? Boolean(source.defaultActive) : Boolean(field.defaultActive),
    allowStrengthAdjustment: false,
    groups: Array.isArray(source.groups) ? source.groups : [],
  };
}

function triggerGroupsFromLoras(fields, values) {
  const groups = [];
  for (const field of fields ?? []) {
    if (field.kind !== "lora_stack") continue;
    const loraValue = normalizeLoraStackValue(field, values[field.key]);
    for (const entry of loraValue.entries) {
      if (entry.active === false || !entry.trainedWords?.length) continue;
      const words = uniqueStrings(entry.trainedWords);
      if (words.length === 0) continue;
      groups.push({
        text: words.join(", "),
        label: entry.displayName || entry.name,
        items: words.map((word) => ({ text: word, active: true })),
        active: true,
      });
    }
  }
  return groups;
}

function mergeTriggerGroups(sourceGroups, savedGroups, defaultActive) {
  if (sourceGroups.length === 0) return sanitizeTriggerGroups(savedGroups);
  const savedMap = triggerStateMap(savedGroups);
  return sourceGroups.map((group) => {
    const saved = savedMap.get(group.text);
    const itemMap = triggerStateMap(saved?.items ?? []);
    return {
      ...group,
      active: saved ? saved.active !== false : defaultActive !== false,
      items: group.items.map((item) => ({
        ...item,
        active: itemMap.has(item.text) ? itemMap.get(item.text).active !== false : true,
      })),
    };
  });
}

function mergeTriggerWords(sourceGroups, savedGroups, defaultActive) {
  const savedMap = triggerStateMap(flattenSavedTriggerItems(savedGroups));
  const words = uniqueStrings(sourceGroups.flatMap((group) => group.items.map((item) => item.text)));
  if (words.length === 0) return sanitizeTriggerGroups(savedGroups);
  return words.map((text) => ({
    text,
    active: savedMap.has(text) ? savedMap.get(text).active !== false : defaultActive !== false,
  }));
}

function flattenSavedTriggerItems(groups) {
  const items = [];
  for (const group of groups ?? []) {
    if (Array.isArray(group.items)) items.push(...group.items);
    else items.push(group);
  }
  return items;
}

function sanitizeTriggerGroups(groups) {
  return (groups ?? [])
    .map((group) => ({
      text: String(group?.text ?? "").trim(),
      label: group?.label || "",
      active: group?.active !== false,
      items: Array.isArray(group?.items) ? group.items.map((item) => ({ text: String(item?.text ?? "").trim(), active: item?.active !== false })).filter((item) => item.text) : [],
    }))
    .filter((group) => group.text);
}

function triggerStateMap(items) {
  const map = new Map();
  for (const item of items ?? []) {
    const text = String(item?.text ?? "").trim();
    if (text) map.set(text, item);
  }
  return map;
}

function uniqueStrings(items) {
  return [...new Set((items ?? []).map((item) => String(item ?? "").trim()).filter(Boolean))];
}

function moveItem(items, fromIndex, toIndex) {
  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
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

function imageRefKey(image) {
  return `${image.runId}:${image.id}`;
}

function mergeRunSummary(summary, run) {
  const images = run.outputs.flatMap((output) => output.images ?? []);
  return {
    ...summary,
    ...run,
    imageCount: images.length,
    favoriteCount: images.filter((image) => image.favorite).length,
    missingCount: images.filter((image) => image.missing).length,
  };
}

function findRunImage(run, imageId) {
  for (const output of run.outputs ?? []) {
    const image = output.images?.find((candidate) => candidate.id === imageId);
    if (image) return image;
  }
  return null;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function filenameFromDisposition(value) {
  const match = String(value || "").match(/filename="?([^"]+)"?/i);
  return match?.[1] || "";
}

function formatTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString();
}

createRoot(document.getElementById("root")).render(<App />);
