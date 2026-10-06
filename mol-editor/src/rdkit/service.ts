/**
 * RDKit 服务层：解析、校验（价态/芳香性/隐式氢/电荷/同位素）、规范化。
 * 所有分子合法性判断都由 RDKit 完成；前端模型只负责编辑与显示。
 */
import initRDKitModule, { type JSMol, type RDKitModule } from '@rdkit/rdkit'
import wasmUrl from '@rdkit/rdkit/dist/RDKit_minimal.wasm?url'
import type { MolGraph } from '../chem/model'
import { stripStereo } from '../chem/model'
import { molblockFromGraph, graphFromMolblock } from '../chem/molblock'
import { atomsFromRdkitJson, hillFormula, type JsonAtom } from '../chem/formula'
import { diagnoseSmiles, type SmilesError } from '../chem/smilesError'
import { estimateValenceProblems, type ValenceProblem } from '../chem/valence'
import type { MolSummary } from '../chem/compare'

let rdkitPromise: Promise<RDKitModule> | null = null

export function initRDKit(): Promise<RDKitModule> {
  if (!rdkitPromise) {
    rdkitPromise = initRDKitModule({ locateFile: () => wasmUrl })
  }
  return rdkitPromise
}

let RDKit: RDKitModule | null = null
export function setRDKitInstance(m: RDKitModule): void {
  RDKit = m
}
export function getRDKit(): RDKitModule {
  if (!RDKit) throw new Error('RDKit 尚未初始化')
  return RDKit
}

/** 教学展示用的描述符子集（键名为 RDKit get_descriptors 的实际输出） */
export const DESCRIPTOR_LABELS: [string, string][] = [
  ['amw', '平均分子量'],
  ['exactmw', '精确质量'],
  ['NumHBD', '氢键给体数'],
  ['NumHBA', '氢键受体数'],
  ['NumRotatableBonds', '可旋转键数'],
  ['tpsa', '拓扑极性表面积'],
  ['CrippenClogP', 'cLogP'],
  ['NumRings', '环数'],
  ['NumHeavyAtoms', '重原子数'],
  ['NumAtomStereoCenters', '立体中心数'],
  ['NumUnspecifiedAtomStereoCenters', '未指定立体中心数'],
]

export interface StereoTag {
  kind: 'atom' | 'bond'
  index: number // 0-based，与图中原子/键顺序一致
  index2?: number // 键的第二个原子
  label: string // 如 "(R)"、"(E)"
}

export interface Analysis {
  empty: boolean
  valid: boolean
  error: string
  canonicalSmiles: string
  noStereoSmiles: string
  formula: string
  inchi: string
  /** 每个原子的隐式氢数，顺序与 graph.atoms 一致 */
  impHs: number[]
  jsonAtoms: JsonAtom[]
  descriptors: Record<string, number>
  stereoTags: StereoTag[]
  valenceHints: ValenceProblem[]
}

function emptyAnalysis(): Analysis {
  return {
    empty: true, valid: true, error: '', canonicalSmiles: '', noStereoSmiles: '',
    formula: '', inchi: '', impHs: [], jsonAtoms: [], descriptors: {},
    stereoTags: [], valenceHints: [],
  }
}

function parseStereoTags(json: string): StereoTag[] {
  try {
    const d = JSON.parse(json) as {
      CIP_atoms?: [number, string][]
      CIP_bonds?: [number, number, string][]
    }
    const tags: StereoTag[] = []
    for (const [i, label] of d.CIP_atoms ?? []) tags.push({ kind: 'atom', index: i, label })
    for (const [i, j, label] of d.CIP_bonds ?? []) tags.push({ kind: 'bond', index: i, index2: j, label })
    return tags
  } catch {
    return []
  }
}

/** 用 RDKit 作为预言机判断字符串是否可解析（供错误定位的前缀扫描） */
function tryParse(input: string): boolean {
  const m = getRDKit().get_mol(input)
  if (!m) return false
  const ok = m.is_valid()
  m.delete()
  return ok
}

function summarizeMol(mol: JSMol): Omit<Analysis, 'empty' | 'valid' | 'error' | 'valenceHints'> {
  const jsonAtoms = atomsFromRdkitJson(mol.get_json())
  const all = JSON.parse(mol.get_descriptors()) as Record<string, number>
  const descriptors: Record<string, number> = {}
  for (const [key] of DESCRIPTOR_LABELS) {
    if (typeof all[key] === 'number') descriptors[key] = all[key]
  }
  let inchi = ''
  try { inchi = mol.get_inchi() } catch { /* InChI 不可用时忽略 */ }
  return {
    canonicalSmiles: mol.get_smiles(),
    noStereoSmiles: '', // 由调用方填
    formula: hillFormula(jsonAtoms),
    inchi,
    impHs: jsonAtoms.map((a) => a.impHs),
    jsonAtoms,
    descriptors,
    stereoTags: parseStereoTags(mol.get_stereo_tags()),
  }
}

/** 去立体后的规范 SMILES：清立体标记 + 坐标归零后重新规范化 */
function noStereoSmilesOf(g: MolGraph): string {
  const plain = getRDKit().get_mol(molblockFromGraph(stripStereo(g)))
  if (!plain) return ''
  const s = plain.get_smiles()
  plain.delete()
  return s
}

/**
 * 校验当前编辑图：序列化为 molblock → RDKit 解析 + sanitize。
 * 失败时保留图不变，返回错误与局部价态提示（绝不替换成近似分子）。
 */
export function analyzeGraph(g: MolGraph): Analysis {
  if (g.atoms.length === 0) return emptyAnalysis()
  const mb = molblockFromGraph(g)
  let mol: JSMol | null = null
  try {
    mol = getRDKit().get_mol(mb)
  } catch (e) {
    mol = null
  }
  if (!mol || !mol.is_valid()) {
    mol?.delete()
    return {
      ...emptyAnalysis(),
      empty: false,
      valid: false,
      error: 'RDKit 校验失败：可能是价态超限、芳香性无法闭合或电荷/同位素组合不合理。',
      valenceHints: estimateValenceProblems(g),
    }
  }
  const summary = summarizeMol(mol)
  mol.delete()
  return {
    ...emptyAnalysis(),
    empty: false,
    ...summary,
    noStereoSmiles: noStereoSmilesOf(g),
  }
}

export type ImportResult =
  | { ok: true; graph: MolGraph }
  | { ok: false; error: SmilesError }

/** 导入 SMILES：失败时定位错误位置，不猜测近似分子 */
export function importSmiles(smiles: string): ImportResult {
  const input = smiles.trim()
  if (!input) return { ok: false, error: { message: '输入为空', position: -1 } }
  const mol = getRDKit().get_mol(input)
  if (!mol || !mol.is_valid()) {
    mol?.delete()
    return { ok: false, error: diagnoseSmiles(input, tryParse) }
  }
  if (!mol.has_coords()) mol.set_new_coords()
  const graph = graphFromMolblock(mol.get_molblock())
  mol.delete()
  return { ok: true, graph }
}

/** 比较面板用：SMILES → 判定摘要 */
export function summarizeSmiles(smiles: string): { ok: true; summary: MolSummary } | { ok: false; error: SmilesError } {
  const res = importSmiles(smiles)
  if (!res.ok) return res
  const analysis = analyzeGraph(res.graph)
  if (!analysis.valid) return { ok: false, error: { message: analysis.error, position: -1 } }
  return {
    ok: true,
    summary: {
      isoSmiles: analysis.canonicalSmiles,
      noStereoSmiles: analysis.noStereoSmiles,
      formula: analysis.formula,
    },
  }
}

export interface RoundTripReport {
  smilesStable: boolean // 规范 SMILES 再导入后不变
  molblockStable: boolean // 导出 molblock 再解析后规范 SMILES 不变
  stereoPreserved: boolean // 立体标签再导入后不变
  detail: string
}

/** 导出→再导入自检：验证立体信息在往返中保持 */
export function roundTripCheck(g: MolGraph, canonical: string, stereoTags: StereoTag[]): RoundTripReport {
  // 1) 规范 SMILES 再导入
  const re1 = importSmiles(canonical)
  const can2 = re1.ok ? analyzeGraph(re1.graph).canonicalSmiles : ''
  const smilesStable = can2 === canonical

  // 2) molblock 导出再解析
  const mb = molblockFromGraph(g)
  const m = getRDKit().get_mol(mb)
  const can3 = m ? m.get_smiles() : ''
  const tags3 = m ? parseStereoTags(m.get_stereo_tags()) : []
  m?.delete()
  const molblockStable = can3 === canonical

  const norm = (t: StereoTag[]) => t.map((x) => `${x.kind}${x.label}`).sort().join(',')
  const stereoPreserved = smilesStable && molblockStable && norm(tags3) === norm(stereoTags)

  const detail = [
    `规范 SMILES 再导入：${smilesStable ? '一致' : `不一致（${can2}）`}`,
    `molblock 导出再解析：${molblockStable ? '一致' : `不一致（${can3}）`}`,
    `立体标签：${stereoPreserved ? '保持' : '发生变化'}`,
  ].join('；')
  return { smilesStable, molblockStable, stereoPreserved, detail }
}
