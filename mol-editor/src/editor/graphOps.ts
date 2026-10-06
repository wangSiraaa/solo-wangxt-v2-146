// 分子图的纯函数编辑操作。所有修改都作用于传入图（store 负责先克隆压栈）。
import type { Atom, Bond, BondType, MolGraph, Wedge } from './types';
import { BOND_TYPE_ORDER } from './types';

export function addAtom(graph: MolGraph, element: string, x: number, y: number): Atom {
  const atom: Atom = { id: graph.nextAtomId++, element, x, y, charge: 0, isotope: 0, explicitH: 0 };
  graph.atoms.push(atom);
  return atom;
}

export function addBond(graph: MolGraph, beginId: number, endId: number, type: BondType = 'single', wedge: Wedge = ''): Bond | null {
  if (beginId === endId) return null;
  if (bondBetween(graph, beginId, endId)) return null;
  const bond: Bond = { id: graph.nextBondId++, begin: beginId, end: endId, type, wedge };
  graph.bonds.push(bond);
  return bond;
}

export function bondBetween(graph: MolGraph, a: number, b: number): Bond | undefined {
  return graph.bonds.find(
    (x) => (x.begin === a && x.end === b) || (x.begin === b && x.end === a),
  );
}

export function deleteAtom(graph: MolGraph, atomId: number): void {
  graph.atoms = graph.atoms.filter((a) => a.id !== atomId);
  graph.bonds = graph.bonds.filter((b) => b.begin !== atomId && b.end !== atomId);
}

export function deleteBond(graph: MolGraph, bondId: number): void {
  graph.bonds = graph.bonds.filter((b) => b.id !== bondId);
}

export function setBondType(graph: MolGraph, bondId: number, type: BondType): void {
  const b = graph.bonds.find((x) => x.id === bondId);
  if (!b) return;
  b.type = type;
  // 楔形只对单键成立：改成非单键时清除立体标记（图语义保持一致）
  if (type !== 'single') b.wedge = '';
}

/**
 * 设置楔键。MDL/RDKit 要求楔键从手性中心（窄端）向外辐射，
 * 因此自动把 begin 调整为“更可能是手性中心”的一端（重原子取代度更高者）。
 */
export function setBondWedge(graph: MolGraph, bondId: number, wedge: Wedge): void {
  const b = graph.bonds.find((x) => x.id === bondId);
  if (!b || b.type !== 'single') return;
  if (wedge !== '') orientNarrowEndToCenter(graph, b);
  b.wedge = wedge;
}

/** 交换楔键宽窄端（在两个端点间互换 begin/end）。 */
export function flipBondDirection(graph: MolGraph, bondId: number): void {
  const b = graph.bonds.find((x) => x.id === bondId);
  if (!b) return;
  [b.begin, b.end] = [b.end, b.begin];
}

function orientNarrowEndToCenter(graph: MolGraph, b: Bond): void {
  const centerScore = (atomId: number) => {
    let score = 0;
    for (const x of graph.bonds) {
      if (x.id === b.id) continue;
      if (x.begin === atomId || x.end === atomId) score++;
    }
    return score;
  };
  if (centerScore(b.end) > centerScore(b.begin)) {
    [b.begin, b.end] = [b.end, b.begin];
  }
}

export function moveAtom(graph: MolGraph, atomId: number, x: number, y: number): void {
  const a = graph.atoms.find((x) => x.id === atomId);
  if (a) {
    a.x = x;
    a.y = y;
  }
}

export function updateAtom(
  graph: MolGraph,
  atomId: number,
  patch: Partial<Pick<Atom, 'element' | 'charge' | 'isotope' | 'explicitH'>>,
): void {
  const a = graph.atoms.find((x) => x.id === atomId);
  if (!a) return;
  Object.assign(a, patch);
}

/** 该原子当前的键序之和（芳香键按 1.5 计用于界面估算）。 */
export function bondOrderSum(graph: MolGraph, atomId: number): number {
  let sum = 0;
  let aromatic = false;
  for (const b of graph.bonds) {
    if (b.begin !== atomId && b.end !== atomId) continue;
    if (b.type === 'aromatic') aromatic = true;
    sum += BOND_TYPE_ORDER[b.type];
  }
  return aromatic ? sum + graph.bonds.filter((b) => (b.begin === atomId || b.end === atomId) && b.type === 'aromatic').length * 0.5 : sum;
}

export function atomIsAromatic(graph: MolGraph, atomId: number): boolean {
  return graph.bonds.some((b) => b.type === 'aromatic' && (b.begin === atomId || b.end === atomId));
}

/** 为新连接或孤立原子生成一个不重叠的位置。 */
export function freePosition(graph: MolGraph, near?: { x: number; y: number }, step = 1.5): { x: number; y: number } {
  const base = near ?? { x: 0, y: 0 };
  const candidates = [
    [step, 0], [-step, 0], [0, step], [0, -step],
    [step, step], [step, -step], [-step, step], [-step, -step],
  ];
  for (const [dx, dy] of candidates) {
    const p = { x: base.x + dx, y: base.y + dy };
    if (graph.atoms.every((a) => Math.hypot(a.x - p.x, a.y - p.y) > step * 0.9)) return p;
  }
  return { x: base.x + step * 2, y: base.y };
}
