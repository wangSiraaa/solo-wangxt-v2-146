// 教学场景允许编辑的元素与常用价态/属性参考表。
// 隐式氢的最终判定由 RDKit 负责；此表仅用于编辑界面的实时估算与提示。

export interface ElementInfo {
  symbol: string;
  name: string;
  // 常见价态（键序之和，不含电荷修正），按优先级尝试
  valences: number[];
  // 常见稳定同位素（教学用）
  isotopes: number[];
}

export const ELEMENTS: ElementInfo[] = [
  { symbol: 'C', name: '碳', valences: [4], isotopes: [12, 13, 14] },
  { symbol: 'N', name: '氮', valences: [3, 5], isotopes: [14, 15] },
  { symbol: 'O', name: '氧', valences: [2], isotopes: [16, 17, 18] },
  { symbol: 'S', name: '硫', valences: [2, 4, 6], isotopes: [32, 33, 34, 36] },
  { symbol: 'P', name: '磷', valences: [3, 5], isotopes: [31] },
  { symbol: 'F', name: '氟', valences: [1], isotopes: [19] },
  { symbol: 'Cl', name: '氯', valences: [1], isotopes: [35, 37] },
  { symbol: 'Br', name: '溴', valences: [1], isotopes: [79, 81] },
  { symbol: 'I', name: '碘', valences: [1], isotopes: [127] },
  { symbol: 'B', name: '硼', valences: [3], isotopes: [10, 11] },
  { symbol: 'Si', name: '硅', valences: [4], isotopes: [28, 29, 30] },
  { symbol: 'H', name: '氢（显式）', valences: [1], isotopes: [1, 2, 3] },
];

export const ELEMENT_MAP = new Map(ELEMENTS.map((e) => [e.symbol, e]));

// 天然丰度默认质量（用于计算质量差与显示）
export const NOMINAL_MASS: Record<string, number> = {
  H: 1, D: 2, T: 3, C: 12, N: 14, O: 16, S: 32, P: 31,
  F: 19, Cl: 35, Br: 79, I: 127, B: 11, Si: 28,
};

/**
 * 本地隐式氢估算（教学用，权威结果以 RDKit 为准）：
 * 对非芳香原子：H = 价态 - 键序和 + 电荷修正（N+ 减一、O+ 减一；负电荷增一）。
 * 芳香原子按芳香体系单独处理，无法简单估计时返回 null（界面显示“以 RDKit 为准”）。
 */
export function estimateImplicitH(
  element: string,
  bondOrderSum: number,
  charge: number,
  aromatic: boolean,
  explicitH: number,
): number | null {
  if (explicitH > 0) return explicitH;
  if (aromatic) return null; // 芳香原子的氢由 RDKit 芳香性模型确定（如 [nH]）
  const info = ELEMENT_MAP.get(element);
  if (!info) return null;
  const effective = bondOrderSum - charge; // 正电荷减少一个成键需求
  for (const v of info.valences) {
    const h = v - effective;
    if (h >= 0) return h;
  }
  return 0;
}
