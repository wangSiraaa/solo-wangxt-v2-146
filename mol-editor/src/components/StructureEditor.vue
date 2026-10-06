<script setup lang="ts">
/**
 * SVG 结构编辑器画布。
 * 渲染完全由分子图模型驱动；任何修改都经 store.mutate → RDKit 重新校验，
 * 楔形键/芳香键/键级在模型中有不同语义，不只是不同的线条。
 */
import { computed, ref } from 'vue'
import type { Atom, Bond, MolGraph } from '../chem/model'
import { addAtom, addBond, findBond, getAtom, removeAtom, removeBond, orientWedge } from '../chem/model'
import {
  state, mutate, revalidate, pushUndo,
  selectAtom, selectBond, clearSelection,
} from '../store/editorStore'

const SCALE = 40 // 屏幕 px / 模型单位

const svgEl = ref<SVGSVGElement | null>(null)

// ---------- 视图 ----------

const viewBox = computed(() => {
  const atoms = state.graph.atoms
  if (atoms.length === 0) return '0 0 640 420'
  const xs = atoms.map((a) => a.x * SCALE)
  const ys = atoms.map((a) => a.y * SCALE)
  const pad = 80
  const minX = Math.min(...xs) - pad
  const maxX = Math.max(...xs) + pad
  const minY = Math.min(...ys) - pad
  const maxY = Math.max(...ys) + pad
  return `${minX} ${minY} ${Math.max(maxX - minX, 240)} ${Math.max(maxY - minY, 180)}`
})

function toModel(e: PointerEvent): { x: number; y: number } {
  const svg = svgEl.value!
  const ctm = svg.getScreenCTM()
  if (!ctm) return { x: 0, y: 0 }
  const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
  return { x: pt.x / SCALE, y: pt.y / SCALE }
}

// ---------- 键的几何 ----------

interface Pt { x: number; y: number }

function bondEnds(b: Bond): [Pt, Pt] {
  const a1 = getAtom(state.graph, b.a1)!
  const a2 = getAtom(state.graph, b.a2)!
  return [
    { x: a1.x * SCALE, y: a1.y * SCALE },
    { x: a2.x * SCALE, y: a2.y * SCALE },
  ]
}

function normalOf(p1: Pt, p2: Pt): Pt {
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  const len = Math.hypot(dx, dy) || 1
  return { x: -dy / len, y: dx / len }
}

/** 普通键（单/双/三/芳香）的平行线组 */
function bondLines(b: Bond): { x1: number; y1: number; x2: number; y2: number; dashed: boolean }[] {
  const [p1, p2] = bondEnds(b)
  const n = normalOf(p1, p2)
  const off = (d: number) => ({ x1: p1.x + n.x * d, y1: p1.y + n.y * d, x2: p2.x + n.x * d, y2: p2.y + n.y * d })
  if (b.aromatic) return [{ ...off(0), dashed: false }, { ...off(5), dashed: true }]
  if (b.order === 2) return [{ ...off(-4), dashed: false }, { ...off(4), dashed: false }]
  if (b.order === 3) return [{ ...off(0), dashed: false }, { ...off(-7), dashed: false }, { ...off(7), dashed: false }]
  return [{ ...off(0), dashed: false }]
}

/** 实心楔形键多边形（窄端在 a1） */
function wedgePoints(b: Bond): string {
  const [p1, p2] = bondEnds(b)
  const n = normalOf(p1, p2)
  const w = 9
  return `${p1.x},${p1.y} ${p2.x + n.x * w},${p2.y + n.y * w} ${p2.x - n.x * w},${p2.y - n.y * w}`
}

/** 虚线楔键：一组逐渐变长的横档 */
function hashTicks(b: Bond): { x1: number; y1: number; x2: number; y2: number }[] {
  const [p1, p2] = bondEnds(b)
  const n = normalOf(p1, p2)
  const ticks = []
  const N = 6
  for (let i = 1; i <= N; i++) {
    const t = i / N
    const cx = p1.x + (p2.x - p1.x) * t
    const cy = p1.y + (p2.y - p1.y) * t
    const hw = 1.5 + 7.5 * t
    ticks.push({ x1: cx + n.x * hw, y1: cy + n.y * hw, x2: cx - n.x * hw, y2: cy - n.y * hw })
  }
  return ticks
}

// ---------- 原子标签 ----------

interface LabelPart { text: string; cls: 'base' | 'super' | 'sub' }

function atomDegree(g: MolGraph, id: number): number {
  return g.bonds.filter((b) => b.a1 === id || b.a2 === id).length
}

function showLabel(a: Atom): boolean {
  return (
    a.elem !== 'C' || a.charge !== 0 || a.isotope > 0 ||
    atomDegree(state.graph, a.id) === 0 || state.selectedAtomId === a.id
  )
}

function formatCharge(c: number): string {
  if (c === 0) return ''
  const sign = c > 0 ? '+' : '−'
  return Math.abs(c) === 1 ? sign : `${Math.abs(c)}${sign}`
}

function labelParts(a: Atom, index: number): LabelPart[] {
  const parts: LabelPart[] = []
  if (a.isotope > 0) parts.push({ text: String(a.isotope), cls: 'super' })
  parts.push({ text: a.elem, cls: 'base' })
  const impH = state.analysis?.impHs[index] ?? 0
  if (impH > 0) {
    parts.push({ text: 'H', cls: 'base' })
    if (impH > 1) parts.push({ text: String(impH), cls: 'sub' })
  }
  if (a.charge !== 0) parts.push({ text: formatCharge(a.charge), cls: 'super' })
  return parts
}

/** 立体标签（CIP）在画布上的标注位置 */
const stereoAnnotations = computed(() => {
  const out: { x: number; y: number; text: string; key: string }[] = []
  const tags = state.analysis?.stereoTags ?? []
  for (const t of tags) {
    if (t.kind === 'atom') {
      const a = state.graph.atoms[t.index]
      if (a) out.push({ x: a.x * SCALE, y: a.y * SCALE - 22, text: t.label, key: `a${t.index}` })
    } else {
      const b = findBond(state.graph,
        state.graph.atoms[t.index]?.id ?? -1,
        state.graph.atoms[t.index2 ?? -1]?.id ?? -1)
      if (b) {
        const [p1, p2] = bondEnds(b)
        out.push({ x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 - 14, text: t.label, key: `b${b.id}` })
      }
    }
  }
  return out
})

// ---------- 交互 ----------

type DragMode =
  | { kind: 'move'; atomId: number; moved: boolean }
  | { kind: 'bond'; fromAtomId: number; to: Pt }
  | null

const drag = ref<DragMode>(null)

const dragPreview = computed(() => {
  const d = drag.value
  if (!d || d.kind !== 'bond') return null
  const a = getAtom(state.graph, d.fromAtomId)
  if (!a) return null
  return { x1: a.x * SCALE, y1: a.y * SCALE, x2: d.to.x, y2: d.to.y }
})

function nearestAtom(p: Pt, radiusModel: number): Atom | undefined {
  let best: Atom | undefined
  let bestD = radiusModel
  for (const a of state.graph.atoms) {
    const d = Math.hypot(a.x - p.x / SCALE, a.y - p.y / SCALE)
    if (d < bestD) { best = a; bestD = d }
  }
  return best
}

function onAtomPointerDown(a: Atom, e: PointerEvent): void {
  if (!state.ready) return
  if (state.tool === 'select') {
    selectAtom(a.id)
    drag.value = { kind: 'move', atomId: a.id, moved: false }
    attachWindowDrag()
  } else if (state.tool === 'bond') {
    drag.value = { kind: 'bond', fromAtomId: a.id, to: { x: a.x * SCALE, y: a.y * SCALE } }
    attachWindowDrag()
  } else if (state.tool === 'atom') {
    pushUndo()
    mutate((g) => { getAtom(g, a.id)!.elem = state.atomElement })
    selectAtom(a.id)
  } else if (state.tool === 'erase') {
    pushUndo()
    mutate((g) => removeAtom(g, a.id))
    clearSelection()
  }
  e.preventDefault()
}

function onBondPointerDown(b: Bond, e: PointerEvent): void {
  if (!state.ready) return
  if (state.tool === 'select') {
    selectBond(b.id)
  } else if (state.tool === 'bond') {
    pushUndo()
    mutate((g) => {
      b.order = state.bondTool.order
      b.aromatic = state.bondTool.aromatic
      b.stereo = state.bondTool.stereo
      orientWedge(g, b)
    })
    selectBond(b.id)
  } else if (state.tool === 'erase') {
    pushUndo()
    mutate((g) => removeBond(g, b.id))
    clearSelection()
  }
  e.preventDefault()
}

function onCanvasPointerDown(e: PointerEvent): void {
  if (!state.ready) return
  if (state.tool === 'select') {
    clearSelection()
  } else if (state.tool === 'atom') {
    const p = toModel(e)
    pushUndo()
    mutate((g) => { addAtom(g, state.atomElement, p.x, p.y) })
  }
}

function onPointerMove(e: PointerEvent): void {
  const d = drag.value
  if (!d) return
  const p = toModel(e)
  if (d.kind === 'move') {
    const a = getAtom(state.graph, d.atomId)
    if (a) {
      if (!d.moved) pushUndo() // 首次真正移动时才记录撤销快照
      a.x = p.x
      a.y = p.y
      d.moved = true
    }
  } else {
    d.to = { x: p.x * SCALE, y: p.y * SCALE }
  }
}

function onPointerUp(e: PointerEvent): void {
  const d = drag.value
  drag.value = null
  detachWindowDrag()
  if (!d) return
  if (d.kind === 'move') {
    if (d.moved) revalidate() // 坐标变化可能影响 E/Z 感知
    return
  }
  // 完成键拖拽：落到已有原子 → 连接；落到空白 → 新建碳原子并连接；拖回起点 → 无事发生
  const p = toModel(e)
  const target = nearestAtom({ x: p.x * SCALE, y: p.y * SCALE }, 0.45)
  if (target && target.id === d.fromAtomId) return
  pushUndo()
  mutate((g) => {
    let endId: number
    if (target) {
      endId = target.id
    } else {
      endId = addAtom(g, 'C', p.x, p.y).id
    }
    const t = state.bondTool
    const existing = findBond(g, d.fromAtomId, endId)
    if (existing) {
      existing.order = t.order
      existing.aromatic = t.aromatic
      existing.stereo = t.stereo
      orientWedge(g, existing)
    } else {
      const nb = addBond(g, d.fromAtomId, endId, t.order, t.aromatic, t.stereo)
      if (nb) orientWedge(g, nb)
    }
  })
}

function attachWindowDrag(): void {
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp, { once: true })
}
function detachWindowDrag(): void {
  window.removeEventListener('pointermove', onPointerMove)
}

const cursorClass = computed(() => `tool-${state.tool}`)
</script>

<template>
  <div class="canvas-wrap">
    <svg
      ref="svgEl"
      :viewBox="viewBox"
      class="mol-canvas"
      :class="cursorClass"
      @pointerdown="onCanvasPointerDown"
    >
      <!-- 键 -->
      <g v-for="(b) in state.graph.bonds" :key="b.id">
        <line
          v-if="state.selectedBondId === b.id"
          :x1="bondEnds(b)[0].x" :y1="bondEnds(b)[0].y"
          :x2="bondEnds(b)[1].x" :y2="bondEnds(b)[1].y"
          class="bond-selected"
        />
        <template v-if="b.stereo === 1">
          <polygon :points="wedgePoints(b)" class="bond-wedge" />
        </template>
        <template v-else-if="b.stereo === 6">
          <line
            v-for="(t, i) in hashTicks(b)" :key="i"
            :x1="t.x1" :y1="t.y1" :x2="t.x2" :y2="t.y2" class="bond-line"
          />
        </template>
        <template v-else>
          <line
            v-for="(l, i) in bondLines(b)" :key="i"
            :x1="l.x1" :y1="l.y1" :x2="l.x2" :y2="l.y2"
            class="bond-line" :class="{ dashed: l.dashed || b.stereo === 4 }"
          />
        </template>
        <!-- 点击热区 -->
        <line
          :x1="bondEnds(b)[0].x" :y1="bondEnds(b)[0].y"
          :x2="bondEnds(b)[1].x" :y2="bondEnds(b)[1].y"
          class="bond-hit"
          @pointerdown.stop="onBondPointerDown(b, $event)"
        />
      </g>

      <!-- 原子 -->
      <g v-for="(a, i) in state.graph.atoms" :key="a.id">
        <circle
          v-if="state.selectedAtomId === a.id"
          :cx="a.x * SCALE" :cy="a.y * SCALE" r="17" class="atom-selected"
        />
        <text
          v-if="showLabel(a)"
          :x="a.x * SCALE" :y="a.y * SCALE"
          class="atom-label" text-anchor="middle" dominant-baseline="central"
        >
          <tspan
            v-for="(p, k) in labelParts(a, i)" :key="k"
            :class="`lbl-${p.cls}`"
            :baseline-shift="p.cls === 'base' ? undefined : p.cls === 'super' ? 'super' : 'sub'"
          >{{ p.text }}</tspan>
        </text>
        <circle
          :cx="a.x * SCALE" :cy="a.y * SCALE" r="15"
          class="atom-hit"
          @pointerdown.stop="onAtomPointerDown(a, $event)"
        />
      </g>

      <!-- CIP 立体标注 -->
      <text
        v-for="s in stereoAnnotations" :key="s.key"
        :x="s.x" :y="s.y" class="stereo-tag" text-anchor="middle"
      >{{ s.text }}</text>

      <!-- 键拖拽预览 -->
      <line
        v-if="dragPreview"
        :x1="dragPreview.x1" :y1="dragPreview.y1"
        :x2="dragPreview.x2" :y2="dragPreview.y2"
        class="bond-preview"
      />

      <!-- 空画布提示 -->
      <text v-if="state.graph.atoms.length === 0" x="320" y="200" text-anchor="middle" class="empty-hint">
        从左侧导入 SMILES，或选择「原子」工具后在空白处点击添加原子
      </text>
    </svg>
  </div>
</template>

<style scoped>
.canvas-wrap {
  border: 1px solid #d0d7de;
  border-radius: 8px;
  background: #fff;
  min-height: 320px;
  display: flex;
}
.mol-canvas { width: 100%; height: 100%; min-height: 320px; touch-action: none; }
.mol-canvas.tool-erase { cursor: not-allowed; }
.mol-canvas.tool-atom, .mol-canvas.tool-bond { cursor: crosshair; }

.bond-line { stroke: #1f2328; stroke-width: 2.2; stroke-linecap: round; }
.bond-line.dashed { stroke-dasharray: 5 4; stroke-width: 1.6; }
.bond-wedge { fill: #1f2328; }
.bond-selected { stroke: #54aeff; stroke-width: 9; stroke-linecap: round; opacity: 0.5; }
.bond-hit { stroke: transparent; stroke-width: 16; pointer-events: stroke; }
.bond-hit:hover { stroke: #54aeff33; }
.bond-preview { stroke: #8c959f; stroke-width: 2; stroke-dasharray: 6 4; }

.atom-hit { fill: transparent; }
.atom-hit:hover { fill: #54aeff22; stroke: #54aeff66; }
.atom-selected { fill: none; stroke: #54aeff; stroke-width: 2; }
.atom-label { font-size: 15px; font-weight: 600; fill: #1f2328; pointer-events: none; user-select: none; }
.lbl-super { font-size: 10.5px; }
.lbl-sub { font-size: 10.5px; }
.stereo-tag { font-size: 12px; fill: #0969da; font-weight: 600; pointer-events: none; }
.empty-hint { fill: #8c959f; font-size: 15px; }
</style>
