// V2000 molblock 解析与写入。
// 我们自己的分子图是数据的唯一来源；molblock 是与 RDKit 通信的序列化格式。
// 坐标采用 V2000 约定（y 轴向下），SVG 渲染时翻转 y。
import type { Atom, Bond, BondType, MolGraph, Wedge } from './types';
import { emptyGraph } from './types';

// 键型编号（MDL）：1 单 2 双 3 三 4 芳香
const TYPE_TO_CODE: Record<BondType, number> = { single: 1, double: 2, triple: 3, aromatic: 4 };
const CODE_TO_TYPE: Record<number, BondType> = { 1: 'single', 2: 'double', 3: 'triple', 4: 'aromatic' };

// 立体键代码（在 RDKit 2024.9+ 实测）：
// 0 无；6 实楔（up，宽端朝向观察者）；1 虚楔（down，宽端远离观察者）；
// 4 旧版 hashed wedge 在该版本会被当成“未指定”，不使用。
export function wedgeToCode(w: Wedge, type: BondType): number {
  if (type !== 'single') return 0;
  if (w === 'up') return 6;
  if (w === 'down') return 1;
  return 0;
}
export function codeToWedge(code: number): Wedge {
  if (code === 6) return 'up';
  if (code === 1) return 'down';
  return '';
}

// V2000 原子块电荷代码：1=+3,2=+2,3=+1,4=双自由基,5=-1,6=-2,7=-3
function chargeCodeToCharge(code: number): number {
  switch (code) {
    case 1: return 3;
    case 2: return 2;
    case 3: return 1;
    case 5: return -1;
    case 6: return -2;
    case 7: return -3;
    default: return 0;
  }
}
// 我们统一用 M  CHG 行写电荷，不写原子块代码列，因此不需要反向编码。

function coordField(raw: string): number {
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}

function findCountsLine(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    if (/\d\s+V2000\s*$/.test(lines[i]) || /\d\s+V3000\s*$/.test(lines[i])) return i;
  }
  return -1;
}

/** 解析 V2000 molblock。仅支持我们自己写入的 V2000 子集；V3000 交给 RDKit 另作处理。 */
export function parseMolblock(text: string): MolGraph {
  const lines = text.split(/\r?\n/);
  const countsIdx = findCountsLine(lines);
  if (countsIdx < 0) throw new Error('未找到 V2000 counts 行');
  const counts = lines[countsIdx];
  const numAtoms = parseInt(counts.slice(0, 3), 10);
  const numBonds = parseInt(counts.slice(3, 6), 10);
  if (!Number.isFinite(numAtoms) || !Number.isFinite(numBonds)) {
    throw new Error('counts 行原子/键数量无法解析');
  }

  const graph = emptyGraph();
  const atomIndexToId = new Map<number, number>();

  const atomStart = countsIdx + 1;
  for (let i = 0; i < numAtoms; i++) {
    const line = lines[atomStart + i] ?? '';
    const x = coordField(line.slice(0, 10));
    const y = coordField(line.slice(10, 20));
    const element = (line.slice(31, 34) || '').trim() || 'C';
    // RDKit 实测：数值组各 3 列，首列恒为空格；dd 数字在 35-36，cc 38-39，hhh 44-45
    const dd = parseInt(line.slice(35, 37), 10);
    const cc = parseInt(line.slice(38, 40), 10);
    const hhh = parseInt(line.slice(44, 46), 10);
    const atom: Atom = {
      id: graph.nextAtomId++,
      element: normalizeElement(element),
      x,
      y,
      charge: Number.isFinite(cc) ? chargeCodeToCharge(cc) : 0,
      isotope: 0,
      explicitH: Number.isFinite(hhh) && hhh > 0 ? hhh - 1 : 0,
    };
    atomIndexToId.set(i + 1, atom.id);
    graph.atoms.push(atom);
    void dd; // 同位素以 M  ISO 行为准（绝对值）
  }

  const bondStart = atomStart + numAtoms;
  for (let i = 0; i < numBonds; i++) {
    const line = lines[bondStart + i] ?? '';
    const a1 = parseInt(line.slice(0, 3), 10);
    const a2 = parseInt(line.slice(3, 6), 10);
    const typeCode = parseInt(line.slice(6, 9), 10);
    const stereo = parseInt(line.slice(9, 12), 10);
    const begin = atomIndexToId.get(a1);
    const end = atomIndexToId.get(a2);
    if (begin === undefined || end === undefined) continue;
    graph.bonds.push({
      id: graph.nextBondId++,
      begin,
      end,
      type: CODE_TO_TYPE[typeCode] ?? 'single',
      wedge: codeToWedge(Number.isFinite(stereo) ? stereo : 0),
    });
  }

  // M  行：电荷与同位素（绝对值）
  for (const raw of lines.slice(bondStart + numBonds)) {
    const line = raw.trimStart();
    if (line.startsWith('M  CHG')) {
      const parts = line.split(/\s+/).slice(3).map(Number);
      const n = parts.length / 2;
      for (let k = 0; k < n; k++) {
        const atomNo = parts[k * 2];
        const charge = parts[k * 2 + 1];
        const id = atomIndexToId.get(atomNo);
        const atom = id !== undefined ? graph.atoms.find((a) => a.id === id) : undefined;
        if (atom) atom.charge = charge;
      }
    } else if (line.startsWith('M  ISO')) {
      const parts = line.split(/\s+/).slice(3).map(Number);
      const n = parts.length / 2;
      for (let k = 0; k < n; k++) {
        const atomNo = parts[k * 2];
        const absMass = parts[k * 2 + 1];
        const id = atomIndexToId.get(atomNo);
        const atom = id !== undefined ? graph.atoms.find((a) => a.id === id) : undefined;
        if (atom && absMass > 0) atom.isotope = absMass;
      }
    } else if (line === 'M  END') break;
  }

  return graph;
}

function normalizeElement(sym: string): string {
  if (!sym) return 'C';
  // H / D / T 作为原子元素的情形保留
  if (sym === 'D' || sym === 'T') return sym;
  const upper = sym[0].toUpperCase() + (sym[1] ?? '').toLowerCase();
  return upper;
}

/** 生成严格列对齐的 V2000 块。芳香环需先经 Kekulé 赋值（由 rdkit.ts 调用）。 */
export function writeMolblock(
  graph: MolGraph,
  opts: { kekulizeMap?: Map<number, BondType>; name?: string } = {},
): string {
  const idToIndex = new Map<number, number>();
  graph.atoms.forEach((a, i) => idToIndex.set(a.id, i + 1));

  const lines: string[] = [];
  lines.push(opts.name ?? 'mol-editor');
  lines.push('  RDKit          2D');
  lines.push('');
  lines.push(
    String(graph.atoms.length).padStart(3) +
      String(graph.bonds.length).padStart(3) +
      '  0  0  0  0  0  0  0  0999 V2000',
  );

  for (const a of graph.atoms) {
    lines.push(atomLine(a));
  }
  for (const b of graph.bonds) {
    const type = opts.kekulizeMap?.get(b.id) ?? b.type;
    const code = TYPE_TO_CODE[type] ?? 1;
    const stereo = wedgeToCode(b.wedge, b.type);
    const a1 = idToIndex.get(b.begin)!;
    const a2 = idToIndex.get(b.end)!;
    lines.push(
      String(a1).padStart(3) +
        String(a2).padStart(3) +
        String(code).padStart(3) +
        String(stereo).padStart(3) +
        '  0  0  0',
    );
  }

  // 电荷行（绝对值）
  const charged = graph.atoms.filter((a) => a.charge !== 0);
  for (const chunk of chunked(charged, 8)) {
    let line = 'M  CHG' + String(chunk.length).padStart(3);
    for (const a of chunk) line += String(idToIndex.get(a.id)!).padStart(4) + String(a.charge).padStart(4);
    lines.push(line);
  }
  // 同位素行（绝对质量）
  const iso = graph.atoms.filter((a) => a.isotope > 0 && a.element !== 'D' && a.element !== 'T');
  for (const chunk of chunked(iso, 8)) {
    let line = 'M  ISO' + String(chunk.length).padStart(3);
    for (const a of chunk) line += String(idToIndex.get(a.id)!).padStart(4) + String(a.isotope).padStart(4);
    lines.push(line);
  }
  lines.push('M  END');
  return lines.join('\n');
}

// 严格复刻 RDKit 输出列布局（69 字符）：
// 坐标各 10 列 (0-29)，空格 30，符号 31-33，空格 34。
// 12 个数值组各 3 列、起始列 35/38/41/44/47/50/53/56/59/62/65/68；数字在组内左两列，末列空格。
function atomLine(a: Atom): string {
  const arr = ' '.repeat(69).split('');
  const putNum = (start: number, value: string) => {
    arr[start] = value[0];
    arr[start + 1] = value[1];
  };
  putCoord(arr, 0, a.x.toFixed(4));
  putCoord(arr, 10, a.y.toFixed(4));
  putCoord(arr, 20, '0.0000');
  arr[31] = a.element[0];
  if (a.element[1]) arr[32] = a.element[1];
  const values = [0, 0, 0, a.explicitH > 0 ? a.explicitH + 1 : 0, 0, 0, 0, 0, 0, 0, 0, 0];
  values.forEach((v, i) => putNum(35 + i * 3, String(v)));
  return arr.join('');
}

function putCoord(arr: string[], start: number, value: string): void {
  const padded = value.padStart(10);
  for (let i = 0; i < 10; i++) arr[start + i] = padded[i];
}

function chunked<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/** 从「含显式氢的 V2000 块」反推每个重原子连接的氢数（RDKit 权威隐式/显式 H）。 */
export function hydrogenCountsFromBlock(block: string, heavyCount: number): number[] {
  const lines = block.split(/\r?\n/);
  const countsIdx = findCountsLine(lines);
  const counts = lines[countsIdx];
  const numAtoms = parseInt(counts.slice(0, 3), 10);
  const numBonds = parseInt(counts.slice(3, 6), 10);
  const atomStart = countsIdx + 1;
  const bondStart = atomStart + numAtoms;
  const isH: boolean[] = [];
  for (let i = 0; i < numAtoms; i++) {
    const sym = (lines[atomStart + i] ?? '').slice(31, 34).trim();
    isH.push(sym === 'H' || sym === 'D' || sym === 'T');
  }
  const h = new Array(heavyCount).fill(0);
  for (let i = 0; i < numBonds; i++) {
    const line = lines[bondStart + i] ?? '';
    const a1 = parseInt(line.slice(0, 3), 10);
    const a2 = parseInt(line.slice(3, 6), 10);
    if (isH[a1 - 1] && a2 <= heavyCount) h[a2 - 1]++;
    if (isH[a2 - 1] && a1 <= heavyCount) h[a1 - 1]++;
  }
  return h;
}
