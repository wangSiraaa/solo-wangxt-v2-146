// 分子图核心类型。
// 语义说明：
// - 键类型 bondType 是分子图属性，不只是画线样式。
//   single/double/triple 为普通键（阶数 1/2/3），aromatic 为芳香键（MDL 键型 4）。
// - wedge 仅对单键有意义：'up' 实楔（6）、'down' 虚楔（4）、'' 无立体标记（0）。
//   楔形方向决定手性，以 bond.begin 为窄端、bond.end 为宽端。
// - 原子 isotope=0 表示天然丰度；charge 为形式电荷；explicitH 为显式 H 计数列（V2000 hhh-1），
//   芳香体系中带氢的氮 [nH] 需要该字段为 1。

export type BondType = 'single' | 'double' | 'triple' | 'aromatic';
export type Wedge = '' | 'up' | 'down';

export interface Atom {
  id: number;
  element: string; // 元素符号，如 C / N / O / Cl
  x: number;       // V2000 坐标（埃）
  y: number;
  charge: number;
  isotope: number; // 0 = 默认同位素
  explicitH: number; // V2000 H-count 列：显式氢数（芳香 [nH] 用 1）
}

export interface Bond {
  id: number;
  begin: number; // 原子 id
  end: number;
  type: BondType;
  wedge: Wedge;
}

export interface MolGraph {
  atoms: Atom[];
  bonds: Bond[];
  nextAtomId: number;
  nextBondId: number;
}

export interface ParseError {
  message: string;
  // 在原始输入中定位到的近似列（0 基）；无法定位时为 -1
  column: number;
  // 可解析的最长前缀长度（供输入框高亮）
  prefixLength: number;
}

export interface ValidationResult {
  ok: boolean;
  error?: ParseError;
  canonicalSmiles?: string;
  formula?: string;
  descriptors?: Record<string, number>;
  implicitH?: number[];   // 与 atoms 同序的隐式氢数（由 RDKit 显式氢 molblock 反推）
  numAtomStereo?: number;
  numUnspecifiedStereo?: number;
}

export interface Project {
  version: 1;
  id: string;
  name: string;
  savedAt: number;
  rawInput: string;       // 始终保留原始输入（含无法解析的草稿）
  graph: MolGraph | null; // 解析失败时保留最后一次成功的图（可能为 null）
}

export function emptyGraph(): MolGraph {
  return { atoms: [], bonds: [], nextAtomId: 1, nextBondId: 1 };
}

export function cloneGraph(g: MolGraph): MolGraph {
  return {
    atoms: g.atoms.map((a) => ({ ...a })),
    bonds: g.bonds.map((b) => ({ ...b })),
    nextAtomId: g.nextAtomId,
    nextBondId: g.nextBondId,
  };
}

export const BOND_TYPE_ORDER: Record<BondType, number> = {
  single: 1,
  double: 2,
  triple: 3,
  aromatic: 1, // 芳香键在价态/氢数估算中按 1 计，但语义独立
};

export const BOND_TYPE_LABEL: Record<BondType, string> = {
  single: '单键',
  double: '双键',
  triple: '三键',
  aromatic: '芳香键',
};

export const WEDGE_LABEL: Record<Wedge, string> = {
  '': '普通',
  up: '实楔（朝向观察者）',
  down: '虚楔（远离观察者）',
};
