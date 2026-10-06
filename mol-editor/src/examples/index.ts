// 教学示例：仅用于“表示与性质”的基础比较，不含任何合成或实验操作指导。
// 分组：构造异构（原子连接方式不同）与立体异构（连接相同、空间排布不同）。

export interface ExampleItem {
  label: string;
  smiles: string;
  note: string;
}

export interface ExampleGroup {
  id: string;
  category: 'constitutional' | 'stereo' | 'isotope' | 'single';
  title: string;
  concept: string;
  items: [ExampleItem, ExampleItem];
}

export const SINGLE_EXAMPLES: ExampleItem[] = [
  { label: '乙醇', smiles: 'CCO', note: '最简单的醇之一' },
  { label: '乙酸', smiles: 'CC(=O)O', note: '羧酸官能团' },
  { label: '苯', smiles: 'c1ccccc1', note: '芳香键（6 中心 π 体系）' },
  { label: '吡咯', smiles: 'c1cc[nH]c1', note: '芳香环上的 [nH]' },
  { label: '吡啶', smiles: 'c1ccncc1', note: '芳香环上的吡啶型 N' },
  { label: '丙酮', smiles: 'CC(=O)C', note: '酮羰基' },
  { label: '甘氨酸', smiles: 'NCC(=O)O', note: '最简单的氨基酸（两性离子可另查）' },
  { label: 'L-乳酸', smiles: 'C[C@H](O)C(=O)O', note: '带一个手性中心' },
];

export const EXAMPLE_GROUPS: ExampleGroup[] = [
  {
    id: 'c2h6o',
    category: 'constitutional',
    title: '乙醇 vs 二甲醚（C₂H₆O）',
    concept: '分子式相同、原子连接顺序不同：醇的 O–H 与醚的 C–O–C 导致沸点、极性等性质差异。',
    items: [
      { label: '乙醇', smiles: 'CCO', note: 'CH₃CH₂OH' },
      { label: '二甲醚', smiles: 'COC', note: 'CH₃OCH₃' },
    ],
  },
  {
    id: 'c3h6',
    category: 'constitutional',
    title: '丙烯 vs 环丙烷（C₃H₆）',
    concept: '一个含双键、一个成环，不饱和度相同但官能团不同。',
    items: [
      { label: '丙烯', smiles: 'C=CC', note: '烯烃' },
      { label: '环丙烷', smiles: 'C1CC1', note: '环烷烃（三元环有张力）' },
    ],
  },
  {
    id: 'c2h4o2',
    category: 'constitutional',
    title: '乙酸 vs 甲酸甲酯（C₂H₄O₂）',
    concept: '羧酸与酯互为官能团异构，酸碱性与水解行为不同。',
    items: [
      { label: '乙酸', smiles: 'CC(=O)O', note: '羧酸' },
      { label: '甲酸甲酯', smiles: 'COC=O', note: '酯' },
    ],
  },
  {
    id: 'lactic',
    category: 'stereo',
    title: 'L-乳酸 vs D-乳酸（对映异构）',
    concept: '同一手性中心的镜像构型，@ 与 @@ 表示相反的四面体排布；普通物理性质多相同，旋光方向相反。',
    items: [
      { label: 'L-乳酸', smiles: 'C[C@H](O)C(=O)O', note: 'C[C@H](O)…' },
      { label: 'D-乳酸', smiles: 'C[C@@H](O)C(=O)O', note: 'C[C@@H](O)…' },
    ],
  },
  {
    id: 'butene',
    category: 'stereo',
    title: '顺-2-丁烯 vs 反-2-丁烯（几何异构）',
    concept: '双键不能自由旋转，/ 与 \\ 表示双键两端取代基的相对位置；顺式偶极矩更大、沸点略高。',
    items: [
      { label: '反式（E）', smiles: 'C/C=C/C', note: '两个甲基异侧' },
      { label: '顺式（Z）', smiles: 'C/C=C\\C', note: '两个甲基同侧' },
    ],
  },
  {
    id: 'tartaric',
    category: 'stereo',
    title: '内消旋与旋光性酒石酸（非对映异构）',
    concept: '(R,R) 与内消旋 (R,S) 不是镜像关系，属于非对映异构体，物理性质不同。',
    items: [
      { label: '(R,R)-酒石酸', smiles: 'O=C(O)[C@@H](O)[C@@H](O)C(=O)O', note: '有旋光性' },
      { label: '内消旋酒石酸', smiles: 'O=C(O)[C@@H](O)[C@H](O)C(=O)O', note: '有对称面，整体不旋光' },
    ],
  },
  {
    id: 'isotope',
    category: 'isotope',
    title: '普通甲烷 vs ¹³C-甲烷（同位素标记）',
    concept: '同位素改变质量与 NMR/质谱行为，但不改变化学键拓扑；导出再导入应保留质量数。',
    items: [
      { label: '甲烷', smiles: 'C', note: '¹²C 天然丰度' },
      { label: '¹³C-甲烷', smiles: '[13CH4]', note: '稳定同位素标记' },
    ],
  },
];
