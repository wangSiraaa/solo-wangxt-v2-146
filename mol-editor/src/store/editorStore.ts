/**
 * 编辑器全局状态（Vue reactive）。所有结构修改都通过 mutate() 进入，
 * 修改后立即经 RDKit 重新校验/规范化 —— 画面变化一定对应分子图变化。
 */
import { reactive } from 'vue'
import type { MolGraph, BondOrder, BondStereo } from '../chem/model'
import { emptyGraph, cloneGraph, removeAtom, removeBond } from '../chem/model'
import type { SmilesError } from '../chem/smilesError'
import {
  initRDKit, setRDKitInstance, analyzeGraph, importSmiles,
  type Analysis,
} from '../rdkit/service'

export type Tool = 'select' | 'bond' | 'atom' | 'erase'

export interface BondToolConfig {
  order: BondOrder
  aromatic: boolean
  stereo: BondStereo
  label: string
}

export const BOND_TOOLS: BondToolConfig[] = [
  { order: 1, aromatic: false, stereo: 0, label: '单键' },
  { order: 2, aromatic: false, stereo: 0, label: '双键' },
  { order: 3, aromatic: false, stereo: 0, label: '三键' },
  { order: 1, aromatic: true, stereo: 0, label: '芳香键' },
  { order: 1, aromatic: false, stereo: 1, label: '楔形键(朝前)' },
  { order: 1, aromatic: false, stereo: 6, label: '虚线楔键(朝后)' },
]

export const state = reactive({
  ready: false, // RDKit 是否加载完成
  initError: '',
  rdkitVersion: '',
  graph: emptyGraph() as MolGraph,
  /** SMILES 输入框草稿 —— 解析失败也保留 */
  rawInput: '',
  /** 最近一次成功导入的原始输入（用于与规范形式对照） */
  importedRaw: '',
  importError: null as SmilesError | null,
  analysis: null as Analysis | null,
  tool: 'select' as Tool,
  bondTool: BOND_TOOLS[0] as BondToolConfig,
  atomElement: 'C',
  selectedAtomId: null as number | null,
  selectedBondId: null as number | null,
})

export async function bootRDKit(): Promise<void> {
  try {
    const m = await initRDKit()
    setRDKitInstance(m)
    state.rdkitVersion = m.version()
    state.ready = true
    revalidate()
  } catch (e) {
    state.initError = `RDKit(wasm) 加载失败：${String(e)}`
  }
}

/** 每次结构修改后调用：经 RDKit 重新校验并更新规范形式 */
export function revalidate(): void {
  if (!state.ready) return
  state.analysis = analyzeGraph(state.graph)
}

/** 结构修改的唯一入口 */
export function mutate(fn: (g: MolGraph) => void): void {
  fn(state.graph)
  revalidate()
}

export function clearSelection(): void {
  state.selectedAtomId = null
  state.selectedBondId = null
}

export function selectAtom(id: number | null): void {
  state.selectedAtomId = id
  state.selectedBondId = null
}

export function selectBond(id: number | null): void {
  state.selectedBondId = id
  state.selectedAtomId = null
}

/** 导入输入框中的 SMILES；失败时保留草稿并记录错误位置 */
export function importFromInput(): void {
  if (!state.ready) return
  const res = importSmiles(state.rawInput)
  if (res.ok) {
    state.graph = res.graph
    state.importedRaw = state.rawInput.trim()
    state.importError = null
    clearSelection()
    revalidate()
  } else {
    state.importError = res.error
  }
}

/** 载入一个图（示例/工程），同步更新输入框 */
export function loadGraph(g: MolGraph, rawLabel: string): void {
  state.graph = g
  state.rawInput = rawLabel
  state.importedRaw = rawLabel
  state.importError = null
  clearSelection()
  revalidate()
}

export function newMolecule(): void {
  state.graph = emptyGraph()
  state.rawInput = ''
  state.importedRaw = ''
  state.importError = null
  clearSelection()
  revalidate()
}

/** 撤销栈（简单快照式，教学规模足够） */
const undoStack: MolGraph[] = []
const redoStack: MolGraph[] = []

export function pushUndo(): void {
  undoStack.push(cloneGraph(state.graph))
  if (undoStack.length > 50) undoStack.shift()
  redoStack.length = 0
}

export function undo(): void {
  const prev = undoStack.pop()
  if (!prev) return
  redoStack.push(cloneGraph(state.graph))
  state.graph = prev
  clearSelection()
  revalidate()
}

export function redo(): void {
  const next = redoStack.pop()
  if (!next) return
  undoStack.push(cloneGraph(state.graph))
  state.graph = next
  clearSelection()
  revalidate()
}

/** 删除当前选中的原子或键 */
export function deleteSelected(): void {
  if (state.selectedAtomId == null && state.selectedBondId == null) return
  pushUndo()
  mutate((g) => {
    if (state.selectedAtomId != null) removeAtom(g, state.selectedAtomId)
    else if (state.selectedBondId != null) removeBond(g, state.selectedBondId)
  })
  clearSelection()
}
