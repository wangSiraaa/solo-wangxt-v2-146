/**
 * V2000 molfile 读写。
 * 写出：编辑器模型 → molblock（交给 RDKit 校验/规范化）。
 * 读入：RDKit 生成的 molblock（含 2D 坐标与立体标记）→ 编辑器模型。
 * 电荷与同位素使用 M CHG / M ISO 属性行，键立体用 bond stereo 字段，
 * 芳香键用 type 4 —— 这些都是分子图语义，不只是绘图属性。
 */
import type { Atom, Bond, BondOrder, BondStereo, MolGraph } from './model'
import { allocId, reseedIds } from './model'

/** 天然平均质量取整后的"标称质量数"，用于 同位素↔质量差 换算 */
const NOMINAL_MASS: Record<string, number> = {
  H: 1, He: 4, Li: 7, Be: 9, B: 11, C: 12, N: 14, O: 16, F: 19, Ne: 20,
  Na: 23, Mg: 24, Al: 27, Si: 28, P: 31, S: 32, Cl: 35, Ar: 40, K: 39,
  Ca: 40, Br: 80, I: 127, Se: 79, As: 75,
}

function pad3(n: number): string {
  return String(n).padStart(3, ' ')
}

/** M 属性行（CHG/ISO）的键值对使用 4 字符定宽字段 */
function pad4(n: number): string {
  return String(n).padStart(4, ' ')
}

function f10(n: number): string {
  const s = n.toFixed(4)
  return s.padStart(10, ' ')
}

export interface MolblockOptions {
  name?: string
  /** 计数行中的 chiral flag；含楔形键时应为 true */
  chiralFlag?: boolean
}

export function molblockFromGraph(g: MolGraph, opts: MolblockOptions = {}): string {
  const hasWedge = g.bonds.some((b) => b.stereo === 1 || b.stereo === 6)
  const chiral = opts.chiralFlag ?? hasWedge
  const lines: string[] = []
  lines.push(opts.name ?? 'MolEditor')
  lines.push('  MolEditor    2D')
  lines.push('')
  lines.push(
    `${pad3(g.atoms.length)}${pad3(g.bonds.length)}  0  0${chiral ? '  1' : '  0'}  0  0  0  0  0999 V2000`,
  )
  const idxOf = new Map<number, number>()
  g.atoms.forEach((a, i) => idxOf.set(a.id, i + 1))

  for (const a of g.atoms) {
    const sym = a.elem.padEnd(3, ' ').slice(0, 3)
    // 质量差/电荷字段保持 0，统一用 M ISO / M CHG 表达，避免 0-7 编码限制
    lines.push(`${f10(a.x)}${f10(-a.y)}${f10(0)} ${sym} 0  0  0  0  0  0  0  0  0  0  0  0`)
  }
  for (const b of g.bonds) {
    const type = b.aromatic ? 4 : b.order
    lines.push(
      `${pad3(idxOf.get(b.a1)!)}${pad3(idxOf.get(b.a2)!)}${pad3(type)}${pad3(b.stereo)}  0  0  0`,
    )
  }
  const charged = g.atoms.filter((a) => a.charge !== 0)
  if (charged.length > 0) {
    const pairs = charged
      .map((a) => `${pad4(idxOf.get(a.id)!)}${pad4(a.charge)}`)
      .join('')
    lines.push(`M  CHG${pad3(charged.length)}${pairs}`)
  }
  const isotopes = g.atoms.filter((a) => a.isotope > 0)
  if (isotopes.length > 0) {
    const pairs = isotopes
      .map((a) => `${pad4(idxOf.get(a.id)!)}${pad4(a.isotope)}`)
      .join('')
    lines.push(`M  ISO${pad3(isotopes.length)}${pairs}`)
  }
  lines.push('M  END')
  return lines.join('\n') + '\n'
}

/** molfile 电荷字段编码（0-7），M CHG 会覆盖它 */
const CHARGE_CODE: Record<number, number> = { 0: 0, 1: 3, 2: 2, 3: 1, 4: 0, 5: -1, 6: -2, 7: -3 }

export function graphFromMolblock(mb: string): MolGraph {
  const lines = mb.split(/\r?\n/)
  if (lines.length < 4) throw new Error('molblock 太短，不是有效的 V2000 文件')
  const counts = lines[3]
  const nAtoms = parseInt(counts.slice(0, 3), 10)
  const nBonds = parseInt(counts.slice(3, 6), 10)
  if (Number.isNaN(nAtoms) || Number.isNaN(nBonds)) {
    throw new Error('无法解析 molblock 计数行')
  }
  const g: MolGraph = { atoms: [], bonds: [] }
  const idByIndex: number[] = [0] // 1-based

  for (let i = 0; i < nAtoms; i++) {
    const line = lines[4 + i]
    if (!line) throw new Error(`molblock 原子块第 ${i + 1} 行缺失`)
    const x = parseFloat(line.slice(0, 10))
    const y = parseFloat(line.slice(10, 20))
    const elem = line.slice(31, 34).trim() || 'C'
    const massDiff = parseInt(line.slice(34, 36), 10) || 0
    const chargeCode = parseInt(line.slice(36, 39), 10) || 0
    const nominal = NOMINAL_MASS[elem] ?? 0
    const atom: Atom = {
      id: allocId(),
      elem,
      x,
      y: -y, // molfile 的 y 轴向上，屏幕坐标向下
      charge: CHARGE_CODE[chargeCode] ?? 0,
      isotope: massDiff !== 0 && nominal > 0 ? nominal + massDiff : 0,
    }
    g.atoms.push(atom)
    idByIndex.push(atom.id)
  }
  for (let i = 0; i < nBonds; i++) {
    const line = lines[4 + nAtoms + i]
    if (!line) throw new Error(`molblock 键块第 ${i + 1} 行缺失`)
    const a1 = parseInt(line.slice(0, 3), 10)
    const a2 = parseInt(line.slice(3, 6), 10)
    const type = parseInt(line.slice(6, 9), 10)
    const stereo = (parseInt(line.slice(9, 12), 10) || 0) as BondStereo
    const aromatic = type === 4
    const order: BondOrder = aromatic ? 1 : ((type >= 1 && type <= 3 ? type : 1) as BondOrder)
    const bond: Bond = {
      id: allocId(),
      a1: idByIndex[a1],
      a2: idByIndex[a2],
      order,
      aromatic,
      stereo: stereo === 1 || stereo === 4 || stereo === 6 ? stereo : 0,
    }
    g.bonds.push(bond)
  }
  // M 属性行（CHG/ISO 优先于原子行内字段）
  for (let i = 4 + nAtoms + nBonds; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith('M  CHG')) {
      const n = parseInt(line.slice(6, 9), 10)
      for (let k = 0; k < n; k++) {
        const idx = parseInt(line.slice(9 + k * 8, 13 + k * 8), 10)
        const chg = parseInt(line.slice(13 + k * 8, 17 + k * 8), 10)
        const atom = g.atoms.find((a) => a.id === idByIndex[idx])
        if (atom) atom.charge = chg
      }
    } else if (line.startsWith('M  ISO')) {
      const n = parseInt(line.slice(6, 9), 10)
      for (let k = 0; k < n; k++) {
        const idx = parseInt(line.slice(9 + k * 8, 13 + k * 8), 10)
        const iso = parseInt(line.slice(13 + k * 8, 17 + k * 8), 10)
        const atom = g.atoms.find((a) => a.id === idByIndex[idx])
        if (atom) atom.isotope = iso
      }
    } else if (line.startsWith('M  END')) {
      break
    }
  }
  reseedIds(g)
  return g
}
