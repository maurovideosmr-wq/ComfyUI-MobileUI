# ComfyUI-MobileUI

声明节点包，用于在 ComfyUI workflow 中标记哪些参数要暴露给移动端 WebUI。

## 节点

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
- `MobileUI LoRA Stack Input`
- `MobileUI Trigger Words Toggle`
- `MobileUI Workflow Metadata`

## 用法

- `MobileUI Text Input` 输出 `STRING`，连接到文本输入。CLIP Text Encode 的 `text` 默认是 widget，需要先右键把 `text` 转成 input。
- `MobileUI Seed Input` 输出 `INT`，连接到 KSampler 的 `seed`。KSampler 的 `seed` 默认是 widget，需要先右键把 `seed` 转成 input。
- `MobileUI Image Input` 输出 `IMAGE` 和 `MASK`，连接到需要图片的节点。
- `MobileUI Image Output` 接收 `IMAGE`，连接到最终要给移动端展示的图片。
- `MobileUI Size Input` 输出 `width` 和 `height`。
- `MobileUI Number Input` 输出 `value_int` 和 `value_float`。
- `MobileUI Select Input` 输出 `value`。
- 模型和采样 selector 输出 wildcard-compatible 原始值，可以连接到 ComfyUI 的 combo/widget 输入，例如 `vae_name`、`clip_name`、`unet_name`、`sampler_name`、`scheduler`。
- selector 节点里的默认值字段是 ComfyUI 下拉框，不需要手打文件名或 sampler 名。
- `MobileUI LoRA Stack Input` 输出 wildcard-compatible LoRA syntax 文本，例如 `<lora:name:1.00>`，用于连接 `LoRA Text Loader (LoraManager)` 的 `lora_syntax` 输入。它只声明和输出文本，不加载 LoRA。
- `MobileUI Trigger Words Toggle` 接收 `LoRA Text Loader (LoraManager)` 的 `trigger_words` 输出，并按移动端开关状态输出过滤后的 `STRING`，用于连接 prompt concat、prompt merge 或其他文本输入。它只负责开关词，不提供 trigger word 权重；LoRA 加载权重仍在 LoRA Stack 里调。
- 推荐接线：

```text
MobileUI LoRA Stack Input.lora_syntax
  -> LoRA Text Loader (LoraManager).lora_syntax

LoRA Text Loader (LoraManager).trigger_words
  -> MobileUI Trigger Words Toggle.trigger_words
  -> concat / prompt merge / text input
```

不要在 `MobileUI Trigger Words Toggle` 后面再串 `TriggerWord Toggle (LoraManager)`。Lora Manager 自带 toggle 有自己的原始消息缓存，接在动态 trigger 源后面时可能直接透传上游文本，导致开关看起来没效果。

- `MobileUI Workflow Metadata` 是 workflow 库卡片信息节点，不连接图输入输出。字段包括 `workflow_id`、`title`、`description`、`cover_image`、`tags`、`author`、`version`、`sort_order`。
- `cover_image` 使用 ComfyUI 的图片选择器。建议选择一张方图；如果没选或读取失败，移动端会显示默认封面。

移动端后端会把用户输入写回这些节点自身，然后提交 workflow 给 ComfyUI 执行。
提交前会移除 `MobileUI Workflow Metadata` 节点，所以它不会参与实际生成。
