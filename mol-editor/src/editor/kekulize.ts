// 简化 Kekulé 赋值：把图中环内芳香键（MDL 型 4）按 π 电子需求指派为单/双键，
// 生成 RDKit 可稳定往返的 V2000 块。非环芳香键（如 C:C）保留键型 4，不参与赋值。
// 最终芳香性/价态判定仍由 RDKit sanitize 负责。
//
// 规则覆盖常见教学体系：苯、萘等全碳稠环；吡啶型 N（需 1 个双键）；
// 吡咯型 [nH] / 呋喃 O / 噻吩 S（不参与双键，靠孤对电子满足 4n+2）。
// 指派失败时保留为芳香键交给 RDKit 报错（不会猜测成别的分子）。
import type { Atom, Bond, BondType, MolGraph } from './types';

type Need = 0 | 1;

export interface KekuleResult {
  // bond.id -> 'single' | 'double' | 'aromatic'
  // 出现在 map 中的键会覆盖写出键型；非环芳香键显式写 'aromatic'。
  assignments: Map<number, BondType>;
  ok: boolean;
}

export function kekulize(graph: MolGraph): KekuleResult {
  const aromaticBonds = graph.bonds.filter((b) => b.type === 'aromatic');
  const assignments = new Map<number, BondType>();
  if (aromaticBonds.length === 0) return { assignments, ok: true };

  const adj = new Map<number, { bond: Bond; other: number }[]>();
  for (const a of graph.atoms) adj.set(a.id, []);
  for (const b of aromaticBonds) {
    adj.get(b.begin)!.push({ bond: b, other: b.end });
    adj.get(b.end)!.push({ bond: b, other: b.begin });
  }

  // 用「在环中出现的边」判定：对每条芳香边，去掉它后两端仍连通则它在一个环上。
  const ringBonds = new Set<number>();
  const bondIdSet = new Set(aromaticBonds.map((b) => b.id));
  for (const b of aromaticBonds) {
    if (connectedWithout(graph, adj, b.begin, b.end, b.id, bondIdSet)) ringBonds.add(b.id);
  }

  // 非环芳香键保留键型 4（RDKit 接受如 C:C 的芳香键）
  for (const b of aromaticBonds) {
    if (!ringBonds.has(b.id)) assignments.set(b.id, 'aromatic');
  }

  // 仅对环内芳香键做配额回溯
  const ringAdj = new Map<number, { bond: Bond; other: number }[]>();
  for (const a of graph.atoms) ringAdj.set(a.id, []);
  for (const b of aromaticBonds) {
    if (!ringBonds.has(b.id)) continue;
    ringAdj.get(b.begin)!.push({ bond: b, other: b.end });
    ringAdj.get(b.end)!.push({ bond: b, other: b.begin });
  }

  const need = new Map<number, Need>();
  for (const a of graph.atoms) {
    need.set(a.id, atomDoubleNeed(a, ringAdj.get(a.id)!.length));
  }

  const visitedAtoms = new Set<number>();
  let ok = true;

  for (const start of graph.atoms.map((a) => a.id)) {
    if (visitedAtoms.has(start) || ringAdj.get(start)!.length === 0) continue;

    const compBonds: Bond[] = [];
    const compAtoms: number[] = [];
    const seen = new Set<number>([start]);
    const stack = [start];
    while (stack.length) {
      const cur = stack.pop()!;
      if (visitedAtoms.has(cur)) continue;
      visitedAtoms.add(cur);
      compAtoms.push(cur);
      for (const { bond, other } of ringAdj.get(cur)!) {
        if (!compBonds.some((cb) => cb.id === bond.id)) compBonds.push(bond);
        if (!seen.has(other)) {
          seen.add(other);
          stack.push(other);
        }
      }
    }

    const used = new Map<number, number>(compAtoms.map((id) => [id, 0]));
    const chosen = new Map<number, 1 | 2>();

    const solve = (edgeIdx: number): boolean => {
      if (edgeIdx === compBonds.length) {
        return compAtoms.every((id) => used.get(id)! === need.get(id)!);
      }
      const bond = compBonds[edgeIdx];
      for (const order of [2, 1] as const) {
        const adds = order === 2 ? 1 : 0;
        const u = used.get(bond.begin)! + adds;
        const v = used.get(bond.end)! + adds;
        if (u > need.get(bond.begin)! || v > need.get(bond.end)!) continue;
        used.set(bond.begin, u);
        used.set(bond.end, v);
        chosen.set(bond.id, order);
        if (solve(edgeIdx + 1)) return true;
        used.set(bond.begin, u - adds);
        used.set(bond.end, v - adds);
      }
      chosen.delete(bond.id);
      return false;
    };

    if (!solve(0)) {
      ok = false;
      for (const b of compBonds) assignments.set(b.id, 'aromatic'); // 交给 RDKit 报错
    } else {
      for (const [id, order] of chosen) assignments.set(id, order === 2 ? 'double' : 'single');
    }
  }

  return { assignments, ok };
}

function connectedWithout(
  graph: MolGraph,
  adj: Map<number, { bond: Bond; other: number }[]>,
  from: number,
  to: number,
  excludeBondId: number,
  _bondIds: Set<number>,
): boolean {
  const seen = new Set<number>([from]);
  const stack = [from];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const { bond, other } of adj.get(cur)!) {
      if (bond.id === excludeBondId) continue;
      if (other === to) return true;
      if (!seen.has(other)) {
        seen.add(other);
        stack.push(other);
      }
    }
  }
  return false;
}

function atomDoubleNeed(a: Atom, aromaticRingDegree: number): Need {
  if (aromaticRingDegree === 0) return 0;
  switch (a.element) {
    case 'C':
      return 1;
    case 'N':
      // 带显式氢的芳香氮（吡咯 [nH]）贡献孤对电子，不需要双键
      return a.explicitH > 0 || a.charge !== 0 ? 0 : 1;
    case 'O':
    case 'S':
    case 'P':
      return 0;
    default:
      return 1;
  }
}
