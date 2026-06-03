# ComfyUI Mobile Wrapper

MVP local app for turning complex ComfyUI `workflow (api)` exports into a mobile-friendly WebUI.

The workflow author adds `MobileUI ...` nodes inside ComfyUI, connects them with wires, exports `workflow (api)`, and uploads that JSON in the wrapper. The wrapper scans only MobileUI nodes, renders a phone-friendly form, patches user input into those nodes, submits the workflow to ComfyUI, and displays the declared image output.

## Quick Start

```powershell
cd D:\Projects\comfyui_dev
npm install
npm run install:comfy-node
```

Restart ComfyUI after installing the custom nodes.

Start the wrapper against the tested ComfyUI endpoint:

```powershell
$env:COMFYUI_URL="http://192.168.124.41:8188"
npm start
```

Open:

```text
http://127.0.0.1:3008
```

The wrapper uses basic auth. Defaults are:

```text
user: defaultuser
pass: defaultpass
```

Override them when needed:

```powershell
$env:BASIC_AUTH_USER="defaultuser"
$env:BASIC_AUTH_PASS="change-me"
```

For development with Vite:

```powershell
$env:COMFYUI_URL="http://192.168.124.41:8188"
npm run dev
```

## MobileUI Nodes

Installed package:

```text
S:\Users\Fix\Documents\ComfyUI-Easy\ComfyUI-Easy-Install\ComfyUI\custom_nodes\ComfyUI-MobileUI
```

Available nodes:

- `MobileUI Text Input`
- `MobileUI Image Input`
- `MobileUI Seed Input`
- `MobileUI Image Output`
- `MobileUI Size Input`
- `MobileUI Number Input`
- `MobileUI Select Input`
- `MobileUI VAE Selector`
- `MobileUI CLIP Selector`
- `MobileUI Diffusion Model Selector`
- `MobileUI Sampler Selector`
- `MobileUI Scheduler Selector`
- `MobileUI Workflow Metadata`

Use them by wiring, not by typing hidden node IDs:

- `MobileUI Text Input` outputs `STRING`.
- `MobileUI Seed Input` outputs `INT`.
- `MobileUI Image Input` outputs `IMAGE` and `MASK`.
- `MobileUI Image Output` receives `IMAGE` and marks the image returned to the mobile UI.
- `MobileUI Size Input` outputs `width` and `height` as `INT`.
- `MobileUI Number Input` outputs `value_int` and `value_float`.
- `MobileUI Select Input` outputs `value` as `STRING`.
- Model and sampler selector nodes output wildcard-compatible primitive values so they can connect to ComfyUI combo/widget inputs such as `vae_name`, `clip_name`, `unet_name`, `sampler_name`, and `scheduler`.
- `MobileUI Workflow Metadata` is a dummy metadata node for the workflow library. It does not connect to the graph and is removed before the wrapper submits the prompt to ComfyUI.

For widget fields such as CLIP Text Encode `text` or KSampler `seed`, right-click the widget in ComfyUI and convert it to an input before connecting.

Shared node fields:

- `key`: internal field key used by the wrapper payload.
- `label`: visible field name in the mobile UI.
- `description`: visible helper text shown under the field name. It only helps users understand the field and does not affect generation.
- `placeholder`: visible placeholder text where the node supports text entry.
- `required`: marks a mobile input as required.
- `order`: visible sort order. Smaller numbers appear earlier.

The mobile seed control lets users edit both the seed value and the mode:

- `fixed`
- `randomize`
- `increment`
- `decrement`

Additional v2 controls:

- Size input supports manual width/height and aspect ratio + megapixels. Mobile values snap to 8-pixel steps by default.
- Number input supports slider, stepper, and plain input display modes.
- Select input uses newline-separated options from `options_text`.
- VAE, CLIP, and Diffusion Model selectors read options through ComfyUI model APIs.
- Sampler and Scheduler selectors read options from ComfyUI `object_info/KSampler`.
- Inside ComfyUI, selector default fields are dropdowns backed by the same model/sampler lists, not hand-typed strings.
- Workflow Metadata fields are `workflow_id`, `title`, `description`, `cover_image`, `tags`, `author`, `version`, and `sort_order`.

## Workflow Library

The front end automatically loads workflows from:

```text
example_workflows
workflows\<basic-auth-user>
```

Project examples are read-only. Uploaded workflows are saved under the current basic-auth user:

```text
workflows\defaultuser\<workflow-id>\workflow.json
workflows\defaultuser\<workflow-id>\manifest.json
workflows\defaultuser\<workflow-id>\cover.<ext>
```

Workflow identity uses this fallback order:

```text
workflow_id -> title slug -> workflow hash
```

Metadata is optional. If `MobileUI Workflow Metadata` is missing or incomplete, the library falls back per field:

```text
title       -> uploaded file name -> workflow id
description -> empty
cover       -> default generated cover
tags        -> empty list
version     -> empty
sort_order  -> 0
```

When a metadata cover image is selected, the backend tries to read it from ComfyUI input images and save a local cover snapshot. If it cannot read the image, the workflow remains usable and the picker shows the default cover.

Upload conflict behavior:

- Same workflow hash: the workflow already exists, so the picker selects the existing item.
- Same `workflow_id` with different hash: the user chooses overwrite, incremental save, or cancel.
- Same title with different hash: the user chooses overwrite, incremental save, or cancel.

Each workflow keeps its own browser draft values in `localStorage`. Switching workflows, closing the picker, and refreshing the page preserve typed values for that browser. `恢复默认` clears only the current workflow draft and rebuilds values from the original API workflow defaults. It does not edit `workflow.json`.

User-uploaded workflows can be deleted from the workflow picker after a confirmation dialog. Deleting a workflow also clears that workflow's browser draft. Project example workflows are read-only and do not show a delete action.

If a workflow contains multiple MobileUI input nodes with the same `key` and the same kind, the mobile UI shows one control for that key. The submitted value is still applied to every matching node when the workflow runs.

## Workflow

1. Build the real ComfyUI graph.
2. Add MobileUI input/output nodes.
3. Wire MobileUI nodes into the graph.
4. Optionally add `MobileUI Workflow Metadata` for the library card.
5. Export `workflow (api)`.
6. Upload the JSON or place it in the project workflow folder.
7. Pick it from the workflow picker.
8. Fill the generated mobile form.
9. Run and view the returned image.

## Scripts

```powershell
npm run install:comfy-node
npm start
npm run dev
npm test
npm run build
```

## Verification

- `npm test` runs automated tests for the wrapper logic.
- `npm run build` is only a build check. It does not prove the ComfyUI workflow can run.
- `/api/comfy/status` works with `COMFYUI_URL=http://192.168.124.41:8188`.
- `/api/comfy/models/vae`, `/api/comfy/models/text_encoders`, `/api/comfy/models/diffusion_models`, and `/api/comfy/object-info/KSampler` proxy ComfyUI options for selector controls.
- `/api/workflows` lists project and uploaded workflow library entries.
- `mobileUI_dev.json` parses and runs successfully through the wrapper.
- Complete testing means the real end-to-end path succeeds: status check, workflow schema parse, `/api/run`, and a real ComfyUI output image URL.

Dev history is in `doc/devlog.md`.

Agent project instructions are in `AGENTS.md`.
Compatibility pointer for singular-name tools is in `agent.md`.
