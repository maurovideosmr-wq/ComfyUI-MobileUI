import folder_paths
import comfy.samplers
from nodes import LoadImage, PreviewImage


CATEGORY = "MobileUI"


class AlwaysEqualProxy(str):
    def __eq__(self, _):
        return True

    def __ne__(self, _):
        return False


ANY_TYPE = AlwaysEqualProxy("*")
CLIP_TYPES = [
    "stable_diffusion",
    "stable_cascade",
    "sd3",
    "stable_audio",
    "mochi",
    "ltxv",
    "pixart",
    "cosmos",
    "lumina2",
    "wan",
    "hidream",
    "chroma",
    "ace",
    "omnigen2",
    "qwen_image",
    "hunyuan_image",
    "flux2",
    "ovis",
    "longcat_image",
    "cogvideox",
    "lens",
    "pixeldit",
]
WEIGHT_DTYPES = ["default", "fp8_e4m3fn", "fp8_e4m3fn_fast", "fp8_e5m2"]


class MobileUITextInput:
    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("text",)
    FUNCTION = "emit"
    CATEGORY = CATEGORY

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "key": ("STRING", {"default": "prompt"}),
                "label": ("STRING", {"default": "提示词"}),
                "description": ("STRING", {"default": "", "multiline": True}),
                "placeholder": ("STRING", {"default": ""}),
                "default_value": ("STRING", {"default": "", "multiline": True}),
                "required": ("BOOLEAN", {"default": True}),
                "order": ("INT", {"default": 0, "min": -1000, "max": 1000}),
            }
        }

    def emit(self, key, label, description, placeholder, default_value, required, order):
        return (default_value,)


class MobileUIImageInput(LoadImage):
    CATEGORY = CATEGORY

    @classmethod
    def INPUT_TYPES(cls):
        base = LoadImage.INPUT_TYPES()
        return {
            "required": {
                "key": ("STRING", {"default": "image"}),
                "label": ("STRING", {"default": "上传图片"}),
                "description": ("STRING", {"default": "", "multiline": True}),
                "image": base["required"]["image"],
                "required": ("BOOLEAN", {"default": True}),
                "order": ("INT", {"default": 10, "min": -1000, "max": 1000}),
            },
        }

    def load_image(self, key, label, description, image, required, order):
        return super().load_image(image)


class MobileUISeedInput:
    RETURN_TYPES = ("INT",)
    RETURN_NAMES = ("seed",)
    FUNCTION = "emit"
    CATEGORY = CATEGORY

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "key": ("STRING", {"default": "seed"}),
                "label": ("STRING", {"default": "Seed"}),
                "description": ("STRING", {"default": "", "multiline": True}),
                "default_seed": (
                    "INT",
                    {"default": 0, "min": 0, "max": 9007199254740991},
                ),
                "mode": (["fixed", "randomize", "increment", "decrement"],),
                "order": ("INT", {"default": 20, "min": -1000, "max": 1000}),
            }
        }

    def emit(self, key, label, description, default_seed, mode, order):
        return (default_seed,)


class MobileUIImageOutput(PreviewImage):
    CATEGORY = CATEGORY

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "key": ("STRING", {"default": "result"}),
                "label": ("STRING", {"default": "结果图"}),
                "description": ("STRING", {"default": "", "multiline": True}),
                "images": ("IMAGE",),
                "order": ("INT", {"default": 100, "min": -1000, "max": 1000}),
            },
            "hidden": {"prompt": "PROMPT", "extra_pnginfo": "EXTRA_PNGINFO"},
        }

    def save_images(self, key, label, description, images, order, prompt=None, extra_pnginfo=None):
        return super().save_images(images, filename_prefix=f"MobileUI/{key}", prompt=prompt, extra_pnginfo=extra_pnginfo)


class MobileUISizeInput:
    RETURN_TYPES = ("INT", "INT")
    RETURN_NAMES = ("width", "height")
    FUNCTION = "emit"
    CATEGORY = CATEGORY

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "key": ("STRING", {"default": "size"}),
                "label": ("STRING", {"default": "尺寸"}),
                "description": ("STRING", {"default": "", "multiline": True}),
                "mode": (["manual", "aspect_mp"],),
                "default_width": ("INT", {"default": 1024, "min": 8, "max": 8192}),
                "default_height": ("INT", {"default": 1024, "min": 8, "max": 8192}),
                "default_aspect_ratio": (["1:1", "3:2", "4:3", "16:9", "21:9", "2:3", "3:4", "9:16", "9:21"],),
                "default_megapixels": ("FLOAT", {"default": 1.0, "min": 0.1, "max": 16.0, "step": 0.05}),
                "min_width": ("INT", {"default": 256, "min": 8, "max": 8192}),
                "max_width": ("INT", {"default": 2048, "min": 8, "max": 8192}),
                "min_height": ("INT", {"default": 256, "min": 8, "max": 8192}),
                "max_height": ("INT", {"default": 2048, "min": 8, "max": 8192}),
                "step": ("INT", {"default": 8, "min": 1, "max": 256}),
                "required": ("BOOLEAN", {"default": True}),
                "order": ("INT", {"default": 30, "min": -1000, "max": 1000}),
            }
        }

    def emit(self, key, label, description, mode, default_width, default_height, default_aspect_ratio, default_megapixels, min_width, max_width, min_height, max_height, step, required, order):
        return (default_width, default_height)


class MobileUINumberInput:
    RETURN_TYPES = ("INT", "FLOAT")
    RETURN_NAMES = ("value_int", "value_float")
    FUNCTION = "emit"
    CATEGORY = CATEGORY

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "key": ("STRING", {"default": "number"}),
                "label": ("STRING", {"default": "数值"}),
                "description": ("STRING", {"default": "", "multiline": True}),
                "number_type": (["int", "float"],),
                "default_value": ("FLOAT", {"default": 1.0, "min": -100000.0, "max": 100000.0, "step": 0.01}),
                "min": ("FLOAT", {"default": 0.0, "min": -100000.0, "max": 100000.0, "step": 0.01}),
                "max": ("FLOAT", {"default": 100.0, "min": -100000.0, "max": 100000.0, "step": 0.01}),
                "step": ("FLOAT", {"default": 1.0, "min": 0.001, "max": 10000.0, "step": 0.001}),
                "display": (["slider", "stepper", "input"],),
                "required": ("BOOLEAN", {"default": True}),
                "order": ("INT", {"default": 40, "min": -1000, "max": 1000}),
            }
        }

    def emit(self, key, label, description, number_type, default_value, min, max, step, display, required, order):
        return (int(default_value), float(default_value))


class MobileUISelectInput:
    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("value",)
    FUNCTION = "emit"
    CATEGORY = CATEGORY

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "key": ("STRING", {"default": "select"}),
                "label": ("STRING", {"default": "选项"}),
                "description": ("STRING", {"default": "", "multiline": True}),
                "options_text": ("STRING", {"default": "option_a\noption_b", "multiline": True}),
                "default_value": ("STRING", {"default": "option_a"}),
                "required": ("BOOLEAN", {"default": True}),
                "order": ("INT", {"default": 50, "min": -1000, "max": 1000}),
            }
        }

    def emit(self, key, label, description, options_text, default_value, required, order):
        return (default_value,)


class MobileUIVAESelector:
    RETURN_TYPES = (ANY_TYPE,)
    RETURN_NAMES = ("vae_name",)
    FUNCTION = "emit"
    CATEGORY = CATEGORY

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "key": ("STRING", {"default": "vae"}),
            "label": ("STRING", {"default": "VAE"}),
            "description": ("STRING", {"default": "", "multiline": True}),
            "default_vae_name": (folder_paths.get_filename_list("vae"),),
            "required": ("BOOLEAN", {"default": True}),
            "order": ("INT", {"default": 60, "min": -1000, "max": 1000}),
        }}

    def emit(self, key, label, description, default_vae_name, required, order):
        return (default_vae_name,)


class MobileUICLIPSelector:
    RETURN_TYPES = (ANY_TYPE, ANY_TYPE, ANY_TYPE)
    RETURN_NAMES = ("clip_name", "type", "device")
    FUNCTION = "emit"
    CATEGORY = CATEGORY

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "key": ("STRING", {"default": "clip"}),
            "label": ("STRING", {"default": "CLIP"}),
            "description": ("STRING", {"default": "", "multiline": True}),
            "default_clip_name": (folder_paths.get_filename_list("text_encoders"),),
            "default_type": (CLIP_TYPES,),
            "default_device": (["default", "cpu"],),
            "required": ("BOOLEAN", {"default": True}),
            "order": ("INT", {"default": 70, "min": -1000, "max": 1000}),
        }}

    def emit(self, key, label, description, default_clip_name, default_type, default_device, required, order):
        return (default_clip_name, default_type, default_device)


class MobileUIDiffusionModelSelector:
    RETURN_TYPES = (ANY_TYPE, ANY_TYPE)
    RETURN_NAMES = ("unet_name", "weight_dtype")
    FUNCTION = "emit"
    CATEGORY = CATEGORY

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "key": ("STRING", {"default": "diffusion_model"}),
            "label": ("STRING", {"default": "Diffusion Model"}),
            "description": ("STRING", {"default": "", "multiline": True}),
            "default_unet_name": (folder_paths.get_filename_list("diffusion_models"),),
            "default_weight_dtype": (WEIGHT_DTYPES,),
            "required": ("BOOLEAN", {"default": True}),
            "order": ("INT", {"default": 80, "min": -1000, "max": 1000}),
        }}

    def emit(self, key, label, description, default_unet_name, default_weight_dtype, required, order):
        return (default_unet_name, default_weight_dtype)


class MobileUISamplerSelector:
    RETURN_TYPES = (ANY_TYPE,)
    RETURN_NAMES = ("sampler_name",)
    FUNCTION = "emit"
    CATEGORY = CATEGORY

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "key": ("STRING", {"default": "sampler"}),
            "label": ("STRING", {"default": "Sampler"}),
            "description": ("STRING", {"default": "", "multiline": True}),
            "default_sampler_name": (comfy.samplers.KSampler.SAMPLERS,),
            "required": ("BOOLEAN", {"default": True}),
            "order": ("INT", {"default": 90, "min": -1000, "max": 1000}),
        }}

    def emit(self, key, label, description, default_sampler_name, required, order):
        return (default_sampler_name,)


class MobileUISchedulerSelector:
    RETURN_TYPES = (ANY_TYPE,)
    RETURN_NAMES = ("scheduler",)
    FUNCTION = "emit"
    CATEGORY = CATEGORY

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "key": ("STRING", {"default": "scheduler"}),
            "label": ("STRING", {"default": "Scheduler"}),
            "description": ("STRING", {"default": "", "multiline": True}),
            "default_scheduler": (comfy.samplers.KSampler.SCHEDULERS,),
            "required": ("BOOLEAN", {"default": True}),
            "order": ("INT", {"default": 91, "min": -1000, "max": 1000}),
        }}

    def emit(self, key, label, description, default_scheduler, required, order):
        return (default_scheduler,)


class MobileUIWorkflowMetadata:
    RETURN_TYPES = ()
    FUNCTION = "emit"
    CATEGORY = CATEGORY
    OUTPUT_NODE = True

    @classmethod
    def INPUT_TYPES(cls):
        base = LoadImage.INPUT_TYPES()["required"]["image"]
        cover_options = [""] + list(base[0])
        cover_config = base[1] if len(base) > 1 else {"image_upload": True}
        return {"required": {
            "workflow_id": ("STRING", {"default": ""}),
            "title": ("STRING", {"default": "Untitled Workflow"}),
            "description": ("STRING", {"default": "", "multiline": True}),
            "cover_image": (cover_options, cover_config),
            "tags": ("STRING", {"default": "", "multiline": True}),
            "author": ("STRING", {"default": ""}),
            "version": ("STRING", {"default": "1.0.0"}),
            "sort_order": ("INT", {"default": 0, "min": -1000, "max": 1000}),
        }}

    def emit(self, workflow_id, title, description, cover_image, tags, author, version, sort_order):
        return ()


NODE_CLASS_MAPPINGS = {
    "MobileUI Text Input": MobileUITextInput,
    "MobileUI Image Input": MobileUIImageInput,
    "MobileUI Seed Input": MobileUISeedInput,
    "MobileUI Image Output": MobileUIImageOutput,
    "MobileUI Size Input": MobileUISizeInput,
    "MobileUI Number Input": MobileUINumberInput,
    "MobileUI Select Input": MobileUISelectInput,
    "MobileUI VAE Selector": MobileUIVAESelector,
    "MobileUI CLIP Selector": MobileUICLIPSelector,
    "MobileUI Diffusion Model Selector": MobileUIDiffusionModelSelector,
    "MobileUI Sampler Selector": MobileUISamplerSelector,
    "MobileUI Scheduler Selector": MobileUISchedulerSelector,
    "MobileUI Workflow Metadata": MobileUIWorkflowMetadata,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "MobileUI Text Input": "MobileUI Text Input",
    "MobileUI Image Input": "MobileUI Image Input",
    "MobileUI Seed Input": "MobileUI Seed Input",
    "MobileUI Image Output": "MobileUI Image Output",
    "MobileUI Size Input": "MobileUI Size Input",
    "MobileUI Number Input": "MobileUI Number Input",
    "MobileUI Select Input": "MobileUI Select Input",
    "MobileUI VAE Selector": "MobileUI VAE Selector",
    "MobileUI CLIP Selector": "MobileUI CLIP Selector",
    "MobileUI Diffusion Model Selector": "MobileUI Diffusion Model Selector",
    "MobileUI Sampler Selector": "MobileUI Sampler Selector",
    "MobileUI Scheduler Selector": "MobileUI Scheduler Selector",
    "MobileUI Workflow Metadata": "MobileUI Workflow Metadata",
}
