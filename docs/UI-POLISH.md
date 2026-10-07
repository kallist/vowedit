# VowEdit UI polish

## 视觉方向

采用「紫罗兰创作室」：石墨灰画布、紫罗兰控件、暖纸色作品画框与疏密分明的字体。编辑页使用独立画笔工具轨道、文档栏和右侧意图检查面板；结果沿用画布与判断面板结构。CHANGE 暖色与 KEEP 蓝色继续表达不同边界。

参考 [Photoshop 的上下文工具栏](https://helpx.adobe.com/photoshop/desktop/get-started/learn-the-basics/boost-workflows-with-the-contextual-task-bar.html)将相关操作靠近任务，参考 [Pixelmator Pro 的画布与工具面板](https://support.apple.com/en-ca/guide/pixelmator-pro/pix96e754af4/mac)组织工作区。本站颜色、画框与构图是自己的设计取舍，不声称具有这些工具的功能。

实际应用用户指定的 `ui-ux-pro-max`：运行设计系统查询（variance 7 / motion 5 / density 8）及 Next.js 查询，读取布局、字体、交互和可访问性规范。采用编辑器紫罗兰方向；未套用通用营销布局，也未采用会裁切编辑源图的 object-cover 建议。字体使用本机字体栈，没有加入在线字体、脚本或依赖。

原任务的 [oil-ui 0.16.5](https://github.com/oil-oil/oil-ui/tree/e4c8f60be407a4f1ec28459eb782e8eb94447888)继续用于布局比较与独立评审。安装 SHA 为 `e4c8f60be407a4f1ec28459eb782e8eb94447888`。本轮实际运行 `build_explorer.py`，比较紫罗兰创作室、暖白艺术画廊和青灰摄影台；使用相同原图、指令、边界像素与 Mock 来源。选择创作室以容纳画布、工具和完整说明。Skill、工具、静态探索与大录屏为忽略的任务产物。

![三种工作区构图，静态探索，非产品页面](screenshots/ui-polish/directions.jpg)

## 实现与范围

- 共享 tokens、导航品牌、控件、状态、焦点与响应式样式覆盖首页、编辑、草稿、审批、结果、活动和历史。
- 意图输入仍先于画布操作进入键盘顺序；检查面板桌面显示在右侧，窄屏按原逻辑顺序展开。没有虚构图层、滤镜或缩放按钮。
- `MaskEditor` 增加原图尺寸栏，重组现有画笔／橡皮／撤销／清除／重置工具，显示 CHANGE / KEEP 状态卡。原坐标、绘制、导出、事件与禁用条件不变。
- 比较图保持自然比例，各比较层共享几何。窄屏减少画布留白，装饰性 Ghost 扫描位于图片外。没有对证据图像施加滤镜、裁切或调色。
- 保留模式滑动底板、按压反馈、主按钮扫光、候选浮起与选中线、Ghost 外框扫描、标题与内容入场。没有虚构进度；reduced-motion 关闭动画和过渡。
- 原图、raw / locked 来源、独立审核、像素推荐、当前候选、人工 verdict、用户采用与继续编辑仍独立。审批、素材加载、presentation、未保存、冲突与风险确认门槛未放宽；风险选框没有默认勾选。

重要文件：`app/globals.css`、`app/page.tsx`、`frontend/SiteChrome.tsx`、`frontend/MaskEditor.tsx`。上一轮结果／草稿／Agent 呈现变更保留。行为回归在 `e2e/ui-polish.spec.ts`；没有删除断言或禁用 CI 门禁。

API/schema、DB、后端、auth/CSRF、MCP、provider、评估与排名、部署架构均无本轮改动。没有新依赖或 lockfile 变化。未直接读取或修改真实 data、`.env`、凭据与工作流。构建和浏览器测试使用不含 `.env` 的代码副本，API 使用绝对隔离目录、Mock、`PYTHON_DOTENV_DISABLED=1`，清理继承的真实 provider 配置。

## 证据

截图为项目自有素材与隔离 Mock 的实际 Chromium 页面。Mock 像素变化不证明语义意图或模型质量。

| 证据 | 内容 |
| --- | --- |
| [编辑页 before](screenshots/ui-polish/editor-before.png) / [after](screenshots/ui-polish/editor-zh.png) | 1440px、同一项目原图、演示意图与 CHANGE / KEEP 状态，上一轮和本轮界面 |
| [艺术首页](screenshots/ui-polish/landing-zh.png) | 暖纸色画框、字体对比与作品构图，素材标为 illustrative fixture |
| [结果 before](screenshots/ui-polish/result-before.png) / [after](screenshots/ui-polish/result-after.png) | 原产品与本轮实际 Mock 结果，独立 run 的 ID 与时间会不同 |
| [390px / 200% Ghost](screenshots/ui-polish/mobile-ghost-200.png) / [前后比较](screenshots/ui-polish/mobile-compare-200.png) | 修复后真实回归 run，另一次受控绘画；不是上述演示候选的语义对比 |
| [360px / 200% 长风险警告](screenshots/ui-polish/narrow-failure-200.png) | 浏览器拦截的受控错误 fixture，无 provider 调用，未知状态下重试禁用 |
| [模式](screenshots/ui-polish/motion-mode.png) / [主按钮](screenshots/ui-polish/motion-primary.png) / [入场](screenshots/ui-polish/motion-entry.png) | 浏览器实际动画三帧的局部裁取 |

短动画的中间帧通过暂停浏览器已有动画取得，没有重建模拟动画。实际测量验证模式 260ms 位移、按钮 action-sweep 600ms、标题 220ms、Ghost ghost-scan 420ms；减少动态效果时模式过渡为 0s、Ghost 动画为 none。oil-ui 自动 motion 探测对伪元素和短动画报告过 0，未把保存截图误报为该工具动效通过。

完整比较页 `.local/ui-polish-v2/exploration/style-explorer.html`；新版探索、双语首页矩阵、完整截图与录屏在忽略的 `.local` 任务目录。公共文档不写私人绝对路径。

## 验证与评审

本地执行 ESLint、TypeScript / route typegen、11 项 frontend Vitest、webpack production build、npm audit（0 vulnerabilities）和 6 项 UI 定向回归；最终完整 Chromium 和后端门禁以 Draft PR 当前 HEAD 的 Hosted CI 为准，不以历史 SHA 的成功替代。

UI 回归在 1440、1024、768、390、360px 与 CSS zoom 1 / 2 下验证原图／overlay 几何、pointer-to-source 像素、键盘绘制／undo、中文长指令、无横向溢出、reduced motion，以及导出的 640×704 CHANGE PNG 已画／撤销像素。新增窄屏断言检查前后比较与 Ghost 图片宽度超过画布的 75%，自然比例不变；原过大内边距会违反此条件。

另实际操作生成、候选切换、slider、Ghost、人工 FAIL、采用、继续、刷新、焦点、活动与历史。双语首页五宽度×两缩放 20 组、双语最长来源警告 20 组、中文结果 10 组检查无溢出与 pageerror。这不是所有页面×语言×尺寸的穷举视觉验收。

工程 self-review 以 TypeScript AST 比较事件、disabled、checked 和选中语义，确认重组未改变这些条件。关键颜色对（正文、辅助文字、主按钮、CHANGE、KEEP）对比度为 7.38:1–16.02:1；并人工检查图像几何、数据来源、失败恢复和审核门槛。

独立只读评审发现 200% 手机比较图被留白压小的 IMPORTANT，已修复并增加回归；360 / 390px 的 Ghost 和前后比较四张补验截图确认问题解除，未发现新的 BLOCKING / IMPORTANT。独立评审未操作浏览器、未测试真实 provider，未把 CSS zoom 等同原生菜单缩放。

## 限制与交付

- 200% 使用 CSS zoom 和独立视口重排。原生 Chrome / Edge 人工验收、原生菜单缩放：NOT TESTED。
- Real provider、Docker（无 Docker 配置）、生产部署、真实宿主 MCP：NOT TESTED。
- Mock 与自动 Chromium 不证明 provider 或语义质量。原生 select 极窄放大时可能截短选中名称；来源标识和说明仍保留。
- 用户已有 planning 文档与工作流不纳入提交。没有 merge、tag、release 或 deploy。

分支 `codex/vowedit-ui-polish`，base / merge-base `8bb5c722bd8270b102f51cda9fa7f17b0bd991e4`。继续更新 [Draft PR #5](https://github.com/kallist/vowedit/pull/5)；最终 HEAD 与同 SHA 的 CI 状态见 PR 和交付报告。
