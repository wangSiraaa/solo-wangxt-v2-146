<script setup lang="ts">
// 选中原子/键的检查器：元素、电荷、同位素、显式氢；键型（含芳香/楔键）。
import { computed } from 'vue';
import { useEditor } from '../stores/editor';
import { ELEMENTS, NOMINAL_MASS } from '../editor/elements';
import { BOND_TYPE_LABEL, WEDGE_LABEL, type BondType, type Wedge } from '../editor/types';
import { atomIsAromatic } from '../editor/graphOps';

const { state, updateAtom, setBondType, setBondWedge, flipBond, deleteSelection } = useEditor();

const atom = computed(() => state.graph?.atoms.find((a) => a.id === state.selectedAtomId) ?? null);
const bond = computed(() => state.graph?.bonds.find((b) => b.id === state.selectedBondId) ?? null);

const elementInfo = computed(() => (atom.value ? ELEMENTS.find((e) => e.symbol === atom.value!.element || (atom.value!.element === 'D' && e.symbol === 'H')) : null));

const bondTypes: BondType[] = ['single', 'double', 'triple', 'aromatic'];
const wedges: Wedge[] = ['', 'up', 'down'];

function setCharge(delta: number) {
  if (!atom.value) return;
  const next = Math.max(-3, Math.min(3, atom.value.charge + delta));
  updateAtom(atom.value.id, { charge: next });
}
function setIsotope(iso: number) {
  if (!atom.value) return;
  updateAtom(atom.value.id, { isotope: Number(iso) });
}
function toggleNH() {
  if (!atom.value) return;
  updateAtom(atom.value.id, { explicitH: atom.value.explicitH > 0 ? 0 : 1 });
}

const bondAtomSymbols = computed(() => {
  if (!bond.value || !state.graph) return '';
  const a1 = state.graph.atoms.find((a) => a.id === bond.value!.begin)!;
  const a2 = state.graph.atoms.find((a) => a.id === bond.value!.end)!;
  return `${a1.element} — ${a2.element}`;
});

const aromaticAtom = computed(() => (atom.value && state.graph ? atomIsAromatic(state.graph, atom.value.id) : false));
</script>

<template>
  <section class="panel" v-if="atom || bond">
    <template v-if="atom">
      <h2>原子属性 <span class="tag">#{{ atom.id }}</span></h2>
      <div class="grid">
        <label>元素
          <select :value="atom.element === 'D' || atom.element === 'T' ? 'H' : atom.element" @change="updateAtom(atom.id, { element: ($event.target as HTMLSelectElement).value, explicitH: 0 })">
            <option v-for="el in ELEMENTS" :key="el.symbol" :value="el.symbol">{{ el.symbol }} · {{ el.name }}</option>
          </select>
        </label>

        <label>电荷
          <div class="stepper">
            <button class="step" @click="setCharge(-1)">−</button>
            <span class="charge-val">{{ atom.charge > 0 ? '+' + atom.charge : atom.charge }}</span>
            <button class="step" @click="setCharge(1)">+</button>
          </div>
        </label>

        <label>同位素质量数
          <select :value="atom.isotope || NOMINAL_MASS[atom.element] || 0" @change="setIsotope(Number(($event.target as HTMLSelectElement).value))">
            <option :value="0">默认（天然丰度）</option>
            <option v-for="iso in (elementInfo?.isotopes ?? [])" :key="iso" :value="iso">{{ iso }}</option>
          </select>
        </label>

        <label v-if="atom.element === 'N' && aromaticAtom" class="nh">
          芳香氢 [nH]
          <button class="btn small" :class="{ on: atom.explicitH > 0 }" @click="toggleNH">
            {{ atom.explicitH > 0 ? '已标记 [nH]' : '标记为 [nH]' }}
          </button>
        </label>
      </div>
      <p class="note" v-if="aromaticAtom && atom.element === 'N'">
        提示：五元芳环上贡献孤对电子的氮需要 [nH]（如吡咯）；六元环上的吡啶型氮不要勾选。
      </p>
    </template>

    <template v-if="bond">
      <h2>键属性 <span class="tag">{{ bondAtomSymbols }}</span></h2>
      <div class="bond-types">
        <button
          v-for="t in bondTypes" :key="t"
          class="btn type-btn"
          :class="{ on: bond.type === t }"
          @click="setBondType(bond.id, t)"
        >{{ BOND_TYPE_LABEL[t] }}</button>
      </div>
      <p class="note">芳香键是独立分子图语义（MDL 键型 4），不是画成虚线的单键；改键型会立即重新做价态校验。</p>

      <div v-if="bond.type === 'single'" class="wedge-row">
        <span class="wedge-label">立体（楔键）：</span>
        <button
          v-for="w in wedges" :key="w"
          class="btn small"
          :class="{ on: bond.wedge === w }"
          @click="setBondWedge(bond.id, w)"
        >{{ WEDGE_LABEL[w] }}</button>
        <button class="btn small ghost" @click="flipBond(bond.id)">交换宽窄端</button>
      </div>
      <p class="note" v-if="bond.type !== 'single'">楔键只对单键成立，已随键型切换清除立体标记。</p>
    </template>

    <button class="btn danger" @click="deleteSelection">删除选中</button>
  </section>
</template>

<style scoped>
.panel { background: #fff; border: 1px solid #e3e0d8; border-radius: 10px; padding: 14px; }
h2 { margin: 0 0 10px; font-size: 15px; display: flex; align-items: center; gap: 8px; }
.tag { font-size: 11px; background: #f0ece2; border-radius: 4px; padding: 1px 6px; color: #726b5c; font-weight: 500; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
label { font-size: 12px; color: #6b655a; display: flex; flex-direction: column; gap: 4px; }
select { padding: 6px 8px; border: 1px solid #cfcabd; border-radius: 6px; font-size: 13px; background: #fff; }
.stepper { display: flex; align-items: center; gap: 6px; }
.step { width: 30px; height: 30px; border: 1px solid #cfcabd; background: #f8f6f0; border-radius: 6px; cursor: pointer; font-size: 16px; }
.charge-val { min-width: 34px; text-align: center; font-weight: 700; color: #9f1239; }
.bond-types { display: flex; gap: 6px; flex-wrap: wrap; }
.btn { border: 1px solid #b8b2a4; background: #f6f4ee; border-radius: 6px; padding: 7px 10px; cursor: pointer; font-size: 13px; }
.btn.small { padding: 4px 9px; font-size: 12px; }
.btn.on { background: #c2410c; border-color: #c2410c; color: #fff; }
.btn.ghost { background: #fff; }
.btn.danger { margin-top: 12px; color: #b42318; border-color: #e3aaa4; background: #fdf3f2; }
.wedge-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 10px; }
.wedge-label { font-size: 12px; color: #6b655a; }
.note { font-size: 12px; color: #8a857a; margin: 8px 0 0; }
.nh { grid-column: 1 / -1; }
</style>
