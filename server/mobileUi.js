export const DECLARATION_PREFIX = "MobileUI ";

const TYPES = {
  TEXT: "MobileUI Text Input",
  IMAGE: "MobileUI Image Input",
  SEED: "MobileUI Seed Input",
  OUTPUT: "MobileUI Image Output",
  SIZE: "MobileUI Size Input",
  NUMBER: "MobileUI Number Input",
  SELECT: "MobileUI Select Input",
  VAE: "MobileUI VAE Selector",
  CLIP: "MobileUI CLIP Selector",
  DIFFUSION: "MobileUI Diffusion Model Selector",
  SAMPLER: "MobileUI Sampler Selector",
  SCHEDULER: "MobileUI Scheduler Selector",
  METADATA: "MobileUI Workflow Metadata",
};

export const ASPECT_RATIOS = {
  "1:1": { label: "1:1 Square", width: 1, height: 1 },
  "3:2": { label: "3:2 Photo", width: 3, height: 2 },
  "4:3": { label: "4:3 Standard", width: 4, height: 3 },
  "16:9": { label: "16:9 Widescreen", width: 16, height: 9 },
  "21:9": { label: "21:9 Ultrawide", width: 21, height: 9 },
  "2:3": { label: "2:3 Portrait Photo", width: 2, height: 3 },
  "3:4": { label: "3:4 Portrait Standard", width: 3, height: 4 },
  "9:16": { label: "9:16 Portrait Widescreen", width: 9, height: 16 },
  "9:21": { label: "9:21 Portrait Ultrawide", width: 9, height: 21 },
};

export function isApiWorkflow(value) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.values(value).every(
      (node) =>
        node &&
        typeof node === "object" &&
        typeof node.class_type === "string" &&
        node.inputs &&
        typeof node.inputs === "object",
    )
  );
}

export function parseWorkflowSchema(workflow) {
  if (!isApiWorkflow(workflow)) {
    throw new Error("只支持 ComfyUI workflow (api) JSON。");
  }

  const inputs = [];
  const outputs = [];

  for (const [nodeId, node] of Object.entries(workflow)) {
    if (!node.class_type?.startsWith(DECLARATION_PREFIX)) continue;
    const declaration = parseDeclaration(nodeId, node);
    if (declaration.kind === "metadata") continue;
    if (declaration.kind === "output") outputs.push(declaration);
    else inputs.push(declaration);
  }

  inputs.sort(sortByOrder);
  outputs.sort(sortByOrder);

  return {
    inputs,
    outputs,
    declarationNodeIds: Object.entries(workflow)
      .filter(([, node]) => node.class_type?.startsWith(DECLARATION_PREFIX))
      .map(([nodeId]) => nodeId),
  };
}

export function parseWorkflowMetadata(workflow, fallbackName = "") {
  if (!isApiWorkflow(workflow)) {
    throw new Error("只支持 ComfyUI workflow (api) JSON。");
  }

  const metadataNodes = Object.entries(workflow)
    .filter(([, node]) => node.class_type === TYPES.METADATA)
    .map(([nodeId, node]) => parseDeclaration(nodeId, node));
  const metadata = metadataNodes[0] ?? {};
  const title = String(metadata.title || fallbackName || metadata.workflowId || "").trim();

  return {
    workflowId: String(metadata.workflowId || "").trim(),
    title,
    description: String(metadata.description || "").trim(),
    coverImage: String(metadata.coverImage || "").trim(),
    tags: Array.isArray(metadata.tags) ? metadata.tags : [],
    author: String(metadata.author || "").trim(),
    version: String(metadata.version || "").trim(),
    sortOrder: toNumber(metadata.sortOrder, 0),
    metadataNodeIds: metadataNodes.map((item) => item.nodeId),
  };
}

export function stripWorkflowMetadata(workflow) {
  const next = structuredClone(workflow);
  for (const [nodeId, node] of Object.entries(next)) {
    if (node.class_type === TYPES.METADATA) delete next[nodeId];
  }
  return next;
}

export function patchWorkflow(workflow, schema, values) {
  const next = stripWorkflowMetadata(workflow);

  normalizeDeclarationNodes(next, schema);

  for (const field of schema.inputs) {
    if (field.kind === "size") {
      const size = resolveSize(field, values[field.key]);
      next[field.nodeId].inputs.default_width = size.width;
      next[field.nodeId].inputs.default_height = size.height;
      next[field.nodeId].inputs.mode = size.mode;
      next[field.nodeId].inputs.default_aspect_ratio = size.aspectRatio;
      next[field.nodeId].inputs.default_megapixels = size.megapixels;
      continue;
    }

    if (field.kind === "clip_selector") {
      const value = values[field.key] ?? {};
      next[field.nodeId].inputs.default_clip_name = resolveStringValue(value.clipName, field.defaultClipName);
      next[field.nodeId].inputs.default_type = normalizeChoice(value.type, field.clipTypes, field.defaultType);
      next[field.nodeId].inputs.default_device = normalizeChoice(value.device, ["default", "cpu"], field.defaultDevice);
      continue;
    }

    if (field.kind === "diffusion_model_selector") {
      const value = values[field.key] ?? {};
      next[field.nodeId].inputs.default_unet_name = resolveStringValue(value.unetName, field.defaultUnetName);
      next[field.nodeId].inputs.default_weight_dtype = normalizeChoice(value.weightDtype, field.weightDtypes, field.defaultWeightDtype);
      continue;
    }

    const targetRef = field.target?.nodeId ? field.target : field.selfTarget;
    const target = next[targetRef.nodeId];
    if (!target) {
      throw new Error(`${field.label} 指向的节点 ${targetRef.nodeId} 不存在。`);
    }
    if (!target.inputs || !(targetRef.input in target.inputs)) {
      throw new Error(`${field.label} 指向的输入 ${targetRef.nodeId}.${targetRef.input} 不存在。`);
    }

    if (field.kind === "text") {
      const value = values[field.key] ?? field.defaultValue ?? "";
      if (field.required && String(value).trim() === "") {
        throw new Error(`${field.label} 是必填项。`);
      }
      target.inputs[targetRef.input] = String(value);
    }

    if (field.kind === "image") {
      const value = values[field.key];
      if (field.required && !value) {
        throw new Error(`${field.label} 是必填项。`);
      }
      if (value) target.inputs[targetRef.input] = value;
    }

    if (field.kind === "seed") {
      target.inputs[targetRef.input] = resolveSeed(field, values[field.key]);
      if (field.selfTarget && next[field.nodeId]?.inputs && "mode" in next[field.nodeId].inputs) {
        next[field.nodeId].inputs.mode = resolveSeedMode(field, values[field.key]);
      }
    }

    if (field.kind === "number") {
      next[field.nodeId].inputs.default_value = resolveNumber(field, values[field.key]);
    }

    if (field.kind === "select") {
      next[field.nodeId].inputs.default_value = resolveStringValue(values[field.key], field.defaultValue);
    }

    if (field.kind === "vae_selector") {
      next[field.nodeId].inputs.default_vae_name = resolveStringValue(values[field.key], field.defaultValue);
    }

    if (field.kind === "sampler_selector") {
      next[field.nodeId].inputs.default_sampler_name = resolveStringValue(values[field.key], field.defaultSamplerName);
    }

    if (field.kind === "scheduler_selector") {
      next[field.nodeId].inputs.default_scheduler = resolveStringValue(values[field.key], field.defaultScheduler);
    }
  }

  return next;
}

function normalizeDeclarationNodes(workflow, schema) {
  for (const field of [...schema.inputs, ...schema.outputs]) {
    const node = workflow[field.nodeId];
    if (!node?.inputs) continue;
    node.inputs.order = field.order;
    if ("required" in node.inputs) node.inputs.required = Boolean(field.required);
    if (field.kind === "seed") {
      node.inputs.default_seed = resolveSeed(field, node.inputs.default_seed);
      node.inputs.mode = normalizeSeedMode(node.inputs.mode || field.mode);
    }
    if (field.kind === "size") {
      const size = resolveSize(field, node.inputs);
      node.inputs.default_width = size.width;
      node.inputs.default_height = size.height;
      node.inputs.default_aspect_ratio = size.aspectRatio;
      node.inputs.default_megapixels = size.megapixels;
      node.inputs.step = size.step;
    }
    if (field.kind === "number") node.inputs.default_value = resolveNumber(field, node.inputs.default_value);
  }
}

export function resolveSeed(field, submitted) {
  const submittedSeed = typeof submitted === "object" && submitted !== null ? submitted.seed : submitted;
  const mode = resolveSeedMode(field, submitted);
  const base = Number.isSafeInteger(Number(submittedSeed))
    ? Number(submittedSeed)
    : Number(field.defaultSeed ?? 0);
  const seed = Number.isSafeInteger(base) ? base : 0;

  if (mode === "randomize") {
    return Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
  }
  if (mode === "increment") {
    return clampSeed(seed + 1);
  }
  if (mode === "decrement") {
    return clampSeed(seed - 1);
  }
  return clampSeed(seed);
}

export function resolveSeedMode(field, submitted) {
  if (typeof submitted === "object" && submitted !== null && "mode" in submitted) {
    return normalizeSeedMode(submitted.mode);
  }
  return normalizeSeedMode(field.mode);
}

export function resolveSize(field, submitted) {
  const value = typeof submitted === "object" && submitted !== null ? submitted : {};
  const mode = normalizeChoice(value.mode, ["manual", "aspect_mp"], field.mode);
  const step = Math.max(1, toNumber(value.step ?? field.step, 8));
  const minWidth = snapToStep(toNumber(field.minWidth, 8), step);
  const maxWidth = snapToStep(toNumber(field.maxWidth, 8192), step);
  const minHeight = snapToStep(toNumber(field.minHeight, 8), step);
  const maxHeight = snapToStep(toNumber(field.maxHeight, 8192), step);
  const aspectRatio = normalizeAspect(value.aspectRatio ?? field.defaultAspectRatio);
  const megapixels = clampNumber(toNumber(value.megapixels ?? field.defaultMegapixels, 1), 0.1, 16);

  if (mode === "aspect_mp") {
    const calculated = sizeFromAspectMegapixels(aspectRatio, megapixels, step);
    return {
      mode,
      aspectRatio,
      megapixels,
      step,
      width: clampNumber(calculated.width, minWidth, maxWidth),
      height: clampNumber(calculated.height, minHeight, maxHeight),
    };
  }

  return {
    mode: "manual",
    aspectRatio,
    megapixels,
    step,
    width: clampNumber(snapToStep(toNumber(value.width ?? field.defaultWidth, 1024), step), minWidth, maxWidth),
    height: clampNumber(snapToStep(toNumber(value.height ?? field.defaultHeight, 1024), step), minHeight, maxHeight),
  };
}

export function sizeFromAspectMegapixels(aspectRatio, megapixels, step = 8) {
  const ratio = ASPECT_RATIOS[normalizeAspect(aspectRatio)] ?? ASPECT_RATIOS["1:1"];
  const pixels = megapixels * 1000000;
  const width = Math.sqrt((pixels * ratio.width) / ratio.height);
  const height = width * (ratio.height / ratio.width);
  return {
    width: snapToStep(width, step),
    height: snapToStep(height, step),
  };
}

export function resolveNumber(field, submitted) {
  const raw = typeof submitted === "object" && submitted !== null ? submitted.value : submitted;
  const value = toNumber(raw, field.defaultValue);
  const clamped = clampNumber(value, field.min, field.max);
  if (field.numberType === "int") return Math.trunc(clamped);
  return clamped;
}

export function extractDeclaredImages(history, outputs) {
  const result = [];
  const outputMap = history?.outputs ?? {};

  for (const declaration of outputs) {
    const nodeOutput = outputMap[declaration.sourceNodeId];
    const images = nodeOutput?.images ?? [];
    if (images.length === 0) {
      throw new Error(`${declaration.label} 没有在节点 ${declaration.sourceNodeId} 找到图片输出。`);
    }
    result.push({
      key: declaration.key,
      label: declaration.label,
      images: images.map((image) => ({
        filename: image.filename,
        subfolder: image.subfolder ?? "",
        type: image.type ?? "output",
      })),
    });
  }

  return result;
}

function parseDeclaration(nodeId, node) {
  const inputs = node.inputs ?? {};
  const common = {
    nodeId,
    key: normalizeKey(inputs.key || nodeId),
    label: String(inputs.label || inputs.key || nodeId),
    description: String(inputs.description ?? ""),
    order: toNumber(inputs.order, 0),
  };

  if (node.class_type === TYPES.TEXT) {
    return {
      ...common,
      kind: "text",
      placeholder: String(inputs.placeholder ?? ""),
      defaultValue: String(inputs.default_value ?? ""),
      required: toBool(inputs.required),
      selfTarget: { nodeId, input: "default_value" },
      target: legacyTargetFrom(inputs),
    };
  }

  if (node.class_type === TYPES.IMAGE) {
    return {
      ...common,
      kind: "image",
      required: toBool(inputs.required),
      selfTarget: { nodeId, input: "image" },
      target: legacyTargetFrom(inputs),
    };
  }

  if (node.class_type === TYPES.SEED) {
    return {
      ...common,
      kind: "seed",
      defaultSeed: toNumber(inputs.default_seed, 0),
      mode: normalizeSeedMode(inputs.mode),
      selfTarget: { nodeId, input: "default_seed" },
      target: legacyTargetFrom(inputs),
    };
  }

  if (node.class_type === TYPES.SIZE) {
    return {
      ...common,
      kind: "size",
      mode: normalizeChoice(inputs.mode, ["manual", "aspect_mp"], "manual"),
      defaultWidth: toNumber(inputs.default_width, 1024),
      defaultHeight: toNumber(inputs.default_height, 1024),
      defaultAspectRatio: normalizeAspect(inputs.default_aspect_ratio),
      defaultMegapixels: toNumber(inputs.default_megapixels, 1),
      minWidth: toNumber(inputs.min_width, 256),
      maxWidth: toNumber(inputs.max_width, 2048),
      minHeight: toNumber(inputs.min_height, 256),
      maxHeight: toNumber(inputs.max_height, 2048),
      step: toNumber(inputs.step, 8),
      required: toBool(inputs.required),
      selfTargets: [
        { nodeId, input: "default_width" },
        { nodeId, input: "default_height" },
      ],
    };
  }

  if (node.class_type === TYPES.NUMBER) {
    return {
      ...common,
      kind: "number",
      numberType: normalizeChoice(inputs.number_type, ["int", "float"], "float"),
      defaultValue: toNumber(inputs.default_value, 0),
      min: toNumber(inputs.min, 0),
      max: toNumber(inputs.max, 100),
      step: toNumber(inputs.step, 1),
      display: normalizeChoice(inputs.display, ["slider", "stepper", "input"], "input"),
      required: toBool(inputs.required),
      selfTarget: { nodeId, input: "default_value" },
    };
  }

  if (node.class_type === TYPES.SELECT) {
    const options = parseOptionsText(inputs.options_text);
    return {
      ...common,
      kind: "select",
      options,
      defaultValue: String(inputs.default_value ?? options[0] ?? ""),
      required: toBool(inputs.required),
      selfTarget: { nodeId, input: "default_value" },
    };
  }

  if (node.class_type === TYPES.VAE) {
    return {
      ...common,
      kind: "vae_selector",
      modelFolder: "vae",
      defaultValue: String(inputs.default_vae_name ?? ""),
      required: toBool(inputs.required),
      selfTarget: { nodeId, input: "default_vae_name" },
    };
  }

  if (node.class_type === TYPES.CLIP) {
    const clipTypes = [
      "stable_diffusion", "stable_cascade", "sd3", "stable_audio", "mochi", "ltxv", "pixart", "cosmos", "lumina2", "wan", "hidream", "chroma", "ace", "omnigen2", "qwen_image", "hunyuan_image", "flux2", "ovis", "longcat_image", "cogvideox", "lens", "pixeldit",
    ];
    return {
      ...common,
      kind: "clip_selector",
      modelFolder: "text_encoders",
      clipTypes,
      devices: ["default", "cpu"],
      defaultClipName: String(inputs.default_clip_name ?? ""),
      defaultType: normalizeChoice(inputs.default_type, clipTypes, "stable_diffusion"),
      defaultDevice: normalizeChoice(inputs.default_device, ["default", "cpu"], "default"),
      required: toBool(inputs.required),
    };
  }

  if (node.class_type === TYPES.DIFFUSION) {
    const weightDtypes = ["default", "fp8_e4m3fn", "fp8_e4m3fn_fast", "fp8_e5m2"];
    return {
      ...common,
      kind: "diffusion_model_selector",
      modelFolder: "diffusion_models",
      weightDtypes,
      defaultUnetName: String(inputs.default_unet_name ?? ""),
      defaultWeightDtype: normalizeChoice(inputs.default_weight_dtype, weightDtypes, "default"),
      required: toBool(inputs.required),
    };
  }

  if (node.class_type === TYPES.SAMPLER) {
    return {
      ...common,
      kind: "sampler_selector",
      objectInfoNode: "KSampler",
      objectInfoInput: "sampler_name",
      defaultSamplerName: String(inputs.default_sampler_name ?? "euler"),
      required: toBool(inputs.required),
      selfTarget: { nodeId, input: "default_sampler_name" },
    };
  }

  if (node.class_type === TYPES.SCHEDULER) {
    return {
      ...common,
      kind: "scheduler_selector",
      objectInfoNode: "KSampler",
      objectInfoInput: "scheduler",
      defaultScheduler: String(inputs.default_scheduler ?? "normal"),
      required: toBool(inputs.required),
      selfTarget: { nodeId, input: "default_scheduler" },
    };
  }

  if (node.class_type === TYPES.METADATA) {
    return {
      nodeId,
      kind: "metadata",
      workflowId: String(inputs.workflow_id ?? ""),
      title: String(inputs.title ?? ""),
      description: String(inputs.description ?? ""),
      coverImage: String(inputs.cover_image ?? ""),
      tags: parseTags(inputs.tags),
      author: String(inputs.author ?? ""),
      version: String(inputs.version ?? ""),
      sortOrder: toNumber(inputs.sort_order, 0),
    };
  }

  if (node.class_type === TYPES.OUTPUT) {
    return {
      ...common,
      kind: "output",
      sourceNodeId: String(inputs.source_node_id || nodeId),
    };
  }

  throw new Error(`不支持的 MobileUI 声明节点：${node.class_type}`);
}

function legacyTargetFrom(inputs) {
  const nodeId = String(inputs.target_node_id ?? "");
  const input = String(inputs.target_input ?? "");
  if (!nodeId || !input) return null;
  return { nodeId, input };
}

function normalizeSeedMode(mode) {
  const value = String(mode ?? "fixed").toLowerCase();
  return ["fixed", "randomize", "increment", "decrement"].includes(value) ? value : "fixed";
}

function normalizeChoice(value, options, fallback) {
  const candidate = String(value ?? fallback);
  return options.includes(candidate) ? candidate : fallback;
}

function normalizeAspect(value) {
  const candidate = String(value ?? "1:1");
  return ASPECT_RATIOS[candidate] ? candidate : "1:1";
}

function parseOptionsText(value) {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseTags(value) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function resolveStringValue(value, fallback) {
  if (typeof value === "object" && value !== null && "value" in value) return String(value.value ?? fallback ?? "");
  return String(value ?? fallback ?? "");
}

function snapToStep(value, step) {
  return Math.max(step, Math.round(Number(value) / step) * step);
}

function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeKey(value) {
  return String(value).trim().replace(/\s+/g, "_");
}

function sortByOrder(left, right) {
  return left.order - right.order || left.label.localeCompare(right.label);
}

function toBool(value) {
  if (typeof value === "boolean") return value;
  return String(value ?? "false").toLowerCase() === "true";
}

function toNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clampSeed(value) {
  if (value < 0) return 0;
  if (value > Number.MAX_SAFE_INTEGER) return Number.MAX_SAFE_INTEGER;
  return Math.trunc(value);
}
