# Actual human semantic review

Original object: white porcelain teapot. User-confirmed target: red ceramic mug.
The user viewed all actual A/B/C outputs in seed order 6100/6101/6102 and replied:

> A/B/C 全部 FAIL：茶壶均未替换，均无明确马克杯；KEEP 基本保持；有新增或叠加伪影；无成功展示候选

| Candidate | Object replaced? | Target recognizable? | KEEP preserved? | Artifacts | Semantic verdict |
| --- | --- | --- | --- | --- | --- |
| A | NO | NO | YES, basically | Added/overlaid artifacts | FAIL |
| B | NO | NO | YES, basically | Added/overlaid artifacts | FAIL |
| C | NO | NO | YES, basically | Added/overlaid artifacts | FAIL |

Outside drift: the user reports KEEP basically preserved and provides no further local drift detail.
Automatic outside-CHANGE drift is reported separately: A 1.191926%, B 1.132740%, C 1.185786%.
Do not infer exact pixel preservation or absence of drift from the human reply.

System suggested **B** for existing pixel constraints. No human preference was stated;
no successful showcase candidate was chosen. All three fail verdicts and notes are persisted through
the existing product review API and included in the standard product receipt.

**SUCCESS CASE 02 FAILED. REAL SUCCESS CASE: NO. PORTFOLIO-READY: NO.**
The one-round stop rule applies. No additional generation.
