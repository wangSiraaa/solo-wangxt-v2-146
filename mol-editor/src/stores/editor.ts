// 编辑器全局状态：分子图、原始输入草稿、校验结果、选择、撤销重做、自动保存。
import { computed, reactive, shallowRef } from 'vue';
import type { MolGraph, ParseError, Project, ValidationResult, BondType, Wedge } from '../editor/types';
import { cloneGraph, emptyGraph } from '../editor/types';
import { graphFromSmiles, loadRDKit, validateGraph } from '../editor/rdkit';
import { parseMolblock } from '../editor/molblock';
import * as ops from '../editor/graphOps';
import { saveProject, loadProject, listProjects } from '../lib/db';

export type ToolMode = 'select' | 'addBond';

interface State {
  ready: boolean;
  rdkitVersion: string;
  projectId: string;
  projectName: string;
  rawInput: string; // 原始输入（永远保留，即使解析失败）
  graph: MolGraph | null;
  validation: ValidationResult | null;
  selectedAtomId: number | null;
  selectedBondId: number | null;
  pendingElement: string; // 添加原子工具的当前元素
  pendingBondType: BondType;
  tool: ToolMode;
  showImplicitH: boolean;
}

const HISTORY_LIMIT = 100;

const state = reactive<State>({
  ready: false,
  rdkitVersion: '',
  projectId: newId(),
  projectName: '未命名工程',
  rawInput: '',
  graph: null,
  validation: null,
  selectedAtomId: null,
  selectedBondId: null,
  pendingElement: 'C',
  pendingBondType: 'single',
  tool: 'select',
  showImplicitH: true,
});

const undoStack: MolGraph[] = [];
const redoStack: MolGraph[] = [];

// molblock / SMILES 文件导入时暂存解析错误（非画布编辑流程）
const importError = shallowRef<ParseError | null>(null);

function newId(): string {
  return 'p-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

async function init() {
  const rdkit = await loadRDKit();
  state.ready = true;
  state.rdkitVersion = rdkit.version();
}

function snapshot(): void {
  if (state.graph) {
    undoStack.push(cloneGraph(state.graph));
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    redoStack.length = 0;
  }
}

function revalidate(): void {
  if (!state.graph) {
    state.validation = null;
    return;
  }
  state.validation = validateGraph(state.graph);
  scheduleSave();
}

// ---------------------------------------------------------------------------
// SMILES 导入
// ---------------------------------------------------------------------------

function importSmiles(raw: string): boolean {
  const result = graphFromSmiles(raw);
  state.rawInput = raw; // 无论成败都保留原始输入
  if ('error' in result) {
    state.validation = { ok: false, error: result.error };
    // 不猜分子：保留旧图与草稿，由界面提示
    return false;
  }
  state.graph = result.graph;
  state.validation = {
    ok: true,
    canonicalSmiles: result.canonical,
    descriptors: result.descriptors,
    implicitH: result.implicitH,
  };
  undoStack.length = 0;
  redoStack.length = 0;
  state.selectedAtomId = null;
  state.selectedBondId = null;
  scheduleSave();
  return true;
}

/** 从 molblock / MOL 文件导入（立体信息通过楔键与双键几何保留）。 */
function importMolblock(text: string): boolean {
  try {
    const graph = parseMolblock(text);
    state.graph = graph;
    state.rawInput = '';
    revalidate();
    undoStack.length = 0;
    redoStack.length = 0;
    return state.validation?.ok ?? false;
  } catch (e) {
    importError.value = {
      message: 'MOL 文件解析失败：' + (e as Error).message,
      column: -1,
      prefixLength: 0,
    };
    state.validation = { ok: false, error: importError.value! };
    return false;
  }
}

// ---------------------------------------------------------------------------
// 编辑操作（均先压栈，再修改，再校验）
// ---------------------------------------------------------------------------

function beginNewProject() {
  state.projectId = newId();
  state.projectName = '未命名工程';
  state.rawInput = '';
  state.graph = null;
  state.validation = null;
  state.selectedAtomId = null;
  state.selectedBondId = null;
  undoStack.length = 0;
  redoStack.length = 0;
}

function addAtomAt(element: string, x: number, y: number): number {
  if (!state.graph) state.graph = emptyGraph();
  snapshot();
  const a = ops.addAtom(state.graph, element, x, y);
  state.selectedAtomId = a.id;
  state.selectedBondId = null;
  revalidate();
  return a.id;
}

function connectOrCreate(fromId: number, x: number, y: number, element: string) {
  if (!state.graph) return;
  snapshot();
  const target = atomAtPoint(x, y);
  if (target && target.id !== fromId) {
    ops.addBond(state.graph, fromId, target.id, state.pendingBondType);
  } else if (!target) {
    const a = ops.addAtom(state.graph, element, x, y);
    ops.addBond(state.graph, fromId, a.id, state.pendingBondType);
    state.selectedAtomId = a.id;
  }
  revalidate();
}

function atomAtPoint(x: number, y: number, tol = 0.45): { id: number } | null {
  if (!state.graph) return null;
  let best: { id: number; d: number } | null = null;
  for (const a of state.graph.atoms) {
    const d = Math.hypot(a.x - x, a.y - y);
    if (d < tol && (!best || d < best.d)) best = { id: a.id, d };
  }
  return best;
}

function addBondBetween(a: number, b: number, type: BondType) {
  if (!state.graph) return;
  snapshot();
  ops.addBond(state.graph, a, b, type);
  revalidate();
}

function setBondType(bondId: number, type: BondType) {
  if (!state.graph) return;
  snapshot();
  ops.setBondType(state.graph, bondId, type);
  revalidate();
}

function setBondWedge(bondId: number, wedge: Wedge) {
  if (!state.graph) return;
  snapshot();
  ops.setBondWedge(state.graph, bondId, wedge);
  revalidate();
}

function flipBond(bondId: number) {
  if (!state.graph) return;
  snapshot();
  ops.flipBondDirection(state.graph, bondId);
  revalidate();
}

function cycleSelectedBond() {
  if (state.selectedBondId === null) return;
  const bond = state.graph?.bonds.find((b) => b.id === state.selectedBondId);
  if (!bond) return;
  const order: BondType[] = ['single', 'double', 'triple', 'aromatic'];
  const next = order[(order.indexOf(bond.type) + 1) % order.length];
  setBondType(bond.id, next);
}

function moveSelectedAtom(x: number, y: number) {
  if (!state.graph || state.selectedAtomId === null) return;
  ops.moveAtom(state.graph, state.selectedAtomId, x, y);
  revalidate();
}

function beginDrag() {
  snapshot();
}

function updateAtom(atomId: number, patch: Parameters<typeof ops.updateAtom>[2]) {
  if (!state.graph) return;
  snapshot();
  ops.updateAtom(state.graph, atomId, patch);
  revalidate();
}

function deleteSelection() {
  if (!state.graph) return;
  if (state.selectedAtomId === null && state.selectedBondId === null) return;
  snapshot();
  if (state.selectedBondId !== null) ops.deleteBond(state.graph, state.selectedBondId);
  if (state.selectedAtomId !== null) ops.deleteAtom(state.graph, state.selectedAtomId);
  state.selectedAtomId = null;
  state.selectedBondId = null;
  revalidate();
}

function undo() {
  const prev = undoStack.pop();
  if (!prev || !state.graph) return;
  redoStack.push(cloneGraph(state.graph));
  state.graph = prev;
  state.selectedAtomId = null;
  state.selectedBondId = null;
  revalidate();
}

function redo() {
  const next = redoStack.pop();
  if (!next || !state.graph) return;
  undoStack.push(cloneGraph(state.graph));
  state.graph = next;
  revalidate();
}

// ---------------------------------------------------------------------------
// 持久化
// ---------------------------------------------------------------------------

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void save(), 600);
}

export { init };

export function useEditor() {
  return {
    state,
    importError,
    canUndo: computed(() => undoStack.length > 0),
    canRedo: computed(() => redoStack.length > 0),
    init,
    importSmiles,
    importMolblock,
    beginNewProject,
    addAtomAt,
    connectOrCreate,
    atomAtPoint,
    addBondBetween,
    setBondType,
    setBondWedge,
    flipBond,
    cycleSelectedBond,
    moveSelectedAtom,
    beginDrag,
    updateAtom,
    deleteSelection,
    undo,
    redo,
    selectAtom: (id: number | null) => {
      state.selectedAtomId = id;
      if (id !== null) state.selectedBondId = null;
    },
    selectBond: (id: number | null) => {
      state.selectedBondId = id;
      if (id !== null) state.selectedAtomId = null;
    },
    setTool: (t: ToolMode) => {
      state.tool = t;
    },
    setPendingElement: (e: string) => {
      state.pendingElement = e;
    },
    setPendingBondType: (t: BondType) => {
      state.pendingBondType = t;
    },
    toggleImplicitH: () => {
      state.showImplicitH = !state.showImplicitH;
    },
    renameProject: (name: string) => {
      state.projectName = name;
      scheduleSave();
    },
    persistNow: async () => {
      await save();
    },
    loadSaved: async (id: string) => {
      const p = await loadProject(id);
      if (p) applyProject(p);
    },
    listSaved: listProjects,
    exportProject: (): Project => ({
      version: 1,
      id: state.projectId,
      name: state.projectName,
      savedAt: Date.now(),
      rawInput: state.rawInput,
      graph: state.graph ? cloneGraph(state.graph) : null,
    }),
    importProject: (p: Project) => applyProject(p),
  };
}

async function save() {
  if (!state.graph && !state.rawInput) return;
  const project: Project = {
    version: 1,
    id: state.projectId,
    name: state.projectName,
    savedAt: Date.now(),
    rawInput: state.rawInput,
    graph: state.graph ? cloneGraph(state.graph) : null,
  };
  await saveProject(project);
}

function applyProject(p: Project) {
  state.projectId = p.id;
  state.projectName = p.name;
  state.rawInput = p.rawInput;
  state.graph = p.graph ? cloneGraph(p.graph) : null;
  undoStack.length = 0;
  redoStack.length = 0;
  state.selectedAtomId = null;
  state.selectedBondId = null;
  if (state.graph) revalidate();
  else state.validation = null;
}
