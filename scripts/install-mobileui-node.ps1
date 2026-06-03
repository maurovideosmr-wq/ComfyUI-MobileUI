$ErrorActionPreference = "Stop"

$source = Resolve-Path "$PSScriptRoot\..\custom_nodes\ComfyUI-MobileUI"
$defaultComfy = "S:\Users\Fix\Documents\ComfyUI-Easy\ComfyUI-Easy-Install\ComfyUI"
$comfyRoot = if ($env:COMFYUI_ROOT) { $env:COMFYUI_ROOT } else { $defaultComfy }
$targetRoot = Join-Path $comfyRoot "custom_nodes"
$target = Join-Path $targetRoot "ComfyUI-MobileUI"

if (-not (Test-Path $targetRoot)) {
  throw "ComfyUI custom_nodes directory not found: $targetRoot"
}

if (Test-Path $target) {
  Remove-Item -Recurse -Force $target
}

Copy-Item -Recurse -Force $source $target
Write-Host "Installed ComfyUI-MobileUI to $target"
Write-Host "Restart ComfyUI before exporting workflow (api)."
