# Model boundaries — observed experiment log

## RunningHub CN, 2026-10-05

Real API transport/inference attempt: **TESTED**. Complete image download: **FAILED**.
Manual web success: **TESTED**, user-reported. Local ComfyUI real generation: **NOT TESTED**.

Graph overrides: image 16, instruction 8, seed 4 only. Stack: z_image_turbo_bf16.safetensors,
qwen_3_4b.safetensors, ae.safetensors. Workflow: 2106824243966201857.
Seed: 671807066932685; task: 2106831486408949762. Input: authorized geometric illustration,
jacket CHANGE and face/hair KEEP. Instruction: Change the jacket to cool blue.
Requested candidates: **1**. Create calls: **1**. Remote outputs: original 17/generated 11, both PNG.
Attempt: **34.000 seconds**.

Observed boundary: generated output used rh-images-tos.xiaoyaoyou.com, rejected by the strict
download allowlist. No image reached evaluation. There are therefore **no actual visual/pixel
findings** about adherence, protected damage, drift, artifacts, seed variance or ranking yet.
Inverse-alpha conversion has deterministic and official-source evidence; its application to actual
output pixels remains unverified.

The user's manually tested workflow note says the redraw setup expects existing content in the
edited region. This request used existing jacket content and did **not** compare blank-area creation.
That limitation is unverified and cannot become a universal Z-Image claim.

[Execution evidence](REAL_PROVIDER_VALIDATION.md) retains the safe failure. No automatic paid retry.
The existing task can be retrieved after an exact-host decision without another inference charge.
Human reviewer, preferred candidate, ranking judgment and artifact review remain **pending**.

## Earlier evidence

September/October 2 discovery lacked cloud configuration and an available local ComfyUI service.
Those historical NOT TESTED records describe that environment then. This session received the actual
server configuration and API export.

Mock intentionally drifts outside CHANGE in two candidates. It proves evaluator/ranking/warnings/
Ghost behavior; it cannot establish model quality, instruction adherence or identity.
