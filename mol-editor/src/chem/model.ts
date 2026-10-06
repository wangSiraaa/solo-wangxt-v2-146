/**
 * 可编辑分子图模型 —— 编辑器的事实来源。
 * 每次修改都会序列化为 V2000 molblock 交给 RDKit 重新校验/规范化，
 * 因此这里存的是"结构语义"（键级、芳香性、楔形键、电荷、同位素），
 * 而不是单纯的画面线条。
 */

export type BondOrder = 1 | 2 | 3

/** 键的立体标记：0 无；1 楔形(朝前)；6 虚线楔(朝后)；4 波浪键(未知构型) */
export type BondStereo = 0 | 1 | 4 | 6

export interface Atom {
  id: number
  elem: string // 元素符号，如 "C"、"N"
  x: number
  y: number
  charge: number // 形式电荷
  isotope: number // 质量数；0 表示天然丰度（不标注）
}

export interface Bond {
  id: number
  a1: number // Atom.id
  a2: number // Atom.id
  order: BondOrder
  aromatic: boolean
  stereo: BondStereo
}

export interface MolGraph {
  atoms: Atom[]
  bonds: Bond[]
}

export function emptyGraph(): MolGraph {
  return { atoms: [], bonds: [] }
}

export function cloneGraph(g: MolGraph): MolGraph {
  return {
    atoms: g.atoms.map((a) => ({ ...a })),
    bonds: g.bonds.map((b) => ({ ...b })),
  }
}

export function getAtom(g: MolGraph, id: number): Atom | undefined {
  return g.atoms.find((a) => a.id === id)
}

export function findBond(g: MolGraph, a1: number, a2: number): Bond | undefined {
  return g.bonds.find(
    (b) => (b.a1 === a1 && b.a2 === a2) || (b.a1 === a2 && b.a2 === a1),
  )
}

let nextId = 1
export function allocId(): number {
  return nextId++
}
/** 反序列化后调用，避免 id 冲突 */
export function reseedIds(g: MolGraph): void {
  for (const a of g.atoms) nextId = Math.max(nextId, a.id + 1)
  for (const b of g.bonds) nextId = Math.max(nextId, b.id + 1)
}

export function addAtom(g: MolGraph, elem: string, x: number, y: number): Atom {
  const atom: Atom = { id: allocId(), elem, x, y, charge: 0, isotope: 0 }
  g.atoms.push(atom)
  return atom
}

export function addBond(
  g: MolGraph,
  a1: number,
  a2: number,
  order: BondOrder,
  aromatic = false,
  stereo: BondStereo = 0,
): Bond | undefined {
  if (a1 === a2) return undefined
  const existing = findBond(g, a1, a2)
  if (existing) return existing
  const bond: Bond = { id: allocId(), a1, a2, order, aromatic, stereo }
  g.bonds.push(bond)
  return bond
}

export function removeAtom(g: MolGraph, id: number): void {
  g.atoms = g.atoms.filter((a) => a.id !== id)
  g.bonds = g.bonds.filter((b) => b.a1 !== id && b.a2 !== id)
}

export function removeBond(g: MolGraph, id: number): void {
  g.bonds = g.bonds.filter((b) => b.id !== id)
}

export function degreeOf(g: MolGraph, atomId: number): number {
  return g.bonds.filter((b) => b.a1 === atomId || b.a2 === atomId).length
}

/**
 * 调整楔形/虚线楔键的起止方向：RDKit 只在楔形窄端位于手性中心时
 * 才感知手性，因此把窄端放在连接度更高的原子（更可能是立体中心）上。
 * 在应用楔形键后调用。
 */
export function orientWedge(g: MolGraph, b: Bond): void {
  if (b.stereo !== 1 && b.stereo !== 6) return
  if (degreeOf(g, b.a2) > degreeOf(g, b.a1)) {
    const t = b.a1
    b.a1 = b.a2
    b.a2 = t
  }
}

/**
 * 去掉所有立体信息（用于生成"无立体"的规范 SMILES 以比较连接表）。
 * 楔形/虚线楔由 bond.stereo 表达；E/Z 由 2D 坐标表达，
 * 因此除清立体标记外还必须把坐标归零，否则 RDKit 会从几何重新感知 E/Z。
 */
export function stripStereo(g: MolGraph): MolGraph {
  const c = cloneGraph(g)
  for (const b of c.bonds) b.stereo = 0
  for (const a of c.atoms) { a.x = 0; a.y = 0 }
  return c
}

/** 常见元素列表（教学范围） */
export const COMMON_ELEMENTS = [
  'C', 'H', 'N', 'O', 'S', 'P', 'F', 'Cl', 'Br', 'I', 'B', 'Si', 'Na', 'K', 'Li', 'Mg', 'Ca',
] as const

/** 常见元素的常见同位素质量数（用于同位素下拉框） */
export const COMMON_ISOTOPES: Record<string, number[]> = {
  H: [2, 3],
  B: [10, 11],
  C: [13, 14],
  N: [15],
  O: [17, 18],
  F: [],
  P: [32],
  S: [33, 34, 36],
  Cl: [37],
  Br: [81],
  I: [131],
  Li: [6, 7],
  Na: [],
  K: [40, 41],
  Mg: [25, 26],
  Ca: [42, 43, 44, 46, 48],
  Si: [29, 30],
}
