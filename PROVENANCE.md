# 素材来源与许可范围（PROVENANCE）

本仓库的**代码**按 MIT 许可（见 [`LICENSE`](LICENSE)）。`assets/` 目录下的**美术素材**（图片 / 动图 / 音效）**不在 MIT 覆盖范围内**，按下面的说明「原样提供」。

## 一、许可范围

| 范围 | 许可 |
|---|---|
| `lib/`、`cordis.patch.yml`、`package.json`、文档与维护脚本 | **MIT**（见 `LICENSE`） |
| `icon.png`（插件列表图标） | **不适用 MIT**：与 `assets/` 下的美术素材同属"原样提供"，仅用于标识本插件；不授予再许可，也不声明为原创作品。 |
| `assets/**`（图片 / 动图 / 音效） | **不适用 MIT**：由维护者提供或使用 AI 工具生成，按 **as-is** 随插件分发，仅用于运行本插件；不授予再许可，也不声明为原创作品。 |

这样划分的原因：代码可以明确授权，而美术素材的来源与权利状态往往无法百分之百举证 —— 与其给一个站不住的授权，不如如实标注范围，并承诺收到权利主张就处理（见第四节）。

## 二、逐项来源

| 文件 | 来源 / 说明 |
|---|---|
| `DSniang1.png`（鲸鱼本体，气泡由代码绘制） | **AI 工具生成**的图像，经人工挑选与裁切。生成工具与原始出处**已不可考**（文件内元数据已被剥离，见第三节）。 |
| `icon.png`（插件列表图标，256×256 PNG 含透明） | 由现有素材裁切 / 缩放而来（源头同 `DSniang1.png` 系列，AI 工具生成、出处不可考）。已剥离全部内嵌元数据，块序列仅 `IHDR / IDAT / IEND`。 |
| `DSniang02.png` | 同上（备用整图，兼容旧版手动安装路径）。 |
| `DSH2.png`（README 顶部展示图） | 由维护者自行设计与排版（使用在线设计工具），2026-09 替换为清理版（已剥离全部内嵌元数据）。 |
| `rua.gif`、`bubble-petpet.gif` | 内置动图素材。 |
| `bubble-money1.gif` | 内置泡泡图（余额预警默认内容的配图）。 |
| `Ya1.mp3` / `Ya2.mp3`、`D1.mp3` / `D2.mp3` | 内置音效（按压 / 松开）。 |
| `minecraft-exp-orb.wav`、`task-end-a.wav` | 内置任务结束音（Minecraft·经验球 / 预设 A）。 |

### 本 fork 新增：爱芮（Spine）

| 文件 | 来源 / 说明 |
|---|---|
| `assets/zzz/airui/airui.json`、`airui.atlas`、`airui.png`、`airui_2.png` | **《绝区零》爱芮**的 Spine 4.2.42 骨架与图集，版权归**米哈游 / HoYoverse**。取自非官方同人项目 [HanaAyane/ZZZ-Idol-Desktop-Pet](https://github.com/HanaAyane/ZZZ-Idol-Desktop-Pet)（其 README 声明：仅个人学习、非商业展示与技术研究；不得出售/商业授权/打包销售；不得移除来源与版权说明；不主张素材版权、不代表官方授权）。本 fork 不主张任何权利。 |
| `assets/zzz/airui-idle.png` | 由上述骨架在本地渲染出的 610×610 透明静帧（待机姿势），仅用于点击命中图、加载占位与 WebGL 不可用时的降级显示。 |
| `assets/zzz/runtime/spine-webgl.min.js`、`LICENSE.spine-runtimes` | `@esotericsoftware/spine-webgl` 4.2.42 官方发行版（IIFE，未修改），遵循 **Spine Runtimes License**：再分发须附带该许可与版权声明，且每个使用者需自备 Spine Editor 授权。 |
| `assets/zzz/pet.js` | 本 fork 编写的渲染层代码（MIT）。 |

> 权利主张：如果你是米哈游或相关权利人，请开 issue 说明文件名与依据，我们会在核实后立即移除 `assets/zzz/airui/` 与相关预览图，不附加其它条件。

## 三、元数据清理

图片素材曾内嵌过设计工具的 XMP 归属信息（工具名、模板名、账号 id，甚至第三方品牌名）。自 **0.3.1** 起，随包 PNG **一律剥离** `eXIf` / `iTXt` / `tEXt` / `zTXt` 元数据块，只保留渲染必需的 `IHDR` / `sRGB` / `gAMA` / `pHYs` / `IDAT` / `IEND`。

- 复核：解析每个 PNG 的块序列，确认不再有文本 / EXIF 块；
- 剥离：逐块重写，不触碰像素数据（IHDR/IDAT/IEND 原样保留），因此画面完全不变。

## 四、权利主张 / Takedown

如果你认为 `assets/` 中有素材侵犯了你的权利，请在本仓库开一条 issue，说明**文件名**与**依据**，我们会在核实后**立即替换或移除**，不附加其它条件。我们也欢迎直接提供可自由再分发的替代素材。
