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
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
