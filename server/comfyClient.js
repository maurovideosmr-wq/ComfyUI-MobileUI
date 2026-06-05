import fs from "node:fs/promises";

export class ComfyClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async status() {
    const response = await fetch(`${this.baseUrl}/system_stats`);
    if (!response.ok) throw new Error(`ComfyUI 连接失败：${response.status}`);
    return response.json();
  }

  async models(folder) {
    const response = await fetch(`${this.baseUrl}/models/${encodeURIComponent(folder)}`);
    if (!response.ok) throw new Error(`读取 ComfyUI 模型列表失败：${folder} ${response.status}`);
    return response.json();
  }

  async objectInfo(nodeClass) {
    const response = await fetch(`${this.baseUrl}/object_info/${encodeURIComponent(nodeClass)}`);
    if (!response.ok) throw new Error(`读取 ComfyUI 节点信息失败：${nodeClass} ${response.status}`);
    return response.json();
  }

  async loraManagerList(query = {}) {
    const params = new URLSearchParams();
    params.set("page", String(query.page || 1));
    params.set("page_size", String(Math.min(Number(query.pageSize || query.page_size || 30), 100)));
    params.set("sort_by", String(query.sortBy || query.sort_by || "name"));
    params.set("search_tags", "true");
    params.set("search_modelname", "true");
    params.set("search_filename", "true");
    if (query.search) params.set("search", String(query.search));
    if (query.folder) params.set("folder", String(query.folder));
    if (query.baseModel || query.base_model) params.append("base_model", String(query.baseModel || query.base_model));
    if (query.tag) params.append("tag", String(query.tag));
    if (query.favoritesOnly || query.favorites_only) params.set("favorites_only", "true");

    const response = await fetch(`${this.baseUrl}/api/lm/loras/list?${params.toString()}`);
    if (!response.ok) throw new Error(`读取 Lora Manager 列表失败：${response.status}`);
    return response.json();
  }

  async loraManagerTriggerWords(name) {
    const params = new URLSearchParams({ name });
    const response = await fetch(`${this.baseUrl}/api/lm/loras/get-trigger-words?${params.toString()}`);
    if (!response.ok) throw new Error(`读取 LoRA trigger words 失败：${response.status}`);
    return response.json();
  }

  async loraManagerPreview(query = {}) {
    const params = new URLSearchParams();
    if (query.path) params.set("path", String(query.path));
    const response = await fetch(`${this.baseUrl}/api/lm/previews?${params.toString()}`);
    if (!response.ok) throw new Error(`读取 LoRA 预览图失败：${response.status}`);
    return {
      bytes: Buffer.from(await response.arrayBuffer()),
      contentType: response.headers.get("content-type") || "image/png",
    };
  }

  async uploadImage(file) {
    const form = new FormData();
    const bytes = await fs.readFile(file.path);
    const blob = new Blob([bytes], { type: file.mimetype || "application/octet-stream" });
    form.append("image", blob, file.originalname);
    form.append("overwrite", "true");

    const response = await fetch(`${this.baseUrl}/upload/image`, {
      method: "POST",
      body: form,
    });
    if (!response.ok) {
      throw new Error(`图片上传到 ComfyUI 失败：${response.status}`);
    }
    const payload = await response.json();
    return payload.name || payload.filename || file.originalname;
  }

  async queuePrompt(prompt, clientId) {
    const response = await fetch(`${this.baseUrl}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, client_id: clientId }),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`提交 ComfyUI 任务失败：${response.status} ${text}`);
    }
    return response.json();
  }

  async waitForHistory(promptId, timeoutMs = 180000, intervalMs = 1200) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const response = await fetch(`${this.baseUrl}/history/${encodeURIComponent(promptId)}`);
      if (response.ok) {
        const payload = await response.json();
        if (payload[promptId]) return payload[promptId];
      }
      await sleep(intervalMs);
    }
    throw new Error("等待 ComfyUI 任务结果超时。");
  }

  imageUrl(image) {
    const params = new URLSearchParams({
      filename: image.filename,
      subfolder: image.subfolder ?? "",
      type: image.type ?? "output",
    });
    return `${this.baseUrl}/view?${params.toString()}`;
  }

  async fetchImage(image) {
    const response = await fetch(this.imageUrl(image));
    if (!response.ok) {
      throw new Error(`读取 ComfyUI 图片失败：${response.status}`);
    }
    return {
      bytes: Buffer.from(await response.arrayBuffer()),
      contentType: response.headers.get("content-type") || "image/png",
    };
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
