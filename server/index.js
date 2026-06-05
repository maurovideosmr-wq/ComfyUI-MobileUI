import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import express from "express";
import multer from "multer";
import { ComfyClient } from "./comfyClient.js";
import { extractDeclaredImages, parseWorkflowSchema, patchWorkflow } from "./mobileUi.js";
import { RunArchive } from "./runArchive.js";
import { WorkflowLibrary, hashWorkflow } from "./workflowLibrary.js";

const PORT = Number(process.env.PORT || 3008);
const COMFYUI_URL = process.env.COMFYUI_URL || "http://127.0.0.1:8188";
const BASIC_AUTH_USER = process.env.BASIC_AUTH_USER || "defaultuser";
const BASIC_AUTH_PASS = process.env.BASIC_AUTH_PASS || "defaultpass";
const upload = multer({ dest: path.join(process.cwd(), ".uploads") });
const app = express();
const comfy = new ComfyClient(COMFYUI_URL);
const distPath = path.join(process.cwd(), "dist");
const workflowLibrary = new WorkflowLibrary({
  rootDir: path.join(process.cwd(), "workflows"),
  exampleDir: path.join(process.cwd(), "example_workflows"),
  user: BASIC_AUTH_USER,
  comfyUrl: COMFYUI_URL,
});
const runArchive = new RunArchive({
  rootDir: path.join(process.cwd(), "runs"),
  user: BASIC_AUTH_USER,
  comfy,
});

app.use(authenticateBasic);
app.use(express.json({ limit: "20mb" }));
app.use(express.static(distPath));

app.get("/api/config", (_req, res) => {
  res.json({ comfyUrl: COMFYUI_URL, user: BASIC_AUTH_USER });
});

app.get("/api/comfy/status", async (_req, res) => {
  try {
    await comfy.status();
    res.json({ ok: true, comfyUrl: COMFYUI_URL });
  } catch (error) {
    res.status(503).json({ ok: false, comfyUrl: COMFYUI_URL, error: error.message });
  }
});

app.get("/api/comfy/models/:folder", async (req, res) => {
  try {
    const allowed = new Set(["vae", "text_encoders", "diffusion_models"]);
    if (!allowed.has(req.params.folder)) {
      res.status(400).json({ error: `不支持的模型目录：${req.params.folder}` });
      return;
    }
    res.json({ folder: req.params.folder, models: await comfy.models(req.params.folder) });
  } catch (error) {
    res.status(503).json({ error: error.message });
  }
});

app.get("/api/comfy/object-info/:nodeClass", async (req, res) => {
  try {
    res.json(await comfy.objectInfo(req.params.nodeClass));
  } catch (error) {
    res.status(503).json({ error: error.message });
  }
});

app.get("/api/comfy/lm/loras", async (req, res) => {
  try {
    const payload = await comfy.loraManagerList(req.query);
    res.json({
      items: (payload.items ?? []).map(publicLoraItem),
      total: payload.total ?? 0,
      page: payload.page ?? 1,
      pageSize: payload.page_size ?? payload.pageSize ?? 30,
      totalPages: payload.total_pages ?? payload.totalPages ?? 1,
    });
  } catch (error) {
    res.status(503).json({ error: error.message });
  }
});

app.get("/api/comfy/lm/loras/trigger-words", async (req, res) => {
  try {
    const name = String(req.query.name || "");
    if (!name) {
      res.status(400).json({ error: "缺少 LoRA 名称。" });
      return;
    }
    const payload = await comfy.loraManagerTriggerWords(name);
    res.json({ name, triggerWords: payload.trigger_words ?? payload.triggerWords ?? [] });
  } catch (error) {
    res.status(503).json({ error: error.message });
  }
});

app.get("/api/comfy/lm/previews", async (req, res) => {
  try {
    const preview = await comfy.loraManagerPreview(req.query);
    res.setHeader("Content-Type", preview.contentType);
    res.send(preview.bytes);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

app.get("/api/workflows", async (_req, res) => {
  try {
    res.json({ workflows: await workflowLibrary.list() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/workflows/:id/cover", async (req, res) => {
  try {
    const cover = await workflowLibrary.cover(req.params.id);
    if (!cover) {
      res.status(404).json({ error: "没有封面。" });
      return;
    }
    if (cover.kind === "file") {
      res.sendFile(path.resolve(cover.path));
      return;
    }
    const response = await fetch(cover.url);
    if (!response.ok) {
      res.status(404).json({ error: "封面不可用。" });
      return;
    }
    res.setHeader("Content-Type", response.headers.get("content-type") || "image/png");
    res.send(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

app.get("/api/workflows/:id", async (req, res) => {
  try {
    res.json(await workflowLibrary.get(req.params.id));
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

app.post("/api/workflows/upload", upload.single("workflow"), async (req, res) => {
  try {
    const workflow = await readWorkflow(req);
    res.json(await workflowLibrary.upload(workflow, req.file?.originalname || "workflow.json"));
  } catch (error) {
    res.status(400).json({ error: error.message });
  } finally {
    cleanupUpload(req.file);
  }
});

app.post("/api/workflows/:id/overwrite", upload.single("workflow"), async (req, res) => {
  try {
    const workflow = await readWorkflow(req);
    res.json({ workflow: await workflowLibrary.overwrite(req.params.id, workflow, req.file?.originalname || "workflow.json") });
  } catch (error) {
    res.status(400).json({ error: error.message });
  } finally {
    cleanupUpload(req.file);
  }
});

app.post("/api/workflows/duplicate", upload.single("workflow"), async (req, res) => {
  try {
    const workflow = await readWorkflow(req);
    res.json({ workflow: await workflowLibrary.duplicate(workflow, req.file?.originalname || "workflow.json") });
  } catch (error) {
    res.status(400).json({ error: error.message });
  } finally {
    cleanupUpload(req.file);
  }
});

app.delete("/api/workflows/:id", async (req, res) => {
  try {
    await workflowLibrary.remove(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/workflows/:id/runs", async (req, res) => {
  try {
    res.json(await runArchive.listRuns(req.params.id, req.query));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/workflows/:id/runs/:runId", async (req, res) => {
  try {
    res.json({ run: await runArchive.getRun(req.params.id, req.params.runId) });
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

app.delete("/api/workflows/:id/runs/:runId", async (req, res) => {
  try {
    await runArchive.deleteRun(req.params.id, req.params.runId);
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.patch("/api/workflows/:id/runs/:runId/images/:imageId", async (req, res) => {
  try {
    const run = await runArchive.setFavorite(req.params.id, req.params.runId, req.params.imageId, req.body?.favorite);
    res.json({ run });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/workflows/:id/runs/:runId/images/:imageId/view", async (req, res) => {
  try {
    const image = await runArchive.cachedImage(req.params.id, req.params.runId, req.params.imageId, req.query.size);
    res.setHeader("Content-Type", image.contentType);
    res.sendFile(path.resolve(image.path));
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

app.get("/api/workflows/:id/runs/:runId/images/:imageId/download", async (req, res) => {
  try {
    const image = await runArchive.cachedImage(req.params.id, req.params.runId, req.params.imageId, "original");
    res.download(path.resolve(image.path), image.filename);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

app.post("/api/workflows/:id/runs/download", async (req, res) => {
  try {
    const zip = await runArchive.zipImages(req.params.id, req.body ?? {});
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${zip.filename}"`);
    zip.stream.pipe(res);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/workflow/schema", upload.single("workflow"), async (req, res) => {
  try {
    const workflow = await readWorkflow(req);
    const schema = parseWorkflowSchema(workflow);
    if (schema.inputs.length === 0 && schema.outputs.length === 0) {
      throw new Error("没有找到 MobileUI 声明节点。");
    }
    res.json({ schema });
  } catch (error) {
    res.status(400).json({ error: error.message });
  } finally {
    cleanupUpload(req.file);
  }
});

app.post("/api/run", upload.any(), async (req, res) => {
  try {
    const workflow = JSON.parse(req.body.workflow || "");
    const workflowId = req.body.workflowId || "";
    const schema = parseWorkflowSchema(workflow);
    const values = JSON.parse(req.body.values || "{}");

    for (const file of req.files ?? []) {
      const comfyName = await comfy.uploadImage(file);
      values[file.fieldname] = comfyName;
    }

    const prompt = patchWorkflow(workflow, schema, values);
    const clientId = crypto.randomUUID();
    const queued = await comfy.queuePrompt(prompt, clientId);
    const promptId = queued.prompt_id;
    const history = await comfy.waitForHistory(promptId);
    const declaredImages = extractDeclaredImages(history, schema.outputs);
    const workflowEntry = workflowId ? await workflowLibrary.find(workflowId) : null;
    const run = await runArchive.createRun({
      workflowId: workflowEntry?.id || workflowId || `adhoc-${hashWorkflow(workflow).slice(0, 8)}`,
      workflowTitle: workflowEntry?.title || workflowId || "adhoc workflow",
      workflowHash: workflowEntry?.hash || hashWorkflow(workflow),
      promptId,
      schema,
      values,
      outputs: declaredImages,
    });

    res.json({
      promptId,
      run,
      outputs: run.outputs,
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  } finally {
    for (const file of req.files ?? []) cleanupUpload(file);
  }
});

app.use((req, res) => {
  if (!req.path.startsWith("/api")) {
    res.sendFile(path.join(distPath, "index.html"));
    return;
  }
  res.status(404).json({ error: `Not found: ${req.method} ${req.path}` });
});

function publicLoraItem(item) {
  const fileName = String(item.file_name || item.name || "").replace(/\.(safetensors|ckpt|pt|bin)$/i, "");
  const folder = String(item.folder || "").replace(/\\/g, "/").replace(/^\/|\/$/g, "");
  const name = folder ? `${folder}/${fileName}` : fileName;
  return {
    name,
    fileName,
    displayName: String(item.model_name || fileName || name),
    folder,
    baseModel: String(item.base_model || ""),
    tags: Array.isArray(item.tags) ? item.tags : [],
    autoTags: Array.isArray(item.auto_tags) ? item.auto_tags : [],
    trainedWords: Array.isArray(item.civitai?.trainedWords) ? item.civitai.trainedWords : [],
    previewUrl: proxiedLoraPreviewUrl(item.preview_url),
    favorite: Boolean(item.favorite),
    nsfwLevel: item.preview_nsfw_level ?? 0,
  };
}

function proxiedLoraPreviewUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(String(value), "http://comfy.local");
    const previewPath = url.searchParams.get("path");
    if (!previewPath) return "";
    return `/api/comfy/lm/previews?path=${encodeURIComponent(previewPath)}`;
  } catch {
    return "";
  }
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Mobile wrapper API: http://127.0.0.1:${PORT}`);
  console.log(`ComfyUI target: ${COMFYUI_URL}`);
});

async function readWorkflow(req) {
  if (req.file) {
    const text = await fs.readFile(req.file.path, "utf8");
    return JSON.parse(text);
  }
  return req.body?.workflow;
}

async function cleanupUpload(file) {
  if (!file?.path) return;
  try {
    await fs.unlink(file.path);
  } catch {
    // Best-effort temp cleanup.
  }
}

function authenticateBasic(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded) {
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    const user = decoded.slice(0, separator);
    const pass = decoded.slice(separator + 1);
    if (safeEqual(user, BASIC_AUTH_USER) && safeEqual(pass, BASIC_AUTH_PASS)) {
      next();
      return;
    }
  }
  res.setHeader("WWW-Authenticate", 'Basic realm="ComfyUI Mobile Wrapper"');
  res.status(401).send("Authentication required");
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}
