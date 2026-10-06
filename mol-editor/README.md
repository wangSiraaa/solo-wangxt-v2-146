# 本地分子结构编辑器（化学教学版）

一个纯本地、无后端的教学分子编辑器：Vue 3 + TypeScript 管理工具与界面，RDKit.js（WebAssembly）负责
SMILES 解析、价态校验与规范化，SVG 显示结构，IndexedDB 保存工程。

> 用途边界：仅用于分子表示与基础理化性质的教学比较，**不**生成合成路线、反应条件或实验操作指导。

## 启动

```bash
npm install
npm run dev        # 开发服务器
npm run build      # 类型检查 + 生产构建（输出到 dist/）
npm run preview    # 本地预览构建产物
npm test           # 纯逻辑测试（在 Node 中加载真实 RDKit wasm，共 34 项）
```

RDKit 的 js/wasm 已置于 `public/vendor/`，构建后同源提供；除 npm 安装外运行时无需联网。

## 功能与设计要点

### 分子图语义，不只是画线
- 内部模型 `src/editor/types.ts` 明确区分：普通键（单/双/三，键序 1/2/3）、芳香键（MDL 键型 4）、
  楔形单键（实楔 up=6 / 虚楔 down，窄端在手性中心）。
- 改键型会更新图并立即送 RDKit 重新做价态与立体校验，而不是仅改变线条样式。
- 芳香键在图中以独立类型保留（`c1ccccc1` 导入后仍是 6 根 aromatic 键）；为与 RDKit V2000
  稳定往返，序列化时对**环内**芳香键做本地 Kekulé 单/双键赋值（`src/editor/kekulize.ts`），
  最终芳香性判定仍由 RDKit sanitize 负责；非环芳香键（如 `C:C`）保留键型 4。

### SMILES 导入与错误处理
- 同时显示**原始输入**（永久保留的草稿）与 **RDKit 规范异构 SMILES**。
- 无法解析时不猜测近似分子：保留草稿与旧图，用「最长可补全前缀」算法给出错误列定位并红色高亮。

### 隐式氢、电荷、同位素
- 隐式氢以 RDKit `add_hs` 后的显式氢 molblock 反推（权威结果），界面同时给出本地估算。
- 电荷（±3 以内）写 V2000 `M  CHG`，同位素写绝对质量数 `M  ISO`，氘/氚以 `[2H]`/`[3H]` 处理。
- 芳香 `[nH]`（吡咯型氮）由 RDKit 显式氢关系反标到图，保证再写回后仍恢复为 `c1cc[nH]c1`。

### 立体信息
- 对映异构（`@`/`@@`，楔键）与几何异构（`/`/`\`，双键坐标）经 `.mol` / 工程 JSON 导出再导入保持，
  有自动化测试覆盖（`test/run*.ts`）。设置楔键时自动把窄端朝向取代度更高的原子（手性中心）。

### 编辑与持久化
- 双击空白放原子、连键工具拖拽成键、点键改型、原子拖动、撤销/重做（Ctrl+Z / Ctrl+Y / Delete）。
- 自动保存与手动保存均写入浏览器 IndexedDB（`src/lib/db.ts`）；工程文件含原始草稿与完整图。

### 教学示例
- 构造异构（乙醇/二甲醚、丙烯/环丙烷、乙酸/甲酸甲酯）；
- 立体异构（L/D-乳酸、顺/反-2-丁烯、内消旋/旋光酒石酸）；同位素标记（¹²C/¹³C 甲烷）。
- 比较页只展示表示与基础性质（分子式、Mᵣ、手性中心数），不做合成指导。

## 目录
```
src/
  editor/        types / molblock(V2000 读写) / kekulize / rdkit 封装 / graphOps / elements
  components/    Toolbar ImportPanel StructureCanvas InspectorPanel InfoPanel ExamplesView
  examples/      教学示例数据
  stores/        全局状态、撤销重做、校验流程
  lib/           IndexedDB、文件导入导出
test/            esbuild 打包后在 Node 跑真实 RDKit（run/run2/run3）+ 可选浏览器冒烟脚本
```
