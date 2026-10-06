<script setup lang="ts">
/**
 * 选中项属性面板：编辑原子（元素/电荷/同位素）与键（键级/芳香/立体）。
 * 所有修改经 mutate → RDKit 校验；隐式氢数随校验结果实时更新。
 */
import { computed } from 'vue'
import { COMMON_ELEMENTS, COMMON_ISOTOPES, getAtom, orientWedge } from '../chem/model'
import { state, mutate, pushUndo } from '../store/editorStore'

const selectedAtom = computed(() =>
  state.selectedAtomId != null ? getAtom(state.graph, state.selectedAtomId) : undefined,
)
const selectedBond = computed(() =>
  state.selectedBondId != null ? state.graph.bonds.find((b) => b.id === state.selectedBondId) : undefined,
)

const atomIndex = computed(() =>
  selectedAtom.value ? state.graph.atoms.findIndex((a) => a.id === selectedAtom.value!.id) : -1,
)
const implicitH = computed(() =>
  atomIndex.value >= 0 ? state.analysis?.impHs[atomIndex.value] ?? '—' : '—',
)

const isotopeOptions = computed(() => {
  if (!selectedAtom.value) return []
  return COMMON_ISOTOPES[selectedAtom.value.elem] ?? []
})

function setElem(elem: string): void {
  if (!selectedAtom.value) return
  pushUndo()
  mutate((g) => { getAtom(g, selectedAtom.value!.id)!.elem = elem })
}
function setCharge(ev: Event): void {
  if (!selectedAtom.value) return
  pushUndo()
  const v = parseInt((ev.target as HTMLSelectElement).value, 10)
  mutate((g) => { getAtom(g, selectedAtom.value!.id)!.charge = v })
}
function setIsotope(ev: Event): void {
  if (!selectedAtom.value) return
  pushUndo()
  const v = parseInt((ev.target as HTMLSelectElement).value, 10)
  mutate((g) => { getAtom(g, selectedAtom.value!.id)!.isotope = v })
}

function setBondProp(patch: Partial<{ order: 1 | 2 | 3; aromatic: boolean; stereo: 0 | 1 | 4 | 6 }>): void {
  if (!selectedBond.value) return
  pushUndo()
  mutate((g) => {
    Object.assign(selectedBond.value!, patch)
    orientWedge(g, selectedBond.value!)
  })
}

/** 反转构型：楔形 ↔ 虚线楔（上/下对调），得到对映体 */
function invertConfig(): void {
  if (!selectedBond.value) return
  pushUndo()
  mutate(() => {
    const b = selectedBond.value!
    if (b.stereo === 1) b.stereo = 6
    else if (b.stereo === 6) b.stereo = 1
  })
}
</script>

<template>
  <div class="panel">
    <h3>选中项</h3>

    <div v-if="selectedAtom" class="section">
      <div class="row">
        <label>元素</label>
        <select :value="selectedAtom.elem" @change="setElem(($event.target as HTMLSelectElement).value)">
          <option v-for="el in COMMON_ELEMENTS" :key="el" :value="el">{{ el }}</option>
        </select>
      </div>
      <div class="row">
        <label>形式电荷</label>
        <select :value="selectedAtom.charge" @change="setCharge">
          <option v-for="c in [-3, -2, -1, 0, 1, 2, 3]" :key="c" :value="c">
            {{ c > 0 ? '+' + c : c }}
          </option>
        </select>
      </div>
      <div class="row">
        <label>同位素</label>
        <select :value="selectedAtom.isotope" @change="setIsotope">
          <option :value="0">天然（不标注）</option>
          <option v-for="iso in isotopeOptions" :key="iso" :value="iso">{{ iso }}</option>
        </select>
      </div>
      <div class="row">
        <label>隐式氢</label>
        <span class="mono">{{ implicitH }}</span>
        <span class="hint">由 RDKit 价态模型决定</span>
      </div>
    </div>

    <div v-else-if="selectedBond" class="section">
      <div class="row">
        <label>键级</label>
        <div class="btn-group">
          <button :class="{ active: !selectedBond.aromatic && selectedBond.order === 1 }" @click="setBondProp({ order: 1, aromatic: false })">单</button>
          <button :class="{ active: !selectedBond.aromatic && selectedBond.order === 2 }" @click="setBondProp({ order: 2, aromatic: false })">双</button>
          <button :class="{ active: !selectedBond.aromatic && selectedBond.order === 3 }" @click="setBondProp({ order: 3, aromatic: false })">三</button>
          <button :class="{ active: selectedBond.aromatic }" @click="setBondProp({ order: 1, aromatic: true })">芳香</button>
        </div>
      </div>
      <div class="row">
        <label>立体</label>
        <div class="btn-group">
          <button :class="{ active: selectedBond.stereo === 0 }" @click="setBondProp({ stereo: 0 })">无</button>
          <button :class="{ active: selectedBond.stereo === 1 }" @click="setBondProp({ stereo: 1 })">楔形</button>
          <button :class="{ active: selectedBond.stereo === 6 }" @click="setBondProp({ stereo: 6 })">虚线楔</button>
          <button :class="{ active: selectedBond.stereo === 4 }" @click="setBondProp({ stereo: 4 })">波浪</button>
        </div>
      </div>
      <div class="row" v-if="selectedBond.stereo === 1 || selectedBond.stereo === 6">
        <label>构型</label>
        <button @click="invertConfig">反转构型（上/下对调）</button>
      </div>
      <p class="hint">
        {{ selectedBond.aromatic
          ? '芳香键参与 RDKit 芳香性判定（写入 molfile type 4）'
          : selectedBond.stereo !== 0
            ? '楔形/虚线楔会被 RDKit 解析为手性标记'
            : '普通键：单/双/三键写入分子图键级' }}
      </p>
    </div>

    <p v-else class="hint">点击画布中的原子或键查看/编辑属性。</p>
  </div>
</template>

<style scoped>
.panel { border: 1px solid #d0d7de; border-radius: 8px; padding: 10px 12px; background: #fff; }
h3 { margin: 0 0 8px; font-size: 14px; color: #57606a; }
.section { display: flex; flex-direction: column; gap: 8px; }
.row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.row label { width: 64px; font-size: 13px; color: #57606a; }
.mono { font-family: ui-monospace, monospace; }
.hint { font-size: 12px; color: #8c959f; margin: 0; }
.btn-group { display: flex; gap: 4px; flex-wrap: wrap; }
.btn-group button { padding: 3px 10px; border: 1px solid #d0d7de; background: #f6f8fa; border-radius: 6px; cursor: pointer; font-size: 13px; }
.btn-group button.active { background: #0969da; color: #fff; border-color: #0969da; }
select { padding: 3px 6px; border: 1px solid #d0d7de; border-radius: 6px; }
button { padding: 3px 10px; border: 1px solid #d0d7de; background: #f6f8fa; border-radius: 6px; cursor: pointer; font-size: 13px; }
</style>
