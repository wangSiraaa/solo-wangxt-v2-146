// RDKit 封装：解析、价态校验、规范化 SMILES、描述符、隐式氢反推。
// 设计约定：RDKit 是化学正确性的唯一裁判；本地图是编辑器的数据模型。
// 校验失败时返回错误定位，不猜测替代分子。
import type { MainModule, Mol } from './rdkit-types';
import type { MolGraph, ParseError, ValidationResult } from './types';
import { parseMolblock, writeMolblock, hydrogenCountsFromBlock } from './molblock';
import { kekulize } from './kekulize';

let rdkit: MainModule | null = null;
let loading: Promise<MainModule> | null = null;

declare global {
  interface Window {
    initRDKitModule?: (opts?: unknown) => Promise<MainModule>;
  }
}


/** 浏览器从同源 vendor 加载 UMD；Node（测试）直接 require 包。 */
export async function loadRDKit(): Promise<MainModule> {
  if (rdkit) return rdkit;
  if (loading) return loading;
  loading = (async () => {
    if (typeof window !== 'undefined') {
      if (!window.initRDKitModule) {
        await new Promise<void>((resolve, reject) => {
          const s = document.createElement('script');
        // 文件位于 public/vendor，构建后位于站点根 /vendor
        const base = document.baseURI.replace(/\/[^/]*$/, '/');
        s.src = base + 'vendor/RDKit_minimal.js';
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('RDKit 脚本加载失败'));
        document.head.appendChild(s);
        });
      }
      rdkit = await window.initRDKitModule!();
    } else {
      // Node 测试环境（浏览器中不会进入该分支）。
      // 标识符拼接避免浏览器打包器静态解析 node: 内置模块；Node 测试由 esbuild 打包。
      const p = 'node:';
      const nodePath: typeof import('node:path') = await import(/* @vite-ignore */ p + 'path');
      const nodeModule: typeof import('node:module') = await import(/* @vite-ignore */ p + 'module');
      const nodeRequire = nodeModule.createRequire(import.meta.url);
      const distEntry: string = nodeRequire.resolve('@rdkit/rdkit');
      const distDir = nodePath.dirname(distEntry);
      const init = nodeRequire(nodePath.join(distDir, 'RDKit_minimal.js'));
      rdkit = await init({ locateFile: (f: string) => nodePath.join(distDir, f) });
    }
    return rdkit!;
  })();
  return loading;
}

export function rdkitReady(): boolean {
  return rdkit !== null;
}

function isoSmiles(m: Mol): string {
  return m.get_smiles(JSON.stringify({ isomericSmiles: true }));
}

// ---------------------------------------------------------------------------
// SMILES 导入
// ---------------------------------------------------------------------------

/**
 * 从 SMILES 构建分子图。成功返回图与规范形式；失败返回错误定位，调用方负责保留草稿。
 */
export function graphFromSmiles(input: string): { graph: MolGraph; canonical: string; descriptors: Record<string, number>; implicitH: number[] } | { error: ParseError } {
  if (!rdkit) throw new Error('RDKit 未初始化');
  const trimmed = input.trim();
  const mol = rdkit.get_mol(trimmed);
  if (!mol || !mol.is_valid()) {
    mol?.delete();
    return { error: locateSmilesError(trimmed) };
  }

  // 用非 kekulé 块建图以保留芳香键语义（键型 4）；坐标/楔键与 kekulé 版一致。
  const aroBlock = safeMolblock(mol, { kekulize: false }) ?? mol.get_v2Kmolblock();
  let graph: MolGraph;
  try {
    graph = parseMolblock(aroBlock);
  } catch (e) {
    mol.delete();
    return { error: { message: 'molblock 解析失败：' + (e as Error).message, column: -1, prefixLength: 0 } };
  }

  // 非 kekulé 块的 [nH] 不带 H 计数，用 RDKit 显式氢块反推芳香 N 的显式氢，
  // 使我们自己写回的 V2000 能稳定恢复 [nH]。
  markExplicitAromaticNH(mol, graph);

  const canonical = isoSmiles(mol);
  const descriptors = parseDescriptors(mol.get_descriptors());
  const implicitH = inferHydrogenCounts(mol, graph);
  mol.delete();
  return { graph, canonical, descriptors, implicitH };
}

function safeMolblock(mol: Mol, opts: Record<string, unknown>): string | null {
  try {
    return mol.get_molblock(JSON.stringify(opts));
  } catch {
    return null;
  }
}

/**
 * 非 kekulé 块里 [nH] 的氢没有写进 H 计数列。用 RDKit add_hs 后的键连关系
 * 权威地找出“参与芳香键且直接连有显式 H”的氮，设置 explicitH。
 */
function markExplicitAromaticNH(src: Mol, graph: MolGraph): void {
  const copy = src.copy();
  if (!copy) return;
  try {
    copy.add_hs_in_place();
    const lines = copy.get_v2Kmolblock().split(/\r?\n/);
    const countsIdx = lines.findIndex((l: string) => /V2000\s*$/.test(l));
    if (countsIdx < 0) return;
    const numAtoms = parseInt(lines[countsIdx].slice(0, 3), 10);
    const numBonds = parseInt(lines[countsIdx].slice(3, 6), 10);
    const atomStart = countsIdx + 1;
    const symAt = (i: number) => (lines[atomStart + i] ?? '').slice(31, 34).trim();
    const bondStart = atomStart + numAtoms;
    const hLinks = new Array(graph.atoms.length).fill(0);
    for (let i = 0; i < numBonds; i++) {
      const line = lines[bondStart + i] ?? '';
      const a1 = parseInt(line.slice(0, 3), 10);
      const a2 = parseInt(line.slice(3, 6), 10);
      if (symAt(a1 - 1) === 'H' && a2 <= graph.atoms.length) hLinks[a2 - 1]++;
      if (symAt(a2 - 1) === 'H' && a1 <= graph.atoms.length) hLinks[a1 - 1]++;
    }
    graph.atoms.forEach((atom, idx) => {
      const arom = graph.bonds.some((b) => b.type === 'aromatic' && (b.begin === atom.id || b.end === atom.id));
      if (arom && atom.element === 'N' && hLinks[idx] > 0) atom.explicitH = hLinks[idx];
    });
  } finally {
    copy.delete();
  }
}

/**
 * 错误定位：RDKit 只在控制台给出大致位置。这里用「最长可解析前缀」策略，
 * 并自动补全未闭合的括号与环数字，定位更贴近教学场景。
 */
function locateSmilesError(smiles: string): ParseError {
  const base = { message: `RDKit 无法解析该 SMILES：“${smiles}”。原始输入已保留为草稿，未替换为近似分子。` };
  if (!smiles) return { ...base, column: -1, prefixLength: 0 };

  // 二分/线性搜索最长的“补全后可解析”前缀
  let best = 0;
  for (let len = 1; len <= smiles.length; len++) {
    const prefix = smiles.slice(0, len);
    if (parsable(augment(prefix))) best = len;
  }

  if (best === 0) {
    // 首个字符都无法构成分子
    return { ...base, column: 0, prefixLength: 0 };
  }
  // 错误位置从 best 开始（best 处字符引入后不可解析）
  const column = Math.min(best, smiles.length - 1);
  const ch = smiles[column];
  let hint = '';
  if (ch === ')') hint = '（可能存在多余的右括号）';
  else if (/\d/.test(ch)) hint = '（环闭合数字可能不匹配）';
  else if (ch === ']') hint = '（方括号原子可能书写不完整）';
  return {
    ...base,
    message: base.message + ` 问题大约从第 ${column + 1} 个字符开始${hint}。`,
    column,
    prefixLength: best,
  };
}

/** 补全未闭合的分支括号；返回候选字符串数组（启发式，不改变前缀已有字符）。 */
function augment(prefix: string): string[] {
  const candidates = new Set<string>();
  const open = (prefix.match(/\(/g) ?? []).length;
  const close = (prefix.match(/\)/g) ?? []).length;
  const missingParens = Math.max(0, open - close);

  // 未配对环数字：出现奇数次的数字
  const ringCounts: Record<string, number> = {};
  for (const c of prefix) {
    if (/\d/.test(c)) ringCounts[c] = (ringCounts[c] ?? 0) + 1;
  }
  const oddRings = Object.entries(ringCounts)
    .filter(([, n]) => n % 2 === 1)
    .map(([d]) => d);

  const closeParens = ')'.repeat(missingParens);
  candidates.add(prefix + closeParens);
  // 环数字闭合：在补括号前先补环闭合
  if (oddRings.length) {
    candidates.add(prefix + oddRings.join('') + closeParens);
  }
  // 未关闭的方括号
  const openSq = (prefix.match(/\[/g) ?? []).length;
  const closeSq = (prefix.match(/\]/g) ?? []).length;
  if (openSq > closeSq) {
    const fixed = prefix + ']' + closeParens;
    candidates.add(fixed);
  }
  return [...candidates];
}

function parsable(candidates: string[]): boolean {
  return candidates.some((s) => {
    try {
      const m = rdkit!.get_mol(s);
      const ok = !!m && m.is_valid();
      m?.delete();
      return ok;
    } catch {
      return false;
    }
  });
}

// ---------------------------------------------------------------------------
// 图校验 / 规范化
// ---------------------------------------------------------------------------

/**
 * 用本地图重新校验：本地 Kekulé → V2000 → RDKit sanitize → 规范 SMILES / 描述符 / 氢数。
 * 任何失败都返回错误，图与原始输入保持不变（不猜分子）。
 */
export function validateGraph(graph: MolGraph): ValidationResult {
  if (!rdkit) return { ok: false, error: { message: 'RDKit 未初始化', column: -1, prefixLength: 0 } };
  if (graph.atoms.length === 0) {
    return { ok: false, error: { message: '空分子：请先从 SMILES 导入或在画布上添加原子。', column: -1, prefixLength: 0 } };
  }

  const kek = kekulize(graph);
  const block = writeMolblock(graph, { kekulizeMap: kek.assignments });

  let mol: Mol | null;
  try {
    mol = rdkit.get_mol(block);
  } catch (e) {
    return { ok: false, error: { message: '分子块无法被 RDKit 读取：' + (e as Error).message, column: -1, prefixLength: 0 } };
  }
  if (!mol || !mol.is_valid()) {
    mol?.delete();
    if (!kek.ok) {
      return {
        ok: false,
        error: {
          message: '芳香键无法形成合理的交替单双键（Kekulé 结构），请检查芳香环是否完整、含氮芳环的 [nH] 设置。',
          column: -1,
          prefixLength: 0,
        },
      };
    }
    return {
      ok: false,
      error: {
        message: '价态或结构校验未通过（RDKit sanitize 失败）：常见原因包括超价、错误的键型组合或不完整芳香环。修改已保留，可撤销。',
        column: -1,
        prefixLength: 0,
      },
    };
  }

  const result: ValidationResult = {
    ok: true,
    canonicalSmiles: isoSmiles(mol),
    descriptors: parseDescriptors(mol.get_descriptors()),
    formula: molecularFormula(graph, mol),
    implicitH: inferHydrogenCounts(mol, graph),
  };
  result.numAtomStereo = result.descriptors?.NumAtomStereoCenters ?? 0;
  result.numUnspecifiedStereo = result.descriptors?.NumUnspecifiedAtomStereoCenters ?? 0;
  mol.delete();
  return result;
}

function parseDescriptors(json: string): Record<string, number> {
  try {
    const obj = JSON.parse(json) as Record<string, number>;
    // RDKit 以科学计数法返回（如 9.0031E1），JSON.parse 可直接处理
    return obj;
  } catch {
    return {};
  }
}

/** 用 add_hs 的显式氢 molblock 反推每个（重）原子的氢数。不修改传入 mol。 */
function inferHydrogenCounts(src: Mol, graph: MolGraph): number[] {
  const copy = src.copy();
  if (!copy) return new Array(graph.atoms.length).fill(0);
  try {
    copy.add_hs_in_place();
    const block = copy.get_v2Kmolblock();
    return hydrogenCountsFromBlock(block, graph.atoms.length);
  } catch {
    return new Array(graph.atoms.length).fill(0);
  } finally {
    copy.delete();
  }
}

/**
 * 分子式：优先信任 RDKit（add_hs 后数原子），避免本地价态表误差。
 * 返回 Hill 记法（C 在前、H 紧随，其余字母序）。
 */
function molecularFormula(graph: MolGraph, mol: Mol): string {
  const copy = mol.copy();
  if (!copy) return '';
  try {
    copy.add_hs_in_place();
    const block = copy.get_v2Kmolblock();
    const lines = block.split(/\r?\n/);
    const countsIdx = lines.findIndex((l: string) => /V2000\s*$/.test(l));
    const numAtoms = parseInt(lines[countsIdx].slice(0, 3), 10);
    const counts: Record<string, number> = {};
    for (let i = 0; i < numAtoms; i++) {
      const line = lines[countsIdx + 1 + i] ?? '';
      let sym = line.slice(31, 34).trim();
      if (sym === 'D' || sym === 'T') sym = 'H';
      counts[sym] = (counts[sym] ?? 0) + 1;
    }
    return hillFormula(counts);
  } finally {
    copy.delete();
  }
  void graph;
}

function hillFormula(counts: Record<string, number>): string {
  const order: string[] = [];
  if (counts.C) order.push('C');
  if (counts.H) order.push('H');
  const rest = Object.keys(counts)
    .filter((s) => s !== 'C' && s !== 'H')
    .sort();
  order.push(...rest);
  return order.map((s) => s + (counts[s] > 1 ? counts[s] : '')).join('');
}
