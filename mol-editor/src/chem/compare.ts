/**
 * 异构关系判定（纯函数，输入由 RDKit 计算好的规范形式）。
 * - identical：规范异构 SMILES 相同（连接与立体化学都相同）
 * - stereoisomers：去立体后的规范 SMILES 相同，但异构 SMILES 不同
 * - constitutional：分子式相同但连接表不同（构造异构）
 * - different：分子式都不同
 */

export type Relation = 'identical' | 'stereoisomers' | 'constitutional' | 'different'

export interface MolSummary {
  /** 规范异构 SMILES（含立体） */
  isoSmiles: string
  /** 去立体标记后的规范 SMILES（仅连接表） */
  noStereoSmiles: string
  /** Hill 分子式 */
  formula: string
}

export function classifyRelation(a: MolSummary, b: MolSummary): Relation {
  if (a.isoSmiles === b.isoSmiles) return 'identical'
  if (a.noStereoSmiles === b.noStereoSmiles) return 'stereoisomers'
  if (a.formula === b.formula) return 'constitutional'
  return 'different'
}

export const RELATION_LABELS: Record<Relation, string> = {
  identical: '同一分子（连接与立体化学均相同）',
  stereoisomers: '立体异构体（连接相同，空间排布不同）',
  constitutional: '构造异构体（分子式相同，连接顺序不同）',
  different: '不同分子（分子式不同）',
}
