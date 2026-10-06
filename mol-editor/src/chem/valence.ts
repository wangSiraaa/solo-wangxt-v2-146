/**
 * 局部价态估算 —— 仅用于在 RDKit 校验失败时"提示可能出问题的原子"。
 * 权威校验始终由 RDKit sanitize 完成；这里的表是教学范围常见元素的
 * 宽松上限，宁可漏报也不误报。
 */
import type { MolGraph } from './model'

/** 中性原子的常见最大成键数 */
const MAX_VALENCE: Record<string, number> = {
  C: 4, N: 3, O: 2, S: 6, P: 5, B: 3, Si: 4,
  F: 1, Cl: 7, Br: 5, I: 7, H: 1,
  Na: 1, K: 1, Li: 1, Mg: 2, Ca: 2,
}

/** 形式电荷对最大成键数的调整（教学范围常见情况） */
const CHARGE_ADJUST: Record<string, Record<number, number>> = {
  N: { 1: 4, [-1]: 2 },
  O: { 1: 3, [-1]: 1 },
  B: { [-1]: 4 },
  C: { [-1]: 3 },
  S: { [-1]: 3 },
  P: { 1: 4 },
}

export interface ValenceProblem {
  atomId: number
  elem: string
  used: number
  max: number
}

export function estimateValenceProblems(g: MolGraph): ValenceProblem[] {
  const used = new Map<number, number>()
  for (const a of g.atoms) used.set(a.id, 0)
  for (const b of g.bonds) {
    const v = b.aromatic ? 1.5 : b.order
    used.set(b.a1, (used.get(b.a1) ?? 0) + v)
    used.set(b.a2, (used.get(b.a2) ?? 0) + v)
  }
  const problems: ValenceProblem[] = []
  for (const a of g.atoms) {
    const base = MAX_VALENCE[a.elem]
    if (base === undefined) continue
    const adj = CHARGE_ADJUST[a.elem]?.[a.charge]
    const max = adj ?? base
    const u = used.get(a.id) ?? 0
    if (u > max + 0.01) {
      problems.push({ atomId: a.id, elem: a.elem, used: u, max })
    }
  }
  return problems
}
