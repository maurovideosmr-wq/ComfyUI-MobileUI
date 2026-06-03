import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { isApiWorkflow, parseWorkflowMetadata, parseWorkflowSchema } from "./mobileUi.js";

const USER_SOURCE = "user";
const PROJECT_SOURCE = "project";

export class WorkflowLibrary {
  constructor({ rootDir, exampleDir, user, comfyUrl }) {
    this.rootDir = rootDir;
    this.exampleDir = exampleDir;
    this.user = sanitizeSegment(user || "defaultuser");
    this.comfyUrl = comfyUrl.replace(/\/$/, "");
  }

  async list() {
    const entries = [...(await this.projectEntries()), ...(await this.userEntries())];
    entries.sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
      if (left.source !== right.source) return left.source === USER_SOURCE ? -1 : 1;
      return left.title.localeCompare(right.title);
    });
    return entries.map(publicEntry);
  }

  async get(id) {
    const entry = await this.find(id);
    if (!entry) throw new Error(`workflow 不存在：${id}`);
    return {
      workflow: entry.workflow,
      schema: entry.schema,
      manifest: publicEntry(entry),
    };
  }

  async upload(workflow, fileName) {
    const candidate = this.buildEntry(workflow, {
      source: USER_SOURCE,
      fileName,
    });
    const entries = await this.listInternal();
    const sameHash = entries.find((item) => item.hash === candidate.hash);
    if (sameHash) {
      return {
        status: "exists",
        workflow: publicEntry(sameHash),
        conflict: {
          type: "same_hash",
          message: "这个 workflow 已经在库里。",
        },
      };
    }

    const sameId = entries.find((item) => item.id === candidate.id);
    const sameTitle = entries.find((item) => normalizeTitle(item.title) === normalizeTitle(candidate.title));
    const conflict = sameId || sameTitle;
    if (conflict) {
      return {
        status: "conflict",
        candidate: publicEntry(candidate),
        existing: publicEntry(conflict),
        conflict: {
          type: sameId ? "same_id" : "same_title",
          message: sameId ? "检测到同一个 workflow 的新版本。" : "检测到同名 workflow。",
        },
      };
    }

    const saved = await this.saveUserWorkflow(candidate, workflow, candidate.id);
    return { status: "saved", workflow: publicEntry(saved) };
  }

  async overwrite(id, workflow, fileName) {
    const candidate = this.buildEntry(workflow, {
      source: USER_SOURCE,
      fileName,
      idOverride: id,
    });
    const saved = await this.saveUserWorkflow(candidate, workflow, id);
    return publicEntry(saved);
  }

  async duplicate(workflow, fileName) {
    const candidate = this.buildEntry(workflow, {
      source: USER_SOURCE,
      fileName,
    });
    const entries = await this.listInternal();
    let id = candidate.id;
    let index = 2;
    while (entries.some((item) => item.id === id)) {
      id = `${candidate.id}-${index}`;
      index += 1;
    }
    const saved = await this.saveUserWorkflow({ ...candidate, id }, workflow, id);
    return publicEntry(saved);
  }

  async remove(id) {
    const entry = await this.find(id);
    if (!entry) throw new Error(`workflow 不存在：${id}`);
    if (entry.source !== USER_SOURCE) throw new Error("项目内置 workflow 不能删除。");
    await fs.rm(this.userWorkflowDir(id), { recursive: true, force: true });
  }

  async cover(id) {
    const entry = await this.find(id);
    if (!entry) throw new Error(`workflow 不存在：${id}`);
    if (entry.coverFile) {
      return { kind: "file", path: path.join(this.userWorkflowDir(entry.id), entry.coverFile) };
    }
    if (entry.coverImage) {
      const url = new URL(`${this.comfyUrl}/view`);
      url.searchParams.set("filename", entry.coverImage);
      url.searchParams.set("subfolder", "");
      url.searchParams.set("type", "input");
      return { kind: "proxy", url: url.toString() };
    }
    return null;
  }

  async listInternal() {
    return [...(await this.projectEntries()), ...(await this.userEntries())];
  }

  async find(id) {
    return (await this.listInternal()).find((entry) => entry.id === id);
  }

  async projectEntries() {
    try {
      const files = await fs.readdir(this.exampleDir, { withFileTypes: true });
      const entries = [];
      for (const file of files) {
        if (!file.isFile() || !file.name.toLowerCase().endsWith(".json")) continue;
        const filePath = path.join(this.exampleDir, file.name);
        const workflow = JSON.parse(await fs.readFile(filePath, "utf8"));
        entries.push(
          this.buildEntry(workflow, {
            source: PROJECT_SOURCE,
            fileName: file.name,
            idPrefix: "project",
          }),
        );
      }
      return entries;
    } catch {
      return [];
    }
  }

  async userEntries() {
    await fs.mkdir(this.userDir(), { recursive: true });
    const dirs = await fs.readdir(this.userDir(), { withFileTypes: true });
    const entries = [];
    for (const dir of dirs) {
      if (!dir.isDirectory()) continue;
      const workflowPath = path.join(this.userWorkflowDir(dir.name), "workflow.json");
      try {
        const workflow = JSON.parse(await fs.readFile(workflowPath, "utf8"));
        let manifest = {};
        try {
          manifest = JSON.parse(await fs.readFile(path.join(this.userWorkflowDir(dir.name), "manifest.json"), "utf8"));
        } catch {
          // Manifest is rebuilt from workflow when absent or invalid.
        }
        entries.push(
          this.buildEntry(workflow, {
            source: USER_SOURCE,
            fileName: manifest.fileName || "workflow.json",
            idOverride: dir.name,
            manifest,
          }),
        );
      } catch {
        // Ignore broken library entries instead of breaking the whole picker.
      }
    }
    return entries;
  }

  buildEntry(workflow, options = {}) {
    const fileName = options.fileName || "workflow.json";
    if (!isApiWorkflow(workflow)) {
      throw new Error("只支持 ComfyUI workflow (api) JSON。");
    }

    const hash = hashWorkflow(workflow);
    const metadata = parseWorkflowMetadata(workflow, path.basename(fileName, path.extname(fileName)));
    const title = metadata.title || path.basename(fileName, path.extname(fileName)) || `workflow-${hash.slice(0, 8)}`;
    const baseId = metadata.workflowId || slug(title) || `workflow-${hash.slice(0, 8)}`;
    const id = sanitizeSegment(options.idOverride || `${options.idPrefix ? `${options.idPrefix}-` : ""}${baseId}`);
    const schemaResult = safeSchema(workflow);
    const manifest = options.manifest || {};
    const coverFile = manifest.coverFile || "";

    return {
      id,
      source: options.source || USER_SOURCE,
      fileName,
      hash,
      title,
      description: metadata.description,
      coverImage: metadata.coverImage,
      coverFile,
      tags: metadata.tags,
      author: metadata.author,
      version: metadata.version,
      sortOrder: metadata.sortOrder,
      valid: schemaResult.valid,
      status: schemaResult.status,
      error: schemaResult.error,
      inputCount: schemaResult.schema?.inputs?.length ?? 0,
      outputCount: schemaResult.schema?.outputs?.length ?? 0,
      schema: schemaResult.schema,
      workflow,
    };
  }

  async saveUserWorkflow(entry, workflow, id) {
    const dir = this.userWorkflowDir(id);
    await fs.rm(dir, { recursive: true, force: true });
    await fs.mkdir(dir, { recursive: true });
    let coverFile = "";
    if (entry.coverImage) {
      coverFile = await this.saveCoverSnapshot(dir, entry.coverImage);
    }
    const savedEntry = { ...entry, id, source: USER_SOURCE, coverFile };
    await fs.writeFile(path.join(dir, "workflow.json"), `${JSON.stringify(workflow, null, 2)}\n`, "utf8");
    await fs.writeFile(path.join(dir, "manifest.json"), `${JSON.stringify(publicEntry(savedEntry), null, 2)}\n`, "utf8");
    return savedEntry;
  }

  async saveCoverSnapshot(dir, coverImage) {
    try {
      const url = new URL(`${this.comfyUrl}/view`);
      url.searchParams.set("filename", coverImage);
      url.searchParams.set("subfolder", "");
      url.searchParams.set("type", "input");
      const response = await fetch(url);
      if (!response.ok) return "";
      const ext = path.extname(coverImage) || ".png";
      const coverFile = `cover${ext}`;
      const bytes = Buffer.from(await response.arrayBuffer());
      await fs.writeFile(path.join(dir, coverFile), bytes);
      return coverFile;
    } catch {
      return "";
    }
  }

  userDir() {
    return path.join(this.rootDir, this.user);
  }

  userWorkflowDir(id) {
    return path.join(this.userDir(), sanitizeSegment(id));
  }
}

export function hashWorkflow(workflow) {
  return crypto.createHash("sha256").update(canonicalJson(workflow)).digest("hex");
}

export function publicEntry(entry) {
  return {
    id: entry.id,
    source: entry.source,
    fileName: entry.fileName,
    hash: entry.hash,
    title: entry.title,
    description: entry.description,
    coverImage: entry.coverImage,
    coverUrl: entry.coverFile || entry.coverImage ? `/api/workflows/${encodeURIComponent(entry.id)}/cover` : "",
    tags: entry.tags,
    author: entry.author,
    version: entry.version,
    sortOrder: entry.sortOrder,
    valid: entry.valid,
    status: entry.status,
    error: entry.error,
    inputCount: entry.inputCount,
    outputCount: entry.outputCount,
  };
}

function safeSchema(workflow) {
  try {
    const schema = parseWorkflowSchema(workflow);
    if (schema.inputs.length === 0 && schema.outputs.length === 0) {
      return { valid: false, status: "missing_mobileui", error: "缺少 MobileUI 表单节点。", schema };
    }
    if (schema.outputs.length === 0) {
      return { valid: false, status: "missing_output", error: "缺少 MobileUI 输出节点。", schema };
    }
    return { valid: true, status: "ready", error: "", schema };
  } catch (error) {
    return { valid: false, status: "invalid", error: error.message, schema: null };
  }
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function slug(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sanitizeSegment(value) {
  return slug(value) || "workflow";
}

function normalizeTitle(value) {
  return String(value || "").trim().toLowerCase();
}
