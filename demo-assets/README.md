# Demo slots — fixtures now, human art later

All committed images in `public/fixtures/` are original, deterministic geometric artwork drawn by
`scripts/create_fixtures.py` for this project. They contain no private source photographs, external
licensed media or model inference. The portrait is a stylized fictional illustration, not a real person.
The explicit fixture declaration also appears in the landing page and Mock UI.

| Slot | Current fixture | CHANGE | KEEP | Human review |
| --- | --- | --- | --- | --- |
| [illustration](illustration/README.md) | original.png | jacket | face/hair, outside edit | NOT PERFORMED |
| [product](product/README.md) | product.png | backdrop | bottle, color, lettering | NOT PERFORMED |
| [portrait](portrait/README.md) | portrait.png | glasses area | skin/hair outside eye band | NOT PERFORMED |

These slots are prepared and exercised with Mock. They are not three completed real/human-reviewed
demonstrations. Replace only with explicitly supplied/consented project assets. Do not collect images
from private directories. Identity preservation in the portrait case remains a human claim to assess;
pixel similarity cannot prove it. The one-click studio Demo loads the illustration source, instruction
and fixture masks together; those boundaries remain editable with brush, erase, clear and reset.
The other two slots remain API-tested deterministic contracts, not one-click UI presets.

Use `manifest.json` to reproduce the three contracts. Human reviewers should record semantic
adherence, unexpected changes, acceptable deviations, artifact observations, preferred candidate,
reviewer/date and reasons for rejecting candidates. Keep negative cases. Do not populate reviewer
names or observations without an actual human review.

Use [HUMAN_REVIEW_TEMPLATE.md](HUMAN_REVIEW_TEMPLATE.md) for the actual case record. All three real
creative cases are currently pending; the [case register](../docs/DEMO_CASES.md) preserves that boundary.
