import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import yazl from "yazl";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export class RunArchive {
  constructor({ rootDir, user, comfy }) {
    this.rootDir = rootDir;
    this.user = sanitizeSegment(user || "defaultuser");
    this.comfy = comfy;
  }

  async createRun({ workflowId, workflowTitle, workflowHash, promptId, schema, values, outputs }) {
    const createdAt = new Date().toISOString();
    const runId = `run-${compactTimestamp(createdAt)}-${crypto.randomUUID().slice(0, 8)}`;
    const id = sanitizeSegment(workflowId || "adhoc");
    const run = {
      id: runId,
      workflowId: id,
      workflowTitle: workflowTitle || id,
      workflowHash: workflowHash || "",
      promptId,
      createdAt,
      inputSummary: summarizeInputs(schema, values),
      outputs: decorateOutputs(id, runId, outputs),
    };
    await this.writeRun(id, run);
    return publicRun(run);
  }

  async listRuns(workflowId, options = {}) {
    const id = sanitizeSegment(workflowId);
    const limit = clampInt(options.limit, DEFAULT_LIMIT, 1, MAX_LIMIT);
    const offset = Math.max(0, Number.parseInt(options.cursor || "0", 10) || 0);
    const sort = options.sort === "oldest" ? "oldest" : "newest";
    const runs = await this.readWorkflowRuns(id);
    runs.sort((left, right) => {
      const delta = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
      return sort === "oldest" ? delta : -delta;
    });
    const filtered = runs
      .map((run) => filterRun(run, options))
      .filter((run) => run.outputs.some((output) => output.images.length > 0));
    const page = filtered.slice(offset, offset + limit);
    return {
      runs: page.map(publicRunSummary),
      nextCursor: offset + limit < filtered.length ? String(offset + limit) : "",
    };
  }

  async getRun(workflowId, runId) {
    return publicRun(await this.readRun(workflowId, runId));
  }

  async deleteRun(workflowId, runId) {
    await fs.rm(this.runDir(workflowId, runId), { recursive: true, force: true });
  }

  async setFavorite(workflowId, runId, imageId, favorite) {
    const run = await this.readRun(workflowId, runId);
    const match = findImage(run, imageId);
    if (!match) throw new Error(`图片不存在：${imageId}`);
    match.image.favorite = Boolean(favorite);
    await this.writeRun(workflowId, run);
    return publicRun(run);
  }

  async cachedImage(workflowId, runId, imageId, size = "original") {
    const run = await this.readRun(workflowId, runId);
    const match = findImage(run, imageId);
    if (!match) throw new Error(`图片不存在：${imageId}`);
    const cacheKind = size === "thumb" ? "thumb" : "original";
    const cached = match.image.cache?.[cacheKind];
    if (cached?.file) {
      const cachedPath = path.join(this.runDir(workflowId, runId), cached.file);
      try {
        await fs.access(cachedPath);
        return {
          path: cachedPath,
          contentType: cached.contentType || "image/png",
          filename: downloadName(run, match.output, match.image),
        };
      } catch {
        // Cache metadata is stale; fetch again below.
      }
    }

    try {
      const fetched = await this.comfy.fetchImage(match.image);
      const ext = extensionFor(match.image.filename, fetched.contentType);
      const cacheDir = cacheKind === "thumb" ? "thumbs" : "originals";
      const relativeFile = `${cacheDir}/${match.image.id}${ext}`;
      const target = path.join(this.runDir(workflowId, runId), relativeFile);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, fetched.bytes);
      match.image.cache = {
        ...(match.image.cache ?? {}),
        [cacheKind]: {
          file: relativeFile,
          contentType: fetched.contentType,
          bytes: fetched.bytes.length,
          cachedAt: new Date().toISOString(),
        },
      };
      match.image.missing = false;
      await this.writeRun(workflowId, run);
      return {
        path: target,
        contentType: fetched.contentType,
        filename: downloadName(run, match.output, match.image),
      };
    } catch (error) {
      match.image.missing = true;
      match.image.missingReason = error.message;
      await this.writeRun(workflowId, run);
      throw new Error(`图片不可用：${error.message}`);
    }
  }

  async zipImages(workflowId, options = {}) {
    const refs = Array.isArray(options.imageRefs) ? options.imageRefs : [];
    const entries = refs.length > 0
      ? await this.imagesFromRefs(workflowId, refs)
      : await this.imagesFromFilters(workflowId, options);
    const zip = new yazl.ZipFile();
    const missing = [];

    for (const entry of entries) {
      try {
        const cached = await this.cachedImage(workflowId, entry.run.id, entry.image.id, "original");
        const bytes = await fs.readFile(cached.path);
        zip.addBuffer(bytes, zipEntryName(entry.run, entry.output, entry.image), {
          mtime: new Date(entry.run.createdAt),
        });
      } catch (error) {
        missing.push(`${entry.run.id}/${entry.image.id}: ${error.message}`);
      }
    }

    if (missing.length > 0) {
      zip.addBuffer(Buffer.from(`${missing.join("\n")}\n`, "utf8"), "missing-files.txt");
    }
    zip.end();
    return {
      stream: zip.outputStream,
      filename: `${sanitizeSegment(workflowId)}-outputs.zip`,
    };
  }

  async imagesFromRefs(workflowId, refs) {
    const result = [];
    const byRun = new Map();
    for (const ref of refs) {
      if (!ref?.runId || !ref?.imageId) continue;
      if (!byRun.has(ref.runId)) byRun.set(ref.runId, await this.readRun(workflowId, ref.runId));
      const run = byRun.get(ref.runId);
      const match = findImage(run, ref.imageId);
      if (match) result.push({ run, ...match });
    }
    return result;
  }

  async imagesFromFilters(workflowId, options) {
    const runs = await this.readWorkflowRuns(workflowId);
    const result = [];
    for (const run of runs) {
      for (const output of run.outputs ?? []) {
        if (options.outputKey && options.outputKey !== output.key) continue;
        for (const image of output.images ?? []) {
          if (toBool(options.favorite) && !image.favorite) continue;
          result.push({ run, output, image });
        }
      }
    }
    return result;
  }

  async readWorkflowRuns(workflowId) {
    const dir = this.workflowDir(workflowId);
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const runs = [];
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        try {
          runs.push(await this.readRun(workflowId, entry.name));
        } catch {
          // Ignore broken run entries instead of breaking history.
        }
      }
      return runs;
    } catch {
      return [];
    }
  }

  async readRun(workflowId, runId) {
    const file = path.join(this.runDir(workflowId, runId), "run.json");
    return JSON.parse(await fs.readFile(file, "utf8"));
  }

  async writeRun(workflowId, run) {
    const dir = this.runDir(workflowId, run.id);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "run.json"), `${JSON.stringify(run, null, 2)}\n`, "utf8");
  }

  workflowDir(workflowId) {
    return path.join(this.rootDir, this.user, sanitizeSegment(workflowId));
  }

  runDir(workflowId, runId) {
    return path.join(this.workflowDir(workflowId), sanitizeSegment(runId));
  }
}

function decorateOutputs(workflowId, runId, outputs) {
  let imageIndex = 0;
  return (outputs ?? []).map((output) => ({
    key: output.key,
    label: output.label,
    images: (output.images ?? []).map((image, index) => {
      imageIndex += 1;
      return {
        id: `img-${String(imageIndex).padStart(4, "0")}`,
        workflowId,
        runId,
        outputKey: output.key,
        outputLabel: output.label,
        index,
        filename: image.filename,
        subfolder: image.subfolder ?? "",
        type: image.type ?? "output",
        favorite: false,
        missing: false,
        cache: {},
      };
    }),
  }));
}

function publicRun(run) {
  return {
    ...run,
    outputs: (run.outputs ?? []).map((output) => ({
      ...output,
      images: (output.images ?? []).map((image) => publicImage(run.workflowId, run.id, image)),
    })),
  };
}

function publicRunSummary(run) {
  const images = (run.outputs ?? []).flatMap((output) => output.images ?? []);
  return {
    id: run.id,
    workflowId: run.workflowId,
    workflowTitle: run.workflowTitle,
    promptId: run.promptId,
    createdAt: run.createdAt,
    inputSummary: run.inputSummary,
    imageCount: images.length,
    favoriteCount: images.filter((image) => image.favorite).length,
    missingCount: images.filter((image) => image.missing).length,
    outputs: run.outputs.map((output) => ({
      key: output.key,
      label: output.label,
      images: output.images.map((image) => publicImage(run.workflowId, run.id, image)),
    })),
  };
}

function publicImage(workflowId, runId, image) {
  const base = `/api/workflows/${encodeURIComponent(workflowId)}/runs/${encodeURIComponent(runId)}/images/${encodeURIComponent(image.id)}`;
  return {
    id: image.id,
    runId,
    outputKey: image.outputKey,
    outputLabel: image.outputLabel,
    index: image.index,
    filename: image.filename,
    subfolder: image.subfolder,
    type: image.type,
    favorite: Boolean(image.favorite),
    missing: Boolean(image.missing),
    missingReason: image.missingReason || "",
    url: `${base}/view?size=original`,
    thumbUrl: `${base}/view?size=thumb`,
    downloadUrl: `${base}/download`,
  };
}

function filterRun(run, options) {
  const favoriteOnly = toBool(options.favorite);
  const outputKey = options.outputKey || "";
  return {
    ...run,
    outputs: (run.outputs ?? [])
      .filter((output) => !outputKey || output.key === outputKey)
      .map((output) => ({
        ...output,
        images: (output.images ?? []).filter((image) => !favoriteOnly || image.favorite),
      })),
  };
}

function findImage(run, imageId) {
  for (const output of run.outputs ?? []) {
    const image = (output.images ?? []).find((candidate) => candidate.id === imageId);
    if (image) return { output, image };
  }
  return null;
}

function summarizeInputs(schema, values) {
  return (schema?.inputs ?? [])
    .filter((field) => field.kind !== "metadata")
    .map((field) => ({
      key: field.key,
      label: field.label,
      kind: field.kind,
      value: cleanValue(values?.[field.key]),
      summary: summarizeValue(field, values?.[field.key]),
    }));
}

function summarizeValue(field, value) {
  if (field.kind === "seed") {
    const seed = typeof value === "object" && value !== null ? value.seed : value;
    const mode = typeof value === "object" && value !== null ? value.mode : field.mode;
    return `${seed ?? field.defaultSeed ?? 0} / ${mode ?? "fixed"}`;
  }
  if (field.kind === "size") {
    const width = value?.width ?? field.defaultWidth;
    const height = value?.height ?? field.defaultHeight;
    return `${width} x ${height}`;
  }
  if (field.kind === "image") return value ? String(value) : "未上传";
  if (typeof value === "object" && value !== null) {
    return Object.values(value).filter((item) => item !== "" && item != null).join(" / ") || "默认";
  }
  const text = String(value ?? "");
  return text.length > 72 ? `${text.slice(0, 72)}...` : text;
}

function cleanValue(value) {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(cleanValue);
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cleanValue(item)]));
  }
  return value;
}

function zipEntryName(run, output, image) {
  const date = String(run.createdAt || "").slice(0, 10) || "run";
  return `${date}/${run.id}/${sanitizeSegment(output.key)}-${String(image.index + 1).padStart(2, "0")}-${safeFileName(image.filename)}`;
}

function downloadName(run, output, image) {
  return `${sanitizeSegment(run.workflowTitle || run.workflowId)}-${sanitizeSegment(output.key)}-${run.id}-${safeFileName(image.filename)}`;
}

function safeFileName(value) {
  return path.basename(String(value || "image.png")).replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_") || "image.png";
}

function extensionFor(filename, contentType) {
  const ext = path.extname(filename || "");
  if (ext) return ext;
  if (contentType?.includes("jpeg")) return ".jpg";
  if (contentType?.includes("webp")) return ".webp";
  return ".png";
}

function compactTimestamp(value) {
  return value.replace(/[-:.TZ]/g, "").slice(0, 14);
}

function sanitizeSegment(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "item";
}

function clampInt(value, fallback, min, max) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(number, min), max);
}

function toBool(value) {
  return value === true || value === "true" || value === "1";
}
