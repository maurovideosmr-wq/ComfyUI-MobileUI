import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { extractDeclaredImages, parseWorkflowMetadata, parseWorkflowSchema, patchWorkflow, resolveSeed, resolveSize, sizeFromAspectMegapixels, stripWorkflowMetadata } from "../server/mobileUi.js";
import { WorkflowLibrary } from "../server/workflowLibrary.js";

test("parses MobileUI declarations from api workflow", () => {
  const schema = parseWorkflowSchema(sampleWorkflow());

  assert.equal(schema.inputs.length, 3);
  assert.equal(schema.outputs.length, 1);
  assert.deepEqual(
    schema.inputs.map((field) => field.kind),
    ["text", "image", "seed"],
  );
  assert.equal(schema.inputs[0].selfTarget.nodeId, "100");
  assert.equal(schema.inputs[0].description, "Describe the image.");
});

test("patches values and removes declaration nodes", () => {
  const workflow = sampleWorkflow();
  const schema = parseWorkflowSchema(workflow);
  const patched = patchWorkflow(workflow, schema, {
    prompt: "a clean product photo",
    photo: "mobile_upload.png",
    seed: 41,
  });

  assert.equal(patched["100"].inputs.default_value, "a clean product photo");
  assert.equal(patched["101"].inputs.image, "mobile_upload.png");
  assert.equal(patched["102"].inputs.default_seed, 42);
  assert.equal(patched["6"].inputs.text[0], "100");
  assert.equal(patched["3"].inputs.seed[0], "102");
  assert.equal(patched["250"], undefined);
});

test("parses workflow metadata without adding form fields", () => {
  const workflow = sampleWorkflow();
  const schema = parseWorkflowSchema(workflow);
  const metadata = parseWorkflowMetadata(workflow, "fallback name");
  const stripped = stripWorkflowMetadata(workflow);

  assert.equal(schema.inputs.length, 3);
  assert.equal(metadata.workflowId, "sample-workflow");
  assert.equal(metadata.title, "Sample Workflow");
  assert.deepEqual(metadata.tags, ["photo", "test"]);
  assert.equal(metadata.coverImage, "example.png");
  assert.equal(stripped["250"], undefined);
});

test("falls back metadata when metadata node is missing", () => {
  const workflow = sampleWorkflow();
  delete workflow["250"];
  const metadata = parseWorkflowMetadata(workflow, "uploaded file");

  assert.equal(metadata.workflowId, "");
  assert.equal(metadata.title, "uploaded file");
  assert.equal(metadata.coverImage, "");
});

test("throws on missing target input", () => {
  const workflow = sampleWorkflow();
  delete workflow["100"].inputs.default_value;
  const schema = parseWorkflowSchema(workflow);

  assert.throws(() => patchWorkflow(workflow, schema, { prompt: "x" }), /不存在/);
});

test("resolves seed modes", () => {
  assert.equal(resolveSeed({ defaultSeed: 5, mode: "fixed" }, undefined), 5);
  assert.equal(resolveSeed({ defaultSeed: 5, mode: "increment" }, 10), 11);
  assert.equal(resolveSeed({ defaultSeed: 5, mode: "decrement" }, 10), 9);
  assert.equal(resolveSeed({ defaultSeed: 5, mode: "decrement" }, 0), 0);
  assert.equal(resolveSeed({ defaultSeed: 5, mode: "fixed" }, { seed: 10, mode: "increment" }), 11);
  const random = resolveSeed({ defaultSeed: 5, mode: "randomize" }, 10);
  assert.equal(Number.isSafeInteger(random), true);
});

test("extracts declared image outputs", () => {
  const schema = parseWorkflowSchema(sampleWorkflow());
  const outputs = extractDeclaredImages(
    {
      outputs: {
        88: {
          images: [{ filename: "result.png", subfolder: "", type: "output" }],
        },
        200: {
          images: [{ filename: "mobile-result.png", subfolder: "", type: "temp" }],
        },
      },
    },
    schema.outputs,
  );

  assert.equal(outputs[0].images[0].filename, "mobile-result.png");
});

test("parses v2 MobileUI declarations", () => {
  const schema = parseWorkflowSchema(v2Workflow());
  assert.deepEqual(
    schema.inputs.map((field) => field.kind),
    [
      "size",
      "number",
      "select",
      "vae_selector",
      "clip_selector",
      "diffusion_model_selector",
      "sampler_selector",
      "scheduler_selector",
    ],
  );
});

test("resolves size values to step-aligned dimensions", () => {
  const field = parseWorkflowSchema(v2Workflow()).inputs[0];
  const manual = resolveSize(field, { mode: "manual", width: 1001, height: 777 });
  assert.equal(manual.width % 8, 0);
  assert.equal(manual.height % 8, 0);

  const aspect = resolveSize(field, { mode: "aspect_mp", aspectRatio: "16:9", megapixels: 1 });
  assert.equal(aspect.width % 8, 0);
  assert.equal(aspect.height % 8, 0);
  assert.deepEqual(sizeFromAspectMegapixels("1:1", 1, 8), { width: 1000, height: 1000 });
});

test("patches v2 selector values into MobileUI nodes", () => {
  const workflow = v2Workflow();
  const schema = parseWorkflowSchema(workflow);
  const patched = patchWorkflow(workflow, schema, {
    size: { mode: "aspect_mp", aspectRatio: "3:2", megapixels: 1 },
    cfg: 7.5,
    quality: "high",
    vae: "ae.safetensors",
    clip: { clipName: "qwen.safetensors", type: "qwen_image", device: "cpu" },
    diffusion: { unetName: "model.safetensors", weightDtype: "fp8_e5m2" },
    sampler: "euler",
    scheduler: "normal",
  });

  assert.equal(patched["301"].inputs.default_value, 7.5);
  assert.equal(patched["302"].inputs.default_value, "high");
  assert.equal(patched["303"].inputs.default_vae_name, "ae.safetensors");
  assert.equal(patched["304"].inputs.default_clip_name, "qwen.safetensors");
  assert.equal(patched["304"].inputs.default_type, "qwen_image");
  assert.equal(patched["304"].inputs.default_device, "cpu");
  assert.equal(patched["305"].inputs.default_unet_name, "model.safetensors");
  assert.equal(patched["305"].inputs.default_weight_dtype, "fp8_e5m2");
  assert.equal(patched["306"].inputs.default_sampler_name, "euler");
  assert.equal(patched["307"].inputs.default_scheduler, "normal");
});

test("workflow library detects existing and conflicting uploads", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "mobileui-workflows-"));
  const exampleDir = await fs.mkdtemp(path.join(os.tmpdir(), "mobileui-examples-"));
  const library = new WorkflowLibrary({
    rootDir,
    exampleDir,
    user: "defaultuser",
    comfyUrl: "http://127.0.0.1:8188",
  });

  const first = await library.upload(sampleWorkflow(), "sample.json");
  assert.equal(first.status, "saved");

  const same = await library.upload(sampleWorkflow(), "sample-copy.json");
  assert.equal(same.status, "exists");

  const changed = sampleWorkflow();
  changed["100"].inputs.default_value = "new default";
  const conflict = await library.upload(changed, "sample-v2.json");
  assert.equal(conflict.status, "conflict");
  assert.equal(conflict.conflict.type, "same_id");
});

function sampleWorkflow() {
  return {
    3: {
      class_type: "KSampler",
      inputs: { seed: ["102", 0] },
    },
    6: {
      class_type: "CLIPTextEncode",
      inputs: { text: ["100", 0] },
    },
    10: {
      class_type: "SomeImageConsumer",
      inputs: { image: "" },
    },
    88: {
      class_type: "SaveImage",
      inputs: { filename_prefix: "ComfyUI" },
    },
    100: {
      class_type: "MobileUI Text Input",
      inputs: {
        key: "prompt",
        label: "提示词",
        description: "Describe the image.",
        placeholder: "",
        default_value: "",
        required: true,
        order: 0,
      },
    },
    101: {
      class_type: "MobileUI Image Input",
      inputs: {
        key: "photo",
        label: "上传图片",
        description: "Use a clear source image.",
        image: "example.png",
        required: true,
        order: 1,
      },
    },
    102: {
      class_type: "MobileUI Seed Input",
      inputs: {
        key: "seed",
        label: "Seed",
        description: "Controls repeatability.",
        default_seed: 1,
        mode: "increment",
        order: 2,
      },
    },
    200: {
      class_type: "MobileUI Image Output",
      inputs: {
        key: "result",
        label: "结果图",
        description: "Final image for mobile users.",
        images: ["88", 0],
        order: 100,
      },
    },
    250: {
      class_type: "MobileUI Workflow Metadata",
      inputs: {
        workflow_id: "sample-workflow",
        title: "Sample Workflow",
        description: "A metadata test workflow.",
        cover_image: "example.png",
        tags: "photo, test",
        author: "MobileUI",
        version: "1.0.0",
        sort_order: 1,
      },
    },
  };
}

function v2Workflow() {
  return {
    300: {
      class_type: "MobileUI Size Input",
      inputs: {
        key: "size",
        label: "尺寸",
        description: "",
        mode: "manual",
        default_width: 1024,
        default_height: 1024,
        default_aspect_ratio: "1:1",
        default_megapixels: 1,
        min_width: 256,
        max_width: 2048,
        min_height: 256,
        max_height: 2048,
        step: 8,
        required: true,
        order: 0,
      },
    },
    301: {
      class_type: "MobileUI Number Input",
      inputs: { key: "cfg", label: "CFG", description: "", number_type: "float", default_value: 8, min: 0, max: 20, step: 0.1, display: "slider", required: true, order: 1 },
    },
    302: {
      class_type: "MobileUI Select Input",
      inputs: { key: "quality", label: "质量", description: "", options_text: "low\nmedium\nhigh", default_value: "medium", required: true, order: 2 },
    },
    303: {
      class_type: "MobileUI VAE Selector",
      inputs: { key: "vae", label: "VAE", description: "", default_vae_name: "", required: true, order: 3 },
    },
    304: {
      class_type: "MobileUI CLIP Selector",
      inputs: { key: "clip", label: "CLIP", description: "", default_clip_name: "", default_type: "stable_diffusion", default_device: "default", required: true, order: 4 },
    },
    305: {
      class_type: "MobileUI Diffusion Model Selector",
      inputs: { key: "diffusion", label: "Diffusion", description: "", default_unet_name: "", default_weight_dtype: "default", required: true, order: 5 },
    },
    306: {
      class_type: "MobileUI Sampler Selector",
      inputs: { key: "sampler", label: "Sampler", description: "", default_sampler_name: "euler", required: true, order: 6 },
    },
    307: {
      class_type: "MobileUI Scheduler Selector",
      inputs: { key: "scheduler", label: "Scheduler", description: "", default_scheduler: "normal", required: true, order: 7 },
    },
  };
}
