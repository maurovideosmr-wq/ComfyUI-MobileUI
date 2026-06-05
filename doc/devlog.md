# devlog 2026-06-06 00:41 Fix trigger word toggle filtering

### Changed

- Inspected the real ComfyUI saved workflow at `S:\Users\Fix\Documents\ComfyUI-Easy\ComfyUI-Easy-Install\ComfyUI\user\default\workflows\anima mobile.json`.
- Found the active trigger path had an extra `TriggerWord Toggle (LoraManager)` node after `MobileUI Trigger Words Toggle`.
- Bypassed that extra Lora Manager toggle in the ComfyUI saved workflow so the path is now:
  - `LoRA Text Loader (LoraManager).trigger_words`
  - `MobileUI Trigger Words Toggle.filtered_trigger_words`
  - `StringConcatenate.string_a`
- Synced the wrapper's uploaded API workflow at `workflows/defaultuser/anima-1-0-turbo/workflow.json` to use `MobileUI Trigger Words Toggle` directly.
- Updated `workflows/defaultuser/anima-1-0-turbo/manifest.json` with the new workflow hash.
- Left backups:
  - `anima mobile.json.before-trigger-bypass-20260605-1640.bak`
  - `workflow.json.before-trigger-bypass-20260605-1640.bak`
  - `manifest.json.before-trigger-bypass-20260605-1640.bak`
- Made `MobileUI Trigger Words Toggle` match saved word state by normalized word text, so per-word toggles still apply if Lora Manager changes whitespace or group punctuation.
- Fixed the actual Light Concepts failure mode: Lora Manager emits trigger words as `dispersion,, hue shifting,, ...`, while the mobile UI stores the selected LoRA as one group. Turning the group off now propagates inactive state to each child word, so runtime `,,`-separated words are filtered out.
- Removed mobile trigger-word weight behavior. Trigger words are on/off only; LoRA weights remain controlled by `MobileUI LoRA Stack Input`.
- Updated README files to document the direct wiring and the reason not to put `TriggerWord Toggle (LoraManager)` after the MobileUI toggle.

### Verification

- Re-read `anima mobile.json` and confirmed node `110` now receives `string_a` from node `109` directly through link `172`.
- Re-read `workflows/defaultuser/anima-1-0-turbo/workflow.json` and confirmed `110.string_a` is `["109", 0]`.
- Confirmed `MobileUI Trigger Words Toggle.allow_strength_adjustment` is now false in both the ComfyUI saved workflow and wrapper API workflow.
- Ran a direct local Python check against `custom_nodes/ComfyUI-MobileUI/nodes.py`:
  - Light Concepts group `active:false` with Lora Manager runtime text `dispersion,, hue shifting,, ...` returns an empty string.
  - Partial child-word toggles return only the still-active words.
- `npm test` passed with 16 automated tests.
- `npm run build` passed as a build check.
- `npm run install:comfy-node` completed.
- Source/target SHA256 hashes match for `nodes.py`, `README.md`, and `__init__.py`.
- ComfyUI must be restarted before the running process uses the updated `nodes.py`; complete post-restart end-to-end verification is still pending.

# devlog 2026-06-04 15:15 Fix ComfyUI anima mobile LoRA loader wiring

### Changed

- Inspected the real ComfyUI user workflow at `S:\Users\Fix\Documents\ComfyUI-Easy\ComfyUI-Easy-Install\ComfyUI\user\default\workflows\anima mobile.json`.
- Fixed node `105` from `Lora Loader (LoraManager)` to `LoRA Text Loader (LoraManager)`.
- Changed node `105` input slot `1` from `text` / `AUTOCOMPLETE_TEXT_LORAS` to `lora_syntax` / `STRING`.
- Changed link `144` from `AUTOCOMPLETE_TEXT_LORAS` to `STRING`.
- Left `MobileUI LoRA Stack Input` node `108` default syntax as `<lora:anima-turbo-lora-v0.2:0.70>`.
- Created a backup beside the workflow: `anima mobile.json.before-lora-text-loader-202606040714.bak`.

### Verification

- Re-read the edited JSON and confirmed:
  - node `105` type is `LoRA Text Loader (LoraManager)`,
  - input slot `1` is `lora_syntax`,
  - link `144` connects `MobileUI LoRA Stack Input.lora_syntax` to node `105` slot `1` as `STRING`.
- Confirmed Lora Manager can find `anima-turbo-lora-v0.2` in `/api/lm/loras/list`.
- `/api/lm/loras/get-trigger-words?name=anima-turbo-lora-v0.2` returned an empty trigger word list, which means this LoRA has no trained words metadata; that is separate from loader recognition.
- Did not run a complete generation after this workflow-file edit.

# devlog 2026-06-04 14:45 Add MobileUI LoRA manager controls

### Changed

- Added `MobileUI LoRA Stack Input` custom node for mobile LoRA selection/configuration that outputs Lora Manager syntax text such as `<lora:name:1.00>` through a `lora_syntax` output.
- Added `MobileUI Trigger Words Toggle` custom node that receives `LoRA Text Loader (LoraManager).trigger_words` and outputs filtered trigger text.
- Added backend schema parsing and patching for `lora_stack` and `trigger_words_toggle`.
- Added Lora Manager proxy endpoints:
  - `GET /api/comfy/lm/loras`
  - `GET /api/comfy/lm/loras/trigger-words?name=...`
  - `GET /api/comfy/lm/previews?path=...`
- Added a mobile-first LoRA picker with search, preview, add/remove, order, mute/unmute, and weight stepper controls.
- Added trigger word group/chip controls that sync from selected LoRAs and preserve mobile toggle state.
- Added focused automated coverage for LoRA schema parsing, syntax parsing, dedupe, max count, weight clamp, required validation, and trigger toggle patching.
- Updated README and custom node README with the new nodes, Lora Manager wiring, proxy APIs, and mobile UX behavior.
- Reinstalled the ComfyUI custom node package.

### Verification

- `npm test` passes with 16 automated tests.
- `npm run build` passes as a build check.
- CSS scan for `src/styles.css` found no green color tokens and only `border-radius: 0`.
- Started a temporary wrapper on `http://127.0.0.1:3048` with `COMFYUI_URL=http://192.168.124.41:8188`.
- `/api/comfy/status` returned `ok:true`.
- Lora Manager proxy checks passed:
  - `/api/comfy/lm/loras?page=1&pageSize=3` returned real LoRA entries with names, preview URLs, base model labels, tags, and trained words.
  - `/api/comfy/lm/loras/trigger-words?name=anima-base-1-masterpiece-v51` returned `masterpiece` and `very aesthetic`.
  - `/api/comfy/lm/loras/trigger-words?name=zit/aesthetic_exp1` returned an empty trigger word list without failing.
  - `/api/comfy/lm/previews?...` returned an `image/jpeg` preview through the wrapper.
- Browser checks with the Codex in-app browser confirmed:
  - standalone browser namespace was not exposed by `tool_search`, but the Browser runtime listed `Codex In-app Browser` (`iab`) and Chrome extension backends,
  - the temporary LoRA verification workflow schema rendered 2 inputs and 1 output,
  - default LoRA syntax parsed into a selected LoRA row,
  - trained words loaded into Trigger Words chips,
  - LoRA picker opened at 390px mobile width, searched Lora Manager entries, and had no horizontal row overflow,
  - adding `Blending - Style` updated selected syntax to two LoRAs and added the `blending` trigger chip,
  - desktop viewport kept LoRA and Trigger controls full-width inside the two-column form.
- Inspected the installed Lora Manager source and confirmed `Lora Loader (LoraManager)` discards its `text` input at runtime, while `LoRA Text Loader (LoraManager)` parses external syntax from `lora_syntax`; documentation and node output naming now point to `LoRA Text Loader (LoraManager).lora_syntax`.
- `/object_info/LoRA%20Text%20Loader%20(LoraManager)` confirmed `lora_syntax` is a force-input `STRING` and has `trigger_words` output.
- `npm run install:comfy-node` completed and source/target hashes matched for `nodes.py`, `README.md`, and `__init__.py`.
- Current running ComfyUI has not been restarted after installation: `/object_info/MobileUI%20LoRA%20Stack%20Input` and `/object_info/MobileUI%20Trigger%20Words%20Toggle` returned `{}`.
- Complete new-node end-to-end ComfyUI testing through `/api/run` was not possible until ComfyUI is restarted and a real workflow using the new nodes is exported.

# devlog 2026-06-04 09:12 Add image tap preview lightbox

### Changed

- Added a front-end only full-screen image preview lightbox for `当前` and `历史` result images.
- Tapping or clicking the image area opens the preview; image action buttons keep their existing behavior and do not open it.
- History cards still render thumbnails in the result flow, while the preview opens the original image endpoint.
- The preview uses a full-screen dark overlay above the run dock and existing modals, `object-fit: contain`, a close button, overlay click close, and Escape close.
- Left the compare tab without preview triggers so split dragging and compare controls keep their current touch behavior.
- Updated README for the current/history preview behavior.
- Backend APIs and custom node files were not changed.

### Verification

- `npm test` passes with 14 automated tests.
- `npm run build` passes as a build check.
- CSS scan for `src/styles.css` found no green color tokens and only `border-radius: 0`.
- Started a temporary wrapper on `http://127.0.0.1:3038` with `COMFYUI_URL=http://192.168.124.41:8188`.
- `/api/comfy/status` returned `ok:true`.
- `/api/workflows/project-mobileui-dev` returned a valid schema with 3 inputs and 1 output.
- Real `/api/run` succeeded with prompt id `7d08ae3c-8212-4225-866d-340b504c1dac` and archived run `run-20260604011355-3c1f82a0`.
- The archived original output endpoint returned `image/png` with 773788 bytes.
- Browser mobile checks at 390px and 430px confirmed:
  - current image tap opens a full-screen preview using the original endpoint,
  - history image tap opens a full-screen preview using the original endpoint while the card keeps the thumb endpoint,
  - preview image uses `object-fit: contain`,
  - preview z-index is above the bottom run dock,
  - close button, overlay click, and Escape all close the preview,
  - history image action buttons do not open the preview,
  - compare tab has no preview trigger and clicking the split stage does not open the preview.
- A UI-triggered mobile run succeeded and stayed in `mobile-view-output`, returning current image `/api/workflows/project-mobileui-dev/runs/run-20260604011437-3bc69de2/images/img-0001/view?size=original`.
- Custom node files were not changed, so `npm run install:comfy-node` was not required.

# devlog 2026-06-04 08:44 Repair mobile result UX

### Changed

- Reworked mobile history results into a single-column full-width result flow scoped to `.history-output .image-grid`.
- Kept desktop history on the existing dense thumbnail grid.
- Compressed mobile history filters and download actions into two compact rows:
  - `最新优先` / `全部输出` / `收藏`
  - `刷新` / `选中 0` / `全部下载`
- Shortened the selected/all download button labels for mobile-friendly width.
- Moved compare A/B labels and remove actions into compact label rows with `移出` buttons beside each filename.
- Moved compare mode controls plus split, A/B toggle, and opacity controls into the top of the compare stage instead of leaving them as page-level toolbar controls.
- Restored the mobile `结果` bottom dock to the primary `开始生成` / `生成中...` action so users can keep submitting the same workflow from results.
- Left backend APIs and custom node files unchanged.

### Verification

- `npm test` passes with 14 automated tests.
- `npm run build` passes as a build check.
- CSS scan for `src/styles.css` found no green color tokens and only `border-radius: 0`.
- Started a temporary wrapper on `http://127.0.0.1:3038` with `COMFYUI_URL=http://192.168.124.41:8188`.
- `/api/comfy/status` returned `ok:true`.
- `/api/workflows/project-mobileui-dev` returned a valid schema with 3 inputs and 1 output.
- Real `/api/run` succeeded with prompt id `1823e3d6-95f2-4f60-a008-9d7ecc9f4d88` and archived run `run-20260604003930-6939b317`.
- The archived original output endpoint returned `image/png` with 829701 bytes.
- Browser mobile checks at 390px and 430px confirmed:
  - history tools and history actions stay at one row each,
  - latest history cards are single-column full width,
  - mobile history images use `object-fit: contain` and `aspect-ratio: auto`,
  - compare mode buttons are inside the stage top-left area,
  - split controls, A/B toggle, and opacity slider sit at the top of the stage,
  - A/B labels remain compact with `移出` buttons beside filenames,
  - A/B, split horizontal/vertical, and opacity modes work,
  - mobile `结果` bottom dock shows `开始生成`.
- Clicking mobile `结果` bottom `开始生成` submitted the same workflow again, stayed in `mobile-view-output`, switched to `当前`, and returned new run `run-20260604004411-d854a90e`.
- The new run appeared first in mobile history as a full-width card using the thumb endpoint with contained display.
- Custom node files were not changed, so `npm run install:comfy-node` was not required.

# devlog 2026-06-04 08:26 Refine output viewing and mobile navigation

### Changed

- Split result image rendering into current and history variants.
- `当前` now shows the original image endpoint at natural aspect ratio without square cropping.
- `历史` keeps stable square thumbnail cells but uses `object-fit: contain` so full images remain visible.
- Replaced the simple two-image compare view with a compare workspace:
  - A/B quick switching,
  - left/right and top/bottom split comparison with drag/range controls,
  - B-over-A opacity crossfade.
- Changed mobile output access from a scroll shortcut into real `参数` and `结果` views.
- Successful runs on mobile now switch to `结果`; the fixed mobile result action is `改参数`.
- Removed obsolete scroll helper and renamed the upload conflict comparison grid to avoid colliding with output compare naming.
- Updated README for the new output viewing and mobile navigation behavior.
- Custom node files were not changed.

### Verification

- `npm test` passes with 14 automated tests.
- `npm run build` passes as a build check.
- Started a temporary wrapper on `http://127.0.0.1:3026` with `COMFYUI_URL=http://192.168.124.41:8188`.
- Used a temporary authenticated browser proxy on `http://127.0.0.1:3027` for Browser verification.
- Real ComfyUI end-to-end path passed for `project-mobileui-dev`:
  - `/api/comfy/status` returned `ok:true`.
  - `/api/workflows/project-mobileui-dev` returned 3 inputs and 1 output.
  - UI generation completed through `/api/run` with prompt id `ed9671a8-2b83-419d-8717-e6be90c0e703`.
  - The run was archived as `run-20260604002208-5867c629`.
  - The archived original image endpoint returned `image/png` with 820395 bytes.
- Browser checks confirmed:
  - mobile generation auto-switched to `结果`,
  - `改参数` returned to the form and hid the output panel,
  - top `结果` returned to the output panel and hid the form,
  - current image CSS used `object-fit: contain`, `aspect-ratio: auto`, and `view?size=original`,
  - history image CSS used a square cell, `object-fit: contain`, and `view?size=thumb`,
  - compare modes worked for A/B quick switch, left/right split, top/bottom split, and opacity crossfade,
  - desktop layout still showed the three-column grid and a 420px compare stage.
- CSS scans found no green color tokens and no non-zero border radius.

# devlog 2026-06-04 07:44 Add output history downloads and AB compare

### Changed

- Added a run archive layer under `runs\<user>\<workflow-id>\<run-id>\run.json` and ignored `runs/` in git.
- `/api/run` now records successful ComfyUI results as run manifests while continuing to return the current result payload.
- Added paginated run history APIs for listing, detail, deletion, image favorite updates, image view/download, and selected/all ZIP downloads.
- Added on-demand image byte caching for thumb/original view and download requests; missing ComfyUI images are marked on the run record and included in ZIP `missing-files.txt`.
- Added `yazl` for backend ZIP generation.
- Reworked the output panel into `当前`, `历史`, and `对比` tabs.
- Added active-workflow history browsing with newest/oldest sort, favorite filter, output filter, run deletion, selected ZIP download, all-matching ZIP download, per-image download, favorites, and 2-image AB comparison.
- Documented run history storage, APIs, pagination, downloads, and comparison behavior in README.
- Custom node files were not changed.

### Verification

- `npm test` passes with 14 automated tests.
- `npm run build` passes as a build check.
- Added automated run archive coverage for:
  - multi-output runs and multiple images per output,
  - paginated listing and `nextCursor`,
  - newest/oldest sorting plus favorite and output filtering,
  - deleting a run,
  - selected ZIP download including a missing-file report.
- Started a temporary wrapper on `http://127.0.0.1:3020` with `COMFYUI_URL=http://192.168.124.41:8188`.
- Real ComfyUI end-to-end path passed for `project-mobileui-dev`:
  - `/api/comfy/status` returned `ok:true`.
  - `/api/workflows/project-mobileui-dev` returned a valid workflow schema.
  - `/api/run` returned prompt id `17ba6825-af51-4484-b547-ba0593a099b9`.
  - The run was archived as `run-20260603234554-eb965f40`.
  - The archived output image was available through the wrapper image view endpoint with `image/png`.
  - Selected-image ZIP download returned `application/zip`.

# devlog 2026-06-04 07:24 Add Browser tool availability agent rule

### Changed

- Added a Codex Browser Tool Availability section to `AGENTS.md`.
- Documented that Browser/Chrome settings or extension connection status are not enough to prove callable browser control is exposed.
- Recorded the expected diagnostic path: search active tools, then use the Browser skill with the generic Node REPL JavaScript tool and `browser-client.mjs` to list `agent.browsers`.
- Updated `agent.md` and README to point future agents to the Browser/Chrome diagnostic rule.

### Verification

- Documentation-only change. No runtime code changed.
- Custom node files were not changed, so `npm run install:comfy-node` was not required.
- Complete ComfyUI end-to-end generation through `/api/run` was not run for this entry.

# devlog 2026-06-04 07:18 Fix persistent run action and mobile output shortcut

### Changed

- Replaced the mobile switcher `status` button with a `run/output` shortcut that scrolls to the output panel.
- Moved the primary `开始生成` submit action out of the end of the generated form and into a fixed bottom dock that stays visible on desktop and mobile.
- Kept the fixed bottom button wired to the existing workflow form submission path.
- Reserved bottom page padding so the fixed action does not cover the last controls.
- Tightened the mobile switcher columns so `run/output` has stable space, and raised modal layering above the fixed run dock.
- Updated README frontend behavior notes.

### Verification

- `npm test` passes with 11 automated tests.
- `npm run build` passes as a build check.
- Started a temporary wrapper on `http://127.0.0.1:3014` with `COMFYUI_URL=http://192.168.124.41:8188`; `/api/config` returned the expected ComfyUI URL and `/api/workflows` returned valid workflow entries.
- Used a temporary authenticated proxy and headless Chrome screenshots to verify the fixed bottom `开始生成` dock appears on desktop and mobile-width layouts, the mobile switcher shows `run/output` at 500px width, and workflow modals layer above the fixed dock.
- CSS scan found no green color tokens and no non-zero border radius.
- Custom node files were not changed, so `npm run install:comfy-node` was not required.
- Complete ComfyUI end-to-end generation through `/api/run` was not run for this entry.

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
