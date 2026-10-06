/**
 * SMILES 解析失败诊断。
 * 该 RDKit.js 构建不向 console 输出解析错误文本，因此采用两个独立策略：
 * 1) 本地扫描：括号/环编号/方括号配对，给出具体原因与位置；
 * 2) 前缀扫描：以 RDKit 本身为"预言机"，找到最长可解析前缀，
 *    错误位置即其后一个字符。只定位，不猜测、不替换分子。
 */

export interface SmilesError {
  message: string
  /** 0-based 字符位置；-1 表示无法定位 */
  position: number
}

/** 本地扫描：括号配对、环编号闭合、方括号配对 */
export function locateErrorLocally(smiles: string): SmilesError | null {
  const parenStack: number[] = []
  const ringOpen = new Map<string, number>()
  let bracket = -1

  for (let i = 0; i < smiles.length; i++) {
    const ch = smiles[i]
    if (bracket >= 0) {
      if (ch === ']') bracket = -1
      continue
    }
    if (ch === '[') {
      bracket = i
    } else if (ch === '(') {
      parenStack.push(i)
    } else if (ch === ')') {
      if (parenStack.length === 0) return { message: '存在多余的右括号 )', position: i }
      parenStack.pop()
    } else if (ch === '%') {
      const num = smiles.slice(i + 1, i + 3)
      if (!/^\d{2}$/.test(num)) return { message: '% 后应跟两位环编号', position: i }
      toggleRing(ringOpen, num, i)
      i += 2
    } else if (/\d/.test(ch)) {
      toggleRing(ringOpen, ch, i)
    }
  }
  if (bracket >= 0) return { message: '方括号 [ 未闭合', position: bracket }
  if (parenStack.length > 0) {
    return { message: '括号 ( 未闭合', position: parenStack[parenStack.length - 1] }
  }
  if (ringOpen.size > 0) {
    const [digit, pos] = [...ringOpen.entries()][0]
    return { message: `环编号 ${digit} 未闭合`, position: pos }
  }
  return null
}

function toggleRing(map: Map<string, number>, digit: string, pos: number): void {
  if (map.has(digit)) map.delete(digit)
  else map.set(digit, pos)
}

/**
 * 前缀扫描定位：返回最长可解析前缀的长度（即错误字符的 0-based 位置）。
 * tryParse 由调用方注入（内部调用 RDKit），保持本函数可测试。
 */
export function longestParseablePrefix(
  smiles: string,
  tryParse: (s: string) => boolean,
): number {
  let longest = 0
  for (let k = 1; k <= smiles.length; k++) {
    if (tryParse(smiles.slice(0, k))) longest = k
  }
  return longest
}

/** 综合诊断：优先本地具体原因，位置用前缀扫描交叉验证 */
export function diagnoseSmiles(
  smiles: string,
  tryParse: (s: string) => boolean,
): SmilesError {
  const local = locateErrorLocally(smiles)
  const prefixLen = longestParseablePrefix(smiles, tryParse)
  const position = prefixLen < smiles.length ? prefixLen : (local?.position ?? -1)

  if (local) {
    return { message: local.message, position: local.position >= 0 ? local.position : position }
  }
  if (prefixLen < smiles.length) {
    return {
      message: `RDKit 无法解析或校验该输入；最长可解析前缀为「${smiles.slice(0, prefixLen)}」，问题出在其后字符附近（也可能是价态/芳香性等校验失败）`,
      position,
    }
  }
  return { message: 'RDKit 无法解析或校验该输入（可能是价态或芳香性问题）', position: -1 }
}
