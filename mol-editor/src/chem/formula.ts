/**
 * 从 RDKit 的 JSON 描述（commonchem / rdkitjson）中提取每个原子的
 * 元素序数、形式电荷、同位素与隐式氢数，并计算 Hill 体系分子式。
 * 隐式氢由 RDKit 的价态模型给出，不在前端自行猜测。
 */

export interface JsonAtom {
  elem: string
  charge: number
  isotope: number
  impHs: number
}

const ELEMENTS = [
  '', 'H', 'He', 'Li', 'Be', 'B', 'C', 'N', 'O', 'F', 'Ne',
  'Na', 'Mg', 'Al', 'Si', 'P', 'S', 'Cl', 'Ar', 'K', 'Ca',
]

export function elemFromZ(z: number): string {
  if (z > 0 && z < ELEMENTS.length) return ELEMENTS[z]
  // 超出内置表时的兜底（教学范围内基本用不到）
  return `E${z}`
}

/** 解析 RDKit get_json() 的输出，兼容 commonchem 与 rdkitjson 两种包装 */
export function atomsFromRdkitJson(jsonText: string): JsonAtom[] {
  const data = JSON.parse(jsonText)
  const mol = data?.molecules?.[0] ?? data
  const rawAtoms: unknown[] = mol?.atoms ?? []
  return rawAtoms.map((ra) => {
    const a = ra as Record<string, unknown>
    const z = typeof a.z === 'number' ? a.z : typeof a.atomic_num === 'number' ? a.atomic_num : 6
    return {
      elem: typeof a.symbol === 'string' ? a.symbol : elemFromZ(z),
      charge: typeof a.chg === 'number' ? a.chg : typeof a.formal_charge === 'number' ? a.formal_charge : 0,
      isotope: typeof a.isotope === 'number' ? a.isotope : 0,
      impHs: typeof a.impHs === 'number' ? a.impHs : typeof a.implicit_h === 'number' ? a.implicit_h : 0,
    }
  })
}

/** Hill 体系：先 C，再 H，其余按字母序；同位素原子单独标注 */
export function hillFormula(atoms: JsonAtom[]): string {
  const counts = new Map<string, number>()
  let hCount = 0
  for (const a of atoms) {
    const key = a.isotope > 0 ? `[${a.isotope}${a.elem}]` : a.elem
    counts.set(key, (counts.get(key) ?? 0) + 1)
    if (a.impHs > 0) hCount += a.impHs
  }
  if (hCount > 0) counts.set('H', (counts.get('H') ?? 0) + hCount)

  const parts: string[] = []
  const emit = (sym: string) => {
    const n = counts.get(sym)
    if (n) parts.push(n === 1 ? sym : `${sym}${n}`)
  }
  if (counts.has('C')) {
    emit('C')
    emit('H')
  }
  const rest = [...counts.keys()]
    .filter((k) => k !== 'C' && (k !== 'H' || !counts.has('C')))
    .sort((a, b) => a.replace(/[[\]\d]/g, '').localeCompare(b.replace(/[[\]\d]/g, '')))
  for (const k of rest) emit(k)
  return parts.join('')
}
