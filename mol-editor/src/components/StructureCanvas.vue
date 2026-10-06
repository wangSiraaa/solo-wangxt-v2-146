<script setup lang="ts">
// 结构画布：SVG 渲染 + 拾取/拖动/连线。
// 内部坐标为 V2000（y 向下，单位埃），整体缩放平移到像素。
import { computed, ref } from 'vue';
import { useEditor } from '../stores/editor';
import type { Atom, Bond } from '../editor/types';
import { atomIsAromatic, bondOrderSum, freePosition } from '../editor/graphOps';
import { estimateImplicitH } from '../editor/elements';

const {
  state,
  addAtomAt,
  connectOrCreate,
  selectAtom,
  selectBond,
  moveSelectedAtom,
  beginDrag,
} = useEditor();

const SCALE = 46;
const W = 900;
const H = 640;
const svgRef = ref<SVGSVGElement | null>(null);
const drag = ref<{ id: number; moved: boolean } | null>(null);
const linkFrom = ref<number | null>(null);
const rubber = ref<{ x: number; y: number } | null>(null);

interface P { x: number; y: number }

const atoms = computed(() => state.graph?.atoms ?? []);
const bonds = computed(() => state.graph?.bonds ?? []);

function toScreen(p: P): P {
  return { x: p.x * SCALE + W / 2, y: p.y * SCALE + H / 2 };
}
function toMol(e: PointerEvent | MouseEvent): P {
  const rect = svgRef.value!.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left - W / 2) / SCALE,
    y: (e.clientY - rect.top - H / 2) / SCALE,
  };
}

function atomById(id: number): Atom {
  return state.graph!.atoms.find((a) => a.id === id)!;
}
function endpoints(b: Bond): { p1: P; p2: P; a1: Atom; a2: Atom } {
  const a1 = atomById(b.begin);
  const a2 = atomById(b.end);
  return { p1: toScreen(a1), p2: toScreen(a2), a1, a2 };
}

const LABEL_R = 0.32 * SCALE; // 像素半径，线端点裁到文字边缘
function trimEnds(p1: P, p2: P) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  return {
    q1: { x: p1.x + ux * LABEL_R, y: p1.y + uy * LABEL_R },
    q2: { x: p2.x - ux * LABEL_R, y: p2.y - uy * LABEL_R },
    nx: -uy,
    ny: ux,
    len,
  };
}

interface LineGeom { x1: number; y1: number; x2: number; y2: number }
function parallelLines(p1: P, p2: P, count: number, gap: number): LineGeom[] {
  const { q1, q2, nx, ny } = trimEnds(p1, p2);
  const offsets = count === 2 ? [-gap / 2, gap / 2] : [-gap, 0, gap];
  return offsets.map((o) => ({
    x1: q1.x + nx * o,
    y1: q1.y + ny * o,
    x2: q2.x + nx * o,
    y2: q2.y + ny * o,
  }));
}

// 芳香键：实线 + 平行的内虚线（内虚线向环外偏移需要方向，这里只画偏置 5px 的虚线）
function aromaticLines(p1: P, p2: P): { main: LineGeom; dash: LineGeom } {
  const [main, ,] = parallelLines(p1, p2, 3, 5);
  const t = trimEnds(p1, p2);
  const off = 5;
  return {
    main,
    dash: {
      x1: t.q1.x + t.nx * off,
      y1: t.q1.y + t.ny * off,
      x2: t.q2.x + t.nx * off,
      y2: t.q2.y + t.ny * off,
    },
  };
}

const WEDGE_W = 5.5;
function wedgePolygon(p1: P, p2: P): string {
  const t = trimEnds(p1, p2);
  return `${t.q1.x},${t.q1.y} ${t.q2.x + t.nx * WEDGE_W},${t.q2.y + t.ny * WEDGE_W} ${t.q2.x - t.nx * WEDGE_W},${t.q2.y - t.ny * WEDGE_W}`;
}
function hashLines(p1: P, p2: P): LineGeom[] {
  const t = trimEnds(p1, p2);
  const out: LineGeom[] = [];
  const N = 7;
  for (let i = 1; i <= N; i++) {
    const f = i / (N + 1);
    const cx = t.q1.x + (t.q2.x - t.q1.x) * f;
    const cy = t.q1.y + (t.q2.y - t.q1.y) * f;
    const w = 1.2 + f * (WEDGE_W - 1.2);
    out.push({ x1: cx - t.nx * w, y1: cy - t.ny * w, x2: cx + t.nx * w, y2: cy + t.ny * w });
  }
  return out;
}

function bondLines(b: Bond): LineGeom[] {
  const { p1, p2 } = endpoints(b);
  const { q1, q2 } = trimEnds(p1, p2);
  switch (b.type) {
    case 'double':
      return parallelLines(p1, p2, 2, 5);
    case 'triple':
      return parallelLines(p1, p2, 3, 5);
    default:
      return [{ x1: q1.x, y1: q1.y, x2: q2.x, y2: q2.y }];
  }
}

// 原子标注 ------------------------------------------------------------------
function displayLabel(a: Atom) {
  let main = a.element;
  if (a.element === 'D' || a.element === 'T') main = 'H';
  return main;
}
function isotopePrefix(a: Atom): string {
  if (a.element === 'D') return '2';
  if (a.element === 'T') return '3';
  return a.isotope > 0 ? String(a.isotope) : '';
}
function chargeSup(a: Atom): string {
  if (a.charge === 0) return '';
  const sign = a.charge > 0 ? '+' : '−';
  const mag = Math.abs(a.charge);
  return (mag > 1 ? mag : '') + sign;
}
function implicitHFor(a: Atom): number | null {
  if (!state.graph || !state.showImplicitH) return null;
  if (a.explicitH > 0) return a.explicitH;
  const idx = state.graph.atoms.indexOf(a);
  const rdH = state.validation?.implicitH?.[idx];
  if (state.validation?.ok && typeof rdH === 'number') return rdH;
  const arom = atomIsAromatic(state.graph, a.id);
  const sum = bondOrderSum(state.graph, a.id);
  return estimateImplicitH(a.element, sum, a.charge, arom, a.explicitH);
}

// 交互 ----------------------------------------------------------------------
function onBackgroundDown(e: PointerEvent) {
  selectAtom(null);
  selectBond(null);
  void e;
}
function onAtomDown(e: PointerEvent, a: Atom) {
  e.stopPropagation();
  (e.target as Element).setPointerCapture?.(e.pointerId);
  if (state.tool === 'addBond') {
    linkFrom.value = a.id;
    rubber.value = toScreen(toMol(e));
  } else {
    selectAtom(a.id);
    drag.value = { id: a.id, moved: false };
    beginDrag();
  }
}
function onMove(e: PointerEvent) {
  const m = toMol(e);
  if (drag.value && state.graph) {
    drag.value.moved = true;
    const a = atomById(drag.value.id);
    a.x = m.x;
    a.y = m.y;
  }
  if (linkFrom.value !== null) rubber.value = toScreen(m);
}
function onUp(e: PointerEvent) {
  const m = toMol(e);
  if (linkFrom.value !== null && state.graph) {
    connectOrCreate(linkFrom.value, m.x, m.y, state.pendingElement);
    linkFrom.value = null;
    rubber.value = null;
    return;
  }
  if (drag.value) {
    if (drag.value.moved) moveSelectedAtom(m.x, m.y);
    drag.value = null;
  }
}
function onEmptyDblClick(e: MouseEvent) {
  const m = toMol(e);
  addAtomAt(state.pendingElement, m.x, m.y);
}
function quickExtend(a: Atom) {
  if (!state.graph) return;
  const pos = freePosition(state.graph, a);
  // connectOrCreate 在该位置无原子时会新建原子并连键，且只有一次撤销快照
  connectOrCreate(a.id, pos.x, pos.y, state.pendingElement);
}

const invalid = computed(() => !!state.validation && !state.validation.ok);
const linkAtomPos = computed(() => (linkFrom.value !== null && state.graph ? toScreen(atomById(linkFrom.value)) : null));
</script>

<template>
  <svg
    ref="svgRef"
    class="canvas"
    :viewBox="`0 0 ${W} ${H}`"
    @pointerdown="onBackgroundDown"
    @pointermove="onMove"
    @pointerup="onUp"
    @dblclick="onEmptyDblClick"
  >
    <rect class="bg" x="0" y="0" :width="W" :height="H" />

    <line v-if="linkAtomPos && rubber" :x1="linkAtomPos.x" :y1="linkAtomPos.y" :x2="rubber.x" :y2="rubber.y" class="rubber" />

    <g v-for="b in bonds" :key="b.id">
      <line
        :x1="endpoints(b).p1.x" :y1="endpoints(b).p1.y"
        :x2="endpoints(b).p2.x" :y2="endpoints(b).p2.y"
        class="bond-hit"
        @pointerdown.stop="selectBond(b.id)"
      />
      <!-- 芳香键：实线 + 平行虚线 -->
      <template v-if="b.type === 'aromatic'">
        <line
          :x1="aromaticLines(endpoints(b).p1, endpoints(b).p2).main.x1"
          :y1="aromaticLines(endpoints(b).p1, endpoints(b).p2).main.y1"
          :x2="aromaticLines(endpoints(b).p1, endpoints(b).p2).main.x2"
          :y2="aromaticLines(endpoints(b).p1, endpoints(b).p2).main.y2"
          class="bond-line aromatic-solid"
          :class="{ sel: state.selectedBondId === b.id }"
        />
        <line
          :x1="aromaticLines(endpoints(b).p1, endpoints(b).p2).dash.x1"
          :y1="aromaticLines(endpoints(b).p1, endpoints(b).p2).dash.y1"
          :x2="aromaticLines(endpoints(b).p1, endpoints(b).p2).dash.x2"
          :y2="aromaticLines(endpoints(b).p1, endpoints(b).p2).dash.y2"
          class="bond-line aromatic-dash"
          :class="{ sel: state.selectedBondId === b.id }"
        />
      </template>
      <!-- 单键（可能带楔） -->
      <template v-else-if="b.type === 'single'">
        <line
          v-if="!b.wedge"
          v-bind="bondLines(b)[0]"
          class="bond-line"
          :class="{ sel: state.selectedBondId === b.id }"
        />
        <polygon
          v-else-if="b.wedge === 'up'"
          :points="wedgePolygon(endpoints(b).p1, endpoints(b).p2)"
          class="wedge"
          :class="{ sel: state.selectedBondId === b.id }"
        />
        <line
          v-else
          v-for="(ln, i) in hashLines(endpoints(b).p1, endpoints(b).p2)"
          :key="i"
          v-bind="ln"
          class="bond-line hash"
          :class="{ sel: state.selectedBondId === b.id }"
        />
      </template>
      <!-- 双/三键 -->
      <template v-else>
        <line
          v-for="(ln, i) in bondLines(b)"
          :key="i"
          v-bind="ln"
          class="bond-line"
          :class="{ sel: state.selectedBondId === b.id }"
        />
      </template>
    </g>

    <g v-for="a in atoms" :key="a.id">
      <circle
        :cx="toScreen(a).x" :cy="toScreen(a).y" r="16"
        class="atom-hit"
        :class="{ sel: state.selectedAtomId === a.id }"
        @pointerdown="onAtomDown($event, a)"
        @dblclick.stop="quickExtend(a)"
      />
      <text
        :x="toScreen(a).x" :y="toScreen(a).y"
        class="atom-label"
        :class="{ hetero: a.element !== 'C' && a.element !== 'H', selected: state.selectedAtomId === a.id, invalid }"
      >
        <tspan v-if="isotopePrefix(a)" class="iso-pre">{{ isotopePrefix(a) }}</tspan>
        {{ displayLabel(a) }}
        <tspan v-if="chargeSup(a)" class="charge-sup">{{ chargeSup(a) }}</tspan>
        <tspan v-if="implicitHFor(a) !== null && implicitHFor(a)! > 0" class="h-sub">H<tspan v-if="implicitHFor(a)! > 1" class="h-num">{{ implicitHFor(a) }}</tspan></tspan>
      </text>
    </g>
  </svg>
</template>

<style scoped>
.canvas {
  width: 100%;
  height: 100%;
  display: block;
  background: #fafaf7;
  background-image:
    linear-gradient(rgba(60, 90, 120, 0.07) 1px, transparent 1px),
    linear-gradient(90deg, rgba(60, 90, 120, 0.07) 1px, transparent 1px);
  background-size: 23px 23px;
  border-radius: 8px;
  touch-action: none;
}
.bg { fill: transparent; }
.bond-hit { stroke: transparent; stroke-width: 18; cursor: pointer; }
.bond-line { stroke: #22303c; stroke-width: 2.2; stroke-linecap: round; }
.bond-line.sel { stroke: #c2410c; }
.aromatic-solid { stroke-width: 1.8; }
.aromatic-dash { stroke-dasharray: 2.5 3.5; stroke-width: 1.5; }
.wedge { fill: #22303c; }
.wedge.sel { fill: #c2410c; }
.hash { stroke-width: 2; }
.atom-hit { fill: transparent; cursor: grab; }
.atom-hit.sel { fill: rgba(234, 88, 12, 0.14); }
.atom-label {
  font: 600 16px 'Helvetica Neue', Arial, sans-serif;
  fill: #333;
  text-anchor: middle;
  dominant-baseline: central;
  pointer-events: none;
}
.atom-label.hetero { fill: #11508c; }
.atom-label.selected { fill: #c2410c; }
.iso-pre { font-size: 10px; font-weight: 700; fill: #7c2d12; }
.charge-sup { font-size: 10px; font-weight: 700; fill: #9f1239; }
.h-sub { font-size: 11px; fill: #11508c; }
.h-num { font-size: 8px; }
.rubber { stroke: #c2410c; stroke-width: 1.5; stroke-dasharray: 4 3; }
</style>
