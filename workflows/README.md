# Repository-owned image inpainting workflows

RunningHub uses **z-image-inpaint-api.json**, copied from the actual user-supplied API export.
Only the previous image reference is sanitized. Backend fingerprint validation runs before upload;
runtime replaces image 16/text 8/seed 4, selects generated output 11 and discards preview 17.
Stack: Z-Image Turbo UNET, Qwen CLIP, AE VAE. Mask path: 16 → 13 → 7.
This graph includes MaskBlur+, DifferentialDiffusion and FluxGuidance; it is separate from the
core-node local graph below. See [RunningHub evidence](../docs/RUNNINGHUB_INTEGRATION.md).

## Local ComfyUI graph

`inpaint-api.json` is a ComfyUI API-format graph authored for VowEdit. It is HTTP-contract tested;
real execution is NOT TESTED. It must not be called a tested model workflow yet.

Required **core** nodes: LoadImage, CheckpointLoaderSimple, CLIPTextEncode (positive/negative),
VAEEncodeForInpaint, KSampler, VAEDecode and SaveImage. No custom nodes. Use a compatible normal
SD 1.x or SDXL checkpoint providing model, CLIP and VAE. Specialized 9-channel inpainting checkpoints,
Flux, SD3, video models and arbitrary custom graphs are not supported by this latent-mask graph.
Model availability and licensing must be verified against the actual installation/account.

Runtime fields: source file in node 1; exact checkpoint in node 2; instruction in node 3; seed in node 6.
The mask is encoded as inverse alpha because LoadImage outputs `1 − alpha`. `grow_mask_by=0` avoids
deliberately enlarging CHANGE. Latent noise masking still does not guarantee preserved output pixels.
Twenty steps, CFG 7, Euler, normal scheduler and denoise 0.75 are prototype settings, not optimized
or empirically validated quality choices. Inputs are padded to multiples of eight then cropped back.

Local setup: set `COMFYUI_BASE_URL=http://127.0.0.1:8188` and `COMFYUI_CHECKPOINT` to the actual filename,
start ComfyUI separately, restart the API, select ComfyUI and explicitly Generate. VowEdit will not
install ComfyUI, download models or modify an existing installation. URLs are loopback-only.

For RunningHub setup see [integration notes](../docs/RUNNINGHUB_INTEGRATION.md).
The local adapter follows [official ComfyUI HTTP examples](https://github.com/Comfy-Org/ComfyUI/blob/master/script_examples/basic_api_example.py)
and [core nodes](https://github.com/Comfy-Org/ComfyUI/blob/master/nodes.py).
