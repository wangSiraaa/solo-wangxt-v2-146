/**
 * 教学示例分子：均为常见无害分子，仅用于结构表示与基本性质观察。
 * 立体构型标注已经过 RDKit CIP 标签核对。
 */
export interface ExampleMol {
  name: string
  smiles: string
  note?: string
}

export const EXAMPLE_MOLECULES: ExampleMol[] = [
  { name: '水', smiles: 'O' },
  { name: '甲烷', smiles: 'C' },
  { name: '氨', smiles: 'N' },
  { name: '乙醇', smiles: 'CCO' },
  { name: '二甲醚', smiles: 'COC' },
  { name: '乙酸', smiles: 'CC(=O)O' },
  { name: '丙酮', smiles: 'CC(=O)C' },
  { name: '尿素', smiles: 'NC(N)=O' },
  { name: '苯', smiles: 'c1ccccc1', note: '芳香键示例' },
  { name: '甲苯', smiles: 'Cc1ccccc1' },
  { name: '环己烷', smiles: 'C1CCCCC1' },
  { name: '甘氨酸', smiles: 'NCC(=O)O' },
  { name: 'L-丙氨酸 (S)', smiles: 'N[C@@H](C)C(=O)O', note: '手性中心' },
  { name: '(S)-乳酸', smiles: 'C[C@H](O)C(=O)O', note: '手性中心' },
  { name: '(R)-2-丁醇', smiles: 'CC[C@@H](C)O', note: '手性中心' },
  { name: '(E)-2-丁烯', smiles: 'C/C=C/C', note: '双键构型' },
  { name: '(Z)-2-丁烯', smiles: 'C/C=C\\C', note: '双键构型' },
  { name: '乙酸根', smiles: 'CC(=O)[O-]', note: '形式电荷' },
  { name: '铵根', smiles: '[NH4+]', note: '形式电荷' },
  { name: '碳酸氢根', smiles: 'OC(=O)[O-]', note: '形式电荷' },
  { name: '¹³C-甲烷', smiles: '[13CH4]', note: '同位素' },
  { name: '重水 D₂O', smiles: '[2H]O[2H]', note: '同位素' },
  { name: '咖啡因', smiles: 'Cn1cnc2c1c(=O)n(C)c(=O)n2C' },
]

export interface ExamplePair {
  title: string
  a: ExampleMol
  b: ExampleMol
  expect: string
}

export const EXAMPLE_PAIRS: ExamplePair[] = [
  {
    title: '乙醇 vs 二甲醚',
    a: { name: '乙醇', smiles: 'CCO' },
    b: { name: '二甲醚', smiles: 'COC' },
    expect: '构造异构（同为 C₂H₆O，连接顺序不同）',
  },
  {
    title: '正丁烷 vs 异丁烷',
    a: { name: '正丁烷', smiles: 'CCCC' },
    b: { name: '异丁烷', smiles: 'CC(C)C' },
    expect: '构造异构（同为 C₄H₁₀，碳骨架不同）',
  },
  {
    title: '(S)-乳酸 vs (R)-乳酸',
    a: { name: '(S)-乳酸', smiles: 'C[C@H](O)C(=O)O' },
    b: { name: '(R)-乳酸', smiles: 'C[C@@H](O)C(=O)O' },
    expect: '立体异构（对映体：连接相同，手性中心构型相反）',
  },
  {
    title: '(E)-2-丁烯 vs (Z)-2-丁烯',
    a: { name: '(E)-2-丁烯', smiles: 'C/C=C/C' },
    b: { name: '(Z)-2-丁烯', smiles: 'C/C=C\\C' },
    expect: '立体异构（双键两端基团相对取向不同）',
  },
  {
    title: '环己烷 vs 正己烷',
    a: { name: '环己烷', smiles: 'C1CCCCC1' },
    b: { name: '正己烷', smiles: 'CCCCCC' },
    expect: '不同分子（C₆H₁₂ vs C₆H₁₄，成环减少两个氢）',
  },
]
