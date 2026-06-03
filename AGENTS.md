# Project Agent Instructions

## Startup Context

At the start of every new agent session in this project, read these files before making plans or edits:

- `README.md`
- `doc/devlog.md`

Use them as the project memory for current architecture, verified behavior, environment details, and known limits.

## Documentation Discipline

After every meaningful change, update both:

- `README.md` when user-facing setup, usage, behavior, commands, environment, or verification status changes.
- `doc/devlog.md` with a new entry for what changed, why, and how it was verified.

Devlog entry title format:

```text
# devlog YYYY-MM-DD HH:mm short content summary
```

If multiple entries exist, newest entries go at the top.

## Custom Node Delivery

The user's ComfyUI install path is:

```text
S:\Users\Fix\Documents\ComfyUI-Easy\ComfyUI-Easy-Install\ComfyUI
```

The ComfyUI custom node target is:

```text
S:\Users\Fix\Documents\ComfyUI-Easy\ComfyUI-Easy-Install\ComfyUI\custom_nodes\ComfyUI-MobileUI
```

Whenever files under `custom_nodes/ComfyUI-MobileUI` are changed, delivery is not complete until the updated custom node package has been copied to the ComfyUI target. Use:

```powershell
npm run install:comfy-node
```

After installing, verify the target files match the project source, for example by checking `nodes.py` contents or file hashes. Tell the user they must restart ComfyUI before the node UI updates.

## Testing Language

Do not call `npm run build` or a successful Vite build "testing".

Use precise wording:

- `npm run build` is a build check or compilation/bundling verification.
- `npm test` is automated unit/integration testing only for the code paths covered by tests.
- A complete test for this project must include the real end-to-end ComfyUI path:
  - Wrapper backend is running.
  - `/api/comfy/status` returns `ok:true`.
  - A real exported `workflow (api)` JSON parses through `/api/workflow/schema`.
  - The same workflow runs through `/api/run`.
  - ComfyUI returns a real declared output image URL.

If the real ComfyUI endpoint is unavailable, say that complete testing was not possible and report only the checks that actually ran.

## Codex Browser Tool Availability

Do not claim that Browser, Chrome, or in-app browser control is available just because Codex settings show Browser/Chrome enabled or a browser extension says it is connected. Treat those as configuration signals only.

When diagnosing browser availability, first use `tool_search` for these exact terms:

```text
Browser
browser
browser-use
chrome
navigate
screenshot
click
type
```

Report only the callable tools actually exposed in the current session and their exact namespaces. If no standalone browser/control namespace appears, do not assume the browser is unusable yet.

For Codex Desktop Browser control, the expected working path may be the Browser skill plus the generic Node REPL JavaScript tool, not a standalone `browser.*` namespace. Search for and expose the JS execution tool with:

```text
node_repl js
mcp__node_repl__js
js
node_repl js JavaScript execution
```

Then read the Browser skill instructions and use the bundled Browser plugin's `scripts/browser-client.mjs` by absolute path. The browser runtime check is:

```js
const { setupBrowserRuntime } = await import("<browser plugin root>/scripts/browser-client.mjs");
await setupBrowserRuntime({ globals: globalThis });
nodeRepl.write(JSON.stringify(await agent.browsers.list(), null, 2));
```

Runtime browser control is available if `agent.browsers.list()` returns `Codex In-app Browser` with `type: "iab"` and/or `Chrome` with `type: "extension"`. Select `iab` for the Codex in-app browser and `extension` for the real Chrome extension backend.

If `tool_search` exposes no browser namespace but the Node REPL/browser-client runtime lists `iab` or `extension`, classify the issue as missing standalone browser namespace exposure, not Browser being unavailable. If the Node REPL JS tool cannot be exposed or `agent.browsers.list()` cannot connect, classify it as current session tool registration, plugin runtime, or rollout/gating trouble, not a project permission problem.

## Current Runtime Facts

- Project root: `D:\Projects\comfyui_dev`
- Tested ComfyUI endpoint: `http://192.168.124.41:8188`
- Tested ComfyUI port: `8188`
- User ComfyUI root: `S:\Users\Fix\Documents\ComfyUI-Easy\ComfyUI-Easy-Install\ComfyUI`
- Default wrapper URL: `http://127.0.0.1:3008`
- ComfyUI custom node install target: `S:\Users\Fix\Documents\ComfyUI-Easy\ComfyUI-Easy-Install\ComfyUI\custom_nodes\ComfyUI-MobileUI`
