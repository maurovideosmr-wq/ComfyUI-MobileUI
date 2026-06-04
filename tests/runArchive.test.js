import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { RunArchive } from "../server/runArchive.js";

test("run archive stores multi-output runs with multiple images", async () => {
  const archive = await createArchive();
  const run = await archive.createRun({
    workflowId: "sample-workflow",
    workflowTitle: "Sample Workflow",
    workflowHash: "hash-1",
    promptId: "prompt-1",
    schema: sampleSchema(),
    values: sampleValues(),
    outputs: sampleOutputs(),
  });

  assert.equal(run.workflowId, "sample-workflow");
  assert.equal(run.outputs.length, 2);
  assert.equal(run.outputs[0].images.length, 2);
  assert.equal(run.outputs[1].images.length, 1);
  assert.equal(run.inputSummary.find((item) => item.key === "seed").summary, "42 / fixed");
  assert.match(run.outputs[0].images[0].downloadUrl, /\/download$/);
});

test("run archive paginates, filters, sorts, and deletes runs", async () => {
  const archive = await createArchive();
  const first = await archive.createRun({
    workflowId: "sample-workflow",
    workflowTitle: "Sample Workflow",
    promptId: "prompt-1",
    schema: sampleSchema(),
    values: { ...sampleValues(), seed: { seed: 1, mode: "fixed" } },
    outputs: sampleOutputs(),
  });
  const second = await archive.createRun({
    workflowId: "sample-workflow",
    workflowTitle: "Sample Workflow",
    promptId: "prompt-2",
    schema: sampleSchema(),
    values: { ...sampleValues(), seed: { seed: 2, mode: "fixed" } },
    outputs: [{ key: "main", label: "Main", images: [{ filename: "second.png", subfolder: "", type: "output" }] }],
  });
  const third = await archive.createRun({
    workflowId: "sample-workflow",
    workflowTitle: "Sample Workflow",
    promptId: "prompt-3",
    schema: sampleSchema(),
    values: { ...sampleValues(), seed: { seed: 3, mode: "fixed" } },
    outputs: [{ key: "alt", label: "Alt", images: [{ filename: "third.png", subfolder: "", type: "output" }] }],
  });

  const page = await archive.listRuns("sample-workflow", { limit: 2, sort: "newest" });
  assert.equal(page.runs.length, 2);
  assert.equal(page.nextCursor, "2");

  const altOnly = await archive.listRuns("sample-workflow", { outputKey: "alt", sort: "oldest" });
  assert.equal(altOnly.runs.length, 2);
  assert.equal(altOnly.runs[0].outputs[0].key, "alt");

  await archive.setFavorite("sample-workflow", second.id, second.outputs[0].images[0].id, true);
  const favorites = await archive.listRuns("sample-workflow", { favorite: "true" });
  assert.equal(favorites.runs.length, 1);
  assert.equal(favorites.runs[0].id, second.id);
  assert.equal(favorites.runs[0].favoriteCount, 1);

  await archive.deleteRun("sample-workflow", first.id);
  const afterDelete = await archive.listRuns("sample-workflow", {});
  assert.equal(afterDelete.runs.some((run) => run.id === first.id), false);
  assert.equal(afterDelete.runs.some((run) => run.id === third.id), true);
});

test("run archive ZIP includes selected images and missing file report", async () => {
  const archive = await createArchive();
  const run = await archive.createRun({
    workflowId: "sample-workflow",
    workflowTitle: "Sample Workflow",
    promptId: "prompt-1",
    schema: sampleSchema(),
    values: sampleValues(),
    outputs: [
      {
        key: "main",
        label: "Main",
        images: [
          { filename: "ok.png", subfolder: "", type: "output" },
          { filename: "missing.png", subfolder: "", type: "output" },
        ],
      },
    ],
  });

  const zip = await archive.zipImages("sample-workflow", {
    imageRefs: run.outputs[0].images.map((image) => ({ runId: run.id, imageId: image.id })),
  });
  const bytes = await collect(zip.stream);
  const text = bytes.toString("latin1");

  assert.match(zip.filename, /sample-workflow-outputs\.zip/);
  assert.equal(text.includes("ok.png"), true);
  assert.equal(text.includes("missing-files.txt"), true);

  const updated = await archive.getRun("sample-workflow", run.id);
  assert.equal(updated.outputs[0].images[1].missing, true);
});

async function createArchive() {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "mobileui-runs-"));
  return new RunArchive({
    rootDir,
    user: "defaultuser",
    comfy: {
      async fetchImage(image) {
        if (image.filename === "missing.png") throw new Error("gone");
        return {
          bytes: Buffer.from(`image-bytes:${image.filename}`, "utf8"),
          contentType: "image/png",
        };
      },
    },
  });
}

function sampleSchema() {
  return {
    inputs: [
      { key: "prompt", label: "Prompt", kind: "text" },
      { key: "seed", label: "Seed", kind: "seed", defaultSeed: 1, mode: "fixed" },
      { key: "size", label: "Size", kind: "size", defaultWidth: 512, defaultHeight: 768 },
      { key: "photo", label: "Photo", kind: "image" },
    ],
  };
}

function sampleValues() {
  return {
    prompt: "a product shot",
    seed: { seed: 42, mode: "fixed" },
    size: { width: 1024, height: 1024 },
    photo: "uploaded.png",
  };
}

function sampleOutputs() {
  return [
    {
      key: "main",
      label: "Main",
      images: [
        { filename: "main-a.png", subfolder: "", type: "output" },
        { filename: "main-b.png", subfolder: "", type: "output" },
      ],
    },
    {
      key: "alt",
      label: "Alt",
      images: [{ filename: "alt-a.png", subfolder: "MobileUI", type: "temp" }],
    },
  ];
}

async function collect(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}
