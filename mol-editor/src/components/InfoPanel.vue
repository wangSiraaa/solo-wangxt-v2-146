<script setup lang="ts">
// 结构性质面板：分子式、相对分子质量、TPSA、立体中心等 RDKit 描述符（仅表示与性质检查）。
import { computed } from 'vue';
import { useEditor } from '../stores/editor';

const { state, toggleImplicitH } = useEditor();
const v = computed(() => state.validation);

const rows = computed(() => {
  const d = v.value?.descriptors;
  if (!d) return [];
  return [
    { k: '相对分子质量', val: fmt(d.amw), hint: '平均原子量' },
    { k: '精确质量', val: fmt(d.exactmw), hint: '按最丰同位素' },
    { k: '分子式', val: v.value?.formula ?? '—', hint: 'Hill 记法' },
    { k: '重原子数', val: d.NumHeavyAtoms, hint: '' },
    { k: '可旋转键', val: d.NumRotatableBonds, hint: '' },
    { k: 'TPSA 极性表面积', val: fmt(d.tpsa), hint: 'Å²' },
    { k: '氢键供体 / 受体', val: `${d.NumHBD} / ${d.NumHBA}`, hint: '' },
    { k: '芳香环数', val: d.NumAromaticRings, hint: '' },
    { k: '环总数', val: d.NumRings, hint: '' },
    { k: '手性中心（已指定 / 总）', val: `${(d.NumAtomStereoCenters ?? 0) - (d.NumUnspecifiedAtomStereoCenters ?? 0)} / ${d.NumAtomStereoCenters ?? 0}`, hint: '楔键指定四面体构型' },
    { k: 'logP（Crippen 估算）', val: fmt(d.CrippenClogP), hint: '教学估算值' },
  ];
});

function fmt(x: number | undefined): string {
  if (typeof x !== 'number' || !Number.isFinite(x)) return '—';
  return String(Math.round(x * 1000) / 1000);
}
</script>

<template>
  <section class="panel">
    <div class="head">
      <h2>结构与性质</h2>
      <label class="switch"><input type="checkbox" :checked="state.showImplicitH" @change="toggleImplicitH" /> 显示隐式 H</label>
    </div>

    <div v-if="v?.ok" class="status ok">
      ✓ RDKit 价态与规范化校验通过
    </div>
    <div v-else-if="v" class="status bad">
      ✗ 当前编辑未通过校验（修改与草稿均已保留，可撤销）
    </div>
    <div v-else class="status idle">尚未导入结构</div>

    <table v-if="v?.ok">
      <tbody>
        <tr v-for="r in rows" :key="r.k">
          <td class="k">{{ r.k }}</td>
          <td class="val">{{ r.val }}</td>
          <td class="hint">{{ r.hint }}</td>
        </tr>
      </tbody>
    </table>
    <p class="disclaimer">
      以上均为分子表示与基础理化性质的只读检查，本工具不提供合成路线或实验操作指导。
    </p>
  </section>
</template>

<style scoped>
.panel { background: #fff; border: 1px solid #e3e0d8; border-radius: 10px; padding: 14px; }
.head { display: flex; justify-content: space-between; align-items: center; }
h2 { margin: 0; font-size: 15px; }
.switch { font-size: 12px; color: #6b655a; display: flex; gap: 4px; align-items: center; }
.status { font-size: 13px; padding: 8px 10px; border-radius: 6px; margin: 10px 0; }
.status.ok { background: #ecf7ee; color: #1e6b32; border: 1px solid #bfe3c6; }
.status.bad { background: #fef2f2; color: #8f1d1d; border: 1px solid #f3b9b9; }
.status.idle { background: #f6f4ee; color: #8a857a; border: 1px solid #e6e2d6; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
td { padding: 5px 4px; border-bottom: 1px solid #f0ede4; }
.k { color: #555; }
.val { font-weight: 700; font-family: ui-monospace, Menlo, monospace; text-align: right; white-space: nowrap; }
.hint { color: #9a9488; font-size: 11px; width: 110px; padding-left: 8px; }
.disclaimer { font-size: 11px; color: #a29c8e; margin: 10px 0 0; line-height: 1.5; }
</style>
