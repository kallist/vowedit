# Model boundaries — actual RunningHub experiment

## Imported candidates — separate source boundary

The imported path does not execute a model: it evaluates uploaded local assets with null seeds,
`provider=imported`, descriptive source label and `generation_source=external-import`. No provider
key is required. Simulation=false denotes absence of the Mock provider path, not proof of model
identity or a direct API call. Offline fixtures remain explicitly labelled as deterministic fixtures.

The actual Codex built-in imagegen A/B/C edits received user visual PASS, preferred A. The tool did
not expose its model/version or seed and returned 1195×1316 against a 640×704 source. Import correctly
rejects them without resize; evaluation/Ghost/receipt of those real external candidates is NOT TESTED.
No direct OpenAI provider was added; no RunningHub failure was reclassified. [Actual record](evidence/imported/blue-jacket-gpt-image).

## What was tested on 2026-10-05

RunningHub CN API: **TESTED / PASS** for generation, safe download, persistence and evaluation.
Manual web success: **TESTED**, user-reported. Local ComfyUI real generation: **NOT TESTED**.

Supplied graph: workflow 2106824243966201857; UNET z_image_turbo_bf16.safetensors,
CLIP qwen_3_4b.safetensors, VAE ae.safetensors. Image 16 → generated 11; preview 17 excluded.
Source: authorized geometric jacket illustration, CHANGE on jacket, KEEP face/hair; thresholds 98.
Instruction: **Change the jacket to cool blue.** No sampler/guidance/blur/metric tuning.

Original seed 671807066932685/task 2106831486408949762 generated once; CDN rejection was preserved.
After explicit exact-host approval, the same task was retrieved successfully with no new generation.
One normal product run used seeds **4100, 4101, 4102** and returned all three 640×704 candidates,
in **58.015 seconds** of service generation time. All A/B/C, metrics, Ghosts and receipt are preserved.

## Observations and limits

| Candidate | KEEP % | CHANGE difference % | Outside drift % | Pixel rank |
| --- | --- | --- | --- | --- |
| A | 99.066707 | 5.340332 | 0.835772 | 1 |
| B | 99.073665 | 2.494406 | 0.837546 | 3 |
| C | 99.079709 | 3.839462 | 0.836329 | 2 |

All pass the existing pixel thresholds. A is selected because outside drift is ranked before total
score. No preservation metric checks the requested color, identity or visual quality.

**Actual human evidence:** project user preferred A, then confirmed **未完成冷蓝要求**.
A's manual verdict is **fail**, persisted via the existing review API and exposed in the receipt.
This is a completed negative semantic review, not creative acceptance. Human assessment of B/C,
identity and detailed artifacts is NOT TESTED. Preference agreeing with pixel rank is not a broad
claim that the ranking is semantically reliable.

**Agent visual observations:** none of smoke/A/B/C clearly changes the jacket to cool blue. A introduces
blotchy central decoration; C introduces unusual pale fastener details. These are agent observations,
not invented human feedback. Images show changes in the expected painted jacket region. Mean inside
CHANGE difference exceeds outside for every result, consistent with the intended alpha mask direction.
Outside pixels drift about 0.84%; KEEP remains close by this metric but is not pixel-identical.
Mask blur/reconstruction and this one fixture do not establish the cause of every artifact.

This case demonstrates a real failure boundary: **pixel eligibility and semantic failure coexist**.
The API pipeline PASS proves it can execute and inspect edits; it does not certify useful edit quality.
Portfolio readiness is **NO** for this result. No additional runs were used to improve the outcome.

The user's workflow note about needing existing edited-area content remains unverified as a limitation:
this test used existing jacket content and did not compare blank-area creation. No universal Z-Image
claim, portrait identity claim or quality generalization is supported by four outputs of one fixture.

[Full record and raw artifacts](REAL_PROVIDER_VALIDATION.md) retains negative as well as successful
transport evidence. Mock still proves evaluator/ranking/retry behavior separately. Earlier missing
configuration/ComfyUI discovery records describe their historical environment, not current cloud status.
