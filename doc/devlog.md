# devlog 2026-06-03 22:00 Add workflow delete confirmation and dedupe duplicate controls

### Changed

- Added a delete action for user-uploaded workflows in the workflow picker.
- Added a confirmation dialog before deleting a workflow.
- Deleting a workflow now clears that workflow's browser draft without touching other workflow drafts.
- Kept project example workflows read-only in the picker.
- Fixed duplicate frontend controls when an API workflow contains multiple MobileUI input nodes with the same `key` and kind.
- Documented that duplicate same-key controls are shown once in the mobile UI while submitted values still patch every matching node.

### Verification

- Inspected `workflows/defaultuser/anima-1-0-turbo/workflow.json` and confirmed it contains two `MobileUI VAE Selector` nodes with key `vae`.
- `npm test` passes with 11 automated tests.
- `npm run build` passes as a build check.
- Complete ComfyUI end-to-end generation through `/api/run` was not run for this entry.

# devlog 2026-06-03 21:46 Add workflow library and metadata node

### Changed

- Added a workflow library layer with project examples and per-basic-auth-user uploaded workflows.
- Added default basic auth credentials `defaultuser` / `defaultpass`, configurable with `BASIC_AUTH_USER` and `BASIC_AUTH_PASS`.
- Added workflow library endpoints for listing, loading, uploading, overwrite, duplicate save, delete, and cover retrieval.
- Added upload conflict handling for same hash, same `workflow_id`, and same title.
- Added `MobileUI Workflow Metadata` custom node with workflow card fields and optional cover image selection.
- Added metadata parsing and prompt stripping so metadata is used for the library but removed before ComfyUI execution.
- Reworked the front end around a workflow picker, active workflow selection, upload conflict dialog, per-workflow draft persistence, and reset-to-original-defaults.
- Documented workflow library storage, metadata fallback behavior, auth, and draft reset semantics.

### Verification

- `npm test` passes with 11 automated tests.
- `npm run build` passes as a build check.
- Started a temporary wrapper on port `3011` with `COMFYUI_URL=http://192.168.124.41:8188`; `/api/workflows` returned 2 project workflows and `/api/workflows/project-anima-mobile` returned a schema with 9 inputs and 1 output.
- `npm run install:comfy-node` completed and source/target hashes matched for `nodes.py`, `README.md`, and `__init__.py`.
- Complete ComfyUI end-to-end generation through `/api/run` was not run for this entry.

# devlog 2026-06-03 21:02 Fix selector node dropdowns and combo connections

### Changed

- Fixed VAE, CLIP, Diffusion Model, Sampler, and Scheduler selector outputs so they can connect to ComfyUI combo/widget inputs.
- Changed selector default fields in ComfyUI from hand-typed strings to real dropdowns:
  - VAE from `folder_paths.get_filename_list("vae")`
  - CLIP from `folder_paths.get_filename_list("text_encoders")`
  - Diffusion Model from `folder_paths.get_filename_list("diffusion_models")`
  - Sampler from `comfy.samplers.KSampler.SAMPLERS`
  - Scheduler from `comfy.samplers.KSampler.SCHEDULERS`
- Added a local wildcard-compatible output type for selector outputs without depending on third-party nodes.

### Verification

- `npm test` passes.
- `npm run build` passes as a build check.
- `example_workflows/anima mobile.json` parses through `/api/workflow/schema`.
- `npm run install:comfy-node` completed and source/target custom node hashes matched.
- Requires ComfyUI restart before verifying the fixed node connection behavior in the ComfyUI UI.

# devlog 2026-06-03 20:31 Implement v2 MobileUI custom nodes and selectors

### Changed

- Added 8 custom nodes: Size Input, Number Input, Select Input, VAE Selector, CLIP Selector, Diffusion Model Selector, Sampler Selector, and Scheduler Selector.
- Added backend schema parsing and patch logic for v2 node kinds.
- Added wrapper proxy endpoints for ComfyUI model lists and KSampler object info.
- Added mobile controls for size snapping, number display modes, select options, searchable model selectors, and sampler/scheduler selectors.
- Updated README and custom node README for the expanded node set.

### Verification

- `npm test` passes with 8 automated tests.
- `npm run build` passes as a build check.
- `npm run install:comfy-node` completed and source/target custom node hashes matched.
- ComfyUI proxy endpoints returned real VAE, text encoder, diffusion model, sampler, and scheduler options.
- Existing workflow complete path still succeeds:

```text
promptId: 2b54349d-2bea-437a-bd24-68ed42eacbac
result: http://192.168.124.41:8188/view?filename=result_temp_oxrdx_00005_.png&subfolder=MobileUI&type=temp
```

### Note

- Current running ComfyUI process has not loaded the new custom nodes yet: `/object_info/MobileUI%20Size%20Input` returned `{}`.
- Restart ComfyUI before creating/exporting workflows that use the new v2 nodes.
- A complete end-to-end run with a new v2-node workflow is pending after that restart.

# devlog 2026-06-03 20:15 Add custom node delivery rule to agent files

### Changed

- Added `agent.md` as a singular-name pointer for tools that do not look for `AGENTS.md`.
- Updated `AGENTS.md` with the user's ComfyUI root, port, custom node install target, and the rule that any custom node change must be copied into the ComfyUI custom node directory before delivery.
- Updated README to mention both agent instruction files.

### Verification

- Documentation change plus custom node delivery verification requested by user.
- Reinstalled `ComfyUI-MobileUI` after this entry and verified source/target hashes in the follow-up command.

# devlog 2026-06-03 20:08 Add MobileUI field description helper text

### Changed

- Added `description` to all four MobileUI custom nodes.
- Backend schema now exposes `description`.
- Mobile UI now displays description as helper text under the field label.
- Output declarations can also show description text in the output summary.
- `description` is display-only and does not affect ComfyUI generation.

### Verification

- Added automated schema coverage for `description`.
- `npm test` passes.
- `npm run build` passes as a build check.
- Reinstalled `ComfyUI-MobileUI` custom nodes into the ComfyUI custom node directory.
- Complete ComfyUI path verified with an older workflow that does not yet include `description`, confirming backward compatibility.
- Real run returned:

```text
promptId: e0f50006-72e0-4c60-a969-b182ed6c9843
result: http://192.168.124.41:8188/view?filename=result_temp_jdxcs_00012_.png&subfolder=MobileUI&type=temp
```

# devlog 2026-06-03 20:00 Make seed mode editable on mobile

### Changed

- Updated the mobile seed field from a read-only mode label to an editable mode selector.
- Seed values are now submitted as `{ seed, mode }`.
- Backend seed resolution now lets mobile-submitted mode override the workflow default mode.
- Preserved compatibility with old numeric-only seed submissions.

### Verification

- Added automated coverage for mobile-submitted seed mode override.
- `npm test` passes.
- `npm run build` passes as a build check.
- Complete ComfyUI path verified with `COMFYUI_URL=http://192.168.124.41:8188`.
- Real run returned:

```text
promptId: f1066175-c63f-42e5-9395-911145406cd4
result: http://192.168.124.41:8188/view?filename=result_temp_jdxcs_00007_.png&subfolder=MobileUI&type=temp
```

# devlog 2026-06-03 19:50 Add agent instructions and testing language rule

### Changed

- Added `AGENTS.md` for Codex-readable project instructions.
- Required future agent sessions to read `README.md` and `doc/devlog.md` before planning or editing.
- Required meaningful changes to update both README and devlog.
- Clarified that build checks are not tests.
- Defined complete testing as the real end-to-end ComfyUI path: status check, schema parse, `/api/run`, and a real output image URL.

### Verification

- Documentation-only change. No runtime code changed.

# devlog 2026-06-03 19:46 MVP usable mobile ComfyUI wrapper

### Goal

Build a local mobile-friendly wrapper for ComfyUI workflows. The MVP lets workflow authors expose a small set of C-end controls from a complex `workflow (api)` export.

### Implemented

- Created a Node/Vite app in `D:\Projects\comfyui_dev`.
- Added an Express backend that:
  - Parses uploaded ComfyUI `workflow (api)` JSON.
  - Scans only `MobileUI ...` nodes.
  - Uploads mobile-selected images to ComfyUI.
  - Patches user values into the MobileUI nodes.
  - Submits prompts to ComfyUI.
  - Polls history and returns declared image outputs.
- Added a mobile-first React UI for:
  - Workflow upload.
  - Dynamic text, image, and seed controls.
  - Task submission.
  - Result image display.
- Added `ComfyUI-MobileUI` custom nodes:
  - `MobileUI Text Input`
  - `MobileUI Image Input`
  - `MobileUI Seed Input`
  - `MobileUI Image Output`
- Changed the custom node design from manual node-id mapping to line-based workflow integration:
  - Text and seed nodes output values.
  - Image input outputs `IMAGE` and `MASK`.
  - Image output receives `IMAGE`.
  - Users connect nodes directly in ComfyUI instead of typing hidden node IDs.
- Added `scripts/install-mobileui-node.ps1` for installing the custom node package into ComfyUI.

### Real fixes from testing

- Fixed the ComfyUI target address. The tested ComfyUI instance is reachable at:

```text
http://192.168.124.41:8188
```

- Confirmed `http://127.0.0.1:8188` was not reachable in the current environment.
- Fixed stale backend process confusion by restarting the wrapper backend with `COMFYUI_URL=http://192.168.124.41:8188`.
- Verified `D:\Projects\comfyui_dev\mobileUI_dev.json` is valid API workflow JSON.
- Fixed runtime validation failure where exported MobileUI nodes could contain empty-string `order` values. The backend now normalizes MobileUI metadata before submitting to ComfyUI.

### Verification

- `npm test` passes.
- `npm run build` passes.
- `/api/comfy/status` returns `ok:true` when `COMFYUI_URL=http://192.168.124.41:8188`.
- `mobileUI_dev.json` successfully parses through `/api/workflow/schema`.
- `mobileUI_dev.json` successfully runs through `/api/run`.
- Real ComfyUI result returned:

```text
promptId: 58263d8c-3dac-45f9-b108-e16b1d90629f
result: http://192.168.124.41:8188/view?filename=result_temp_jdxcs_00001_.png&subfolder=MobileUI&type=temp
```

### Current MVP usage

1. Install or update the custom node:

```powershell
npm run install:comfy-node
```

2. Restart ComfyUI.
3. In ComfyUI, use MobileUI nodes and connect them by wires.
4. Export `workflow (api)`.
5. Start the wrapper with the reachable ComfyUI URL:

```powershell
$env:COMFYUI_URL="http://192.168.124.41:8188"
npm start
```

6. Open:

```text
http://127.0.0.1:3008
```

### Known MVP limits

- Supports only uploaded `workflow (api)` JSON, not normal editor workflow JSON.
- Supports text input, image input, seed input, and image output only.
- Does not include account system, workflow marketplace, persistent app registry, billing, or multi-user queueing.
- Some ComfyUI widgets such as CLIP `text` and KSampler `seed` must be converted to inputs before they can be wired.
