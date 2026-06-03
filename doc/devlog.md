# devlog 2026-06-04 00:39 Improve mobile seed and size controls

### Changed

- Reworked the seed field into a compact mobile-first controller with mode, random, and reset actions beside the title and a normal-size seed number input.
- Reworked manual size mode so width and height steppers fit on one mobile row.
- Reworked aspect + MP size mode to use four quick aspect-ratio buttons (`1:1`, `3:2`, `16:9`, `21:9`), one orientation toggle, and a compact MP stepper on the same row as the size readout.
- Removed the decorative ratio-shape boxes from aspect buttons.
- Added `9:21` support so the `21:9` quick ratio can be toggled to portrait without being normalized away.
- Updated and reinstalled the ComfyUI custom node package because the size node dropdown choices changed.

### Verification

- `npm test` passes with 11 automated tests.
- `npm run build` passes as a build check.
- CSS scan found no green color tokens and no non-zero border radius.
- Browser mobile viewport checks confirmed:
  - Aspect mode shows `1:1`, `3:2`, `16:9`, `21:9`, and one orientation toggle.
  - MP and generated size readout fit on one row.
  - Manual width/height mode keeps width and height steppers on one row.
  - The selected workflow still renders 9 controls and no rounded elements.
- `npm run install:comfy-node` completed and source/target hashes matched for `nodes.py`, `README.md`, and `__init__.py`.
- ComfyUI must be restarted before the updated custom node dropdown choices appear in ComfyUI.
- Complete ComfyUI end-to-end generation through `/api/run` was not run for this entry.

# devlog 2026-06-04 00:06 Migrate neutral tool style to React frontend

### Changed

- Migrated the selected neutral black/gray square-edged tool style from the static prototype into the real React frontend.
- Reworked the existing wrapper layout into a desktop tool surface with a left workflow library, center generated MobileUI form, and right declared output/result panel.
- Added a compact mobile switcher and kept mobile workflow selection on the existing picker.
- Preserved existing behavior only: workflow listing/selection, upload, upload conflict dialog, delete confirmation, per-workflow drafts, reset defaults, dynamic controls, run submission, and result display.
- Removed the previous rounded light mobile-card visual style from the production frontend.
- Did not change backend behavior or custom node files.

### Verification

- `npm test` passes with 11 automated tests.
- `npm run build` passes as a build check.
- CSS scan found no green color tokens and no non-zero border radius.
- Complete ComfyUI end-to-end generation through `/api/run` was not run for this entry.

# devlog 2026-06-03 23:04 Convert dark AI hero prototype into neutral tool mockup

### Changed

- Reworked `design-prototypes/dark-ai-hero-console` from a marketing-style hero page into a full tool mockup.
- Removed the oversized hero section and switched to a first-screen application layout.
- Changed the visual direction to neutral black/gray/white with no green accent color.
- Mocked the current wrapper structure and states: workflow library, upload action, conflict actions, delete confirmation, active workflow header, ComfyUI status, draft/reset controls, generated MobileUI form controls, run status, prompt id, declared output preview, recent history, and failure detail.
- Kept the prototype static-only and square-edged.
- Existing React wrapper source files were not changed.

### Verification

- Static HTML/CSS/vanilla JS prototype only.
- No runtime code changed.

# devlog 2026-06-03 22:45 Add dark AI hero console prototype

### Changed

- Added a third standalone static prototype under `design-prototypes/dark-ai-hero-console`.
- Adapted a modern shadcn/Tailark-style dark AI hero direction into a ComfyUI MobileUI wrapper concept.
- Used blurred reveal animation, fixed translucent nav, large hero headline, product-preview console, capability strip, and simulated run state updates.
- Kept the design square-edged to respect the no-rounded-corners preference.
- Documented the prototype path in README.
- Existing React wrapper source files were not changed.

### Verification

- Static HTML/CSS/vanilla JS prototype only.
- No runtime code changed.

# devlog 2026-06-03 22:37 Add hardline no-radius engineering console prototype

### Changed

- Added a second standalone static prototype under `design-prototypes/hardline-engineering-console`.
- Explored a sharp-edged engineering/product-catalog direction with no rounded corners, high-contrast grid lines, dense controls, square status LEDs, and instrument-like parameter panels.
- Documented the prototype path in README.
- Existing React wrapper source files were not changed.

### Verification

- Static HTML/CSS/vanilla JS prototype only.
- No runtime code changed.

# devlog 2026-06-03 22:24 Add static Studio Console 2026 design prototype

### Changed

- Added a standalone static prototype under `design-prototypes/studio-console-2026`.
- The prototype sketches a 2026-style MobileUI Studio Console with workflow library, parameter controls, run status, result preview, responsive mobile layout, and a small simulated run interaction.
- Documented the prototype path in README.
- Existing React wrapper source files were not changed.

### Verification

- Static HTML/CSS/vanilla JS prototype only.
- No runtime code changed.
- Previous `npm test` and `npm run build` checks passed before this prototype was added.

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
