<script setup lang="ts">
// 异构比较视图：把两个 SMILES 导入到两个只读结构槽，显示分子式与规范形式。
// 只做表示与性质比较，不做合成指导。
import { computed, ref } from 'vue';
import { EXAMPLE_GROUPS, type ExampleGroup } from '../examples/index';
import { graphFromSmiles } from '../editor/rdkit';
import { useEditor } from '../stores/editor';

interface Slot {
  raw: string;
  ok: boolean;
  canonical?: string;
  formula?: string;
  amw?: number;
  stereo?: string;
}

const activeId = ref(EXAMPLE_GROUPS[0].id);
const group = computed<ExampleGroup>(() => EXAMPLE_GROUPS.find((g) => g.id === activeId.value)!);

function analyze(smiles: string): Slot {
  const r = graphFromSmiles(smiles);
  if ('error' in r) return { raw: smiles, ok: false };
  const totalH = r.implicitH.reduce((a, b) => a + b, 0);
  // 从重原子 + 权威氢数构造 Hill 分子式（示例都是常见中性分子）
  const counts: Record<string, number> = {};
  for (const a of r.graph.atoms) counts[a.element] = (counts[a.element] ?? 0) + 1;
  counts.H = (counts.H ?? 0) + totalH;
  const order = ['C', 'H', ...Object.keys(counts).filter((e) => e !== 'C' && e !== 'H').sort()];
  const formula = order.filter((e) => counts[e]).map((e) => e + (counts[e] > 1 ? counts[e] : '')).join('');
  const d = r.descriptors;
  const spec = d.NumAtomStereoCenters ? `${(d.NumAtomStereoCenters - d.NumUnspecifiedAtomStereoCenters)}/${d.NumAtomStereoCenters} 个已指定手性中心` : '无手性中心';
  return {
    raw: smiles,
    ok: true,
    canonical: r.canonical,
    formula,
    amw: Math.round(d.amw * 100) / 100,
    stereo: spec,
  };
}

const slots = computed<[Slot, Slot]>(() => [
  analyze(group.value.items[0].smiles),
  analyze(group.value.items[1].smiles),
]);

// 直接借用画布编辑：将某个示例载入主编辑器
const { importSmiles } = useEditor();
const emit = defineEmits<{ (e: 'open-in-editor', smiles: string): void }>();
function openIn(s: string) {
  emit('open-in-editor', s);
}

const categoryLabel: Record<string, string> = {
  constitutional: '构造异构',
  stereo: '立体异构',
  isotope: '同位素',
  single: '单分子',
};
</script>

<template>
  <div class="examples">
    <div class="group-tabs">
      <button
        v-for="g in EXAMPLE_GROUPS" :key="g.id"
        class="tab"
        :class="{ on: g.id === activeId }"
        @click="activeId = g.id"
      >
        <span class="cat" :data-cat="g.category">{{ categoryLabel[g.category] }}</span>
        {{ g.title }}
      </button>
    </div>

    <p class="concept">{{ group.concept }}</p>

    <div class="pair">
      <div v-for="(s, i) in slots" :key="i" class="slot">
        <h3>{{ group.items[i].label }} <small>{{ group.items[i].note }}</small></h3>
        <div v-if="s.ok" class="detail">
          <div><span class="k">输入</span><code>{{ s.raw }}</code></div>
          <div><span class="k">规范式</span><code class="canon">{{ s.canonical }}</code></div>
          <div><span class="k">分子式</span><code>{{ s.formula }}</code></div>
          <div><span class="k">Mᵣ</span><code>{{ s.amw }}</code></div>
          <div><span class="k">立体</span><code>{{ s.stereo }}</code></div>
        </div>
        <div v-else class="fail">示例解析失败（不应出现）：{{ s.raw }}</div>
        <button class="btn" @click="openIn(group.items[i].smiles)">在编辑器中打开并允许改键</button>
      </div>
    </div>

    <p class="foot">
      观察要点：构造异构的规范 SMILES 与官能团不同；对映异构仅 @ / @@ 不同，E/Z 异构仅 / 与 \\ 不同——
      这些立体标记在“导出 mol / 工程文件 → 再导入”后必须保持一致。
    </p>
  </div>
</template>

<style scoped>
.examples { background: #fff; border: 1px solid #e3e0d8; border-radius: 10px; padding: 16px; }
.group-tabs { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
.tab { text-align: left; border: 1px solid #ddd8cb; background: #fbfaf6; border-radius: 8px; padding: 8px 10px; cursor: pointer; font-size: 13px; }
.tab.on { border-color: #c2410c; background: #fff6ef; }
.cat { display: inline-block; font-size: 10px; padding: 1px 6px; border-radius: 4px; margin-right: 8px; background: #e8e4d8; color: #6b655a; }
.cat[data-cat='stereo'] { background: #e3edfb; color: #1d4e89; }
.cat[data-cat='isotope'] { background: #f3e8d6; color: #8a5a16; }
.concept { background: #f7f5ef; border-left: 3px solid #c2410c; padding: 8px 12px; font-size: 13px; color: #4b463c; border-radius: 0 6px 6px 0; }
.pair { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 12px; }
.slot { border: 1px solid #e3e0d8; border-radius: 8px; padding: 12px; background: #fdfcf9; }
h3 { margin: 0 0 8px; font-size: 14px; }
h3 small { color: #8a857a; font-weight: 400; margin-left: 6px; }
.detail > div { display: flex; gap: 8px; margin: 5px 0; font-size: 12px; align-items: baseline; }
.k { color: #8a857a; width: 46px; flex: none; }
code { font-family: ui-monospace, Menlo, monospace; word-break: break-all; }
code.canon { color: #0b4a86; }
.btn { margin-top: 10px; border: 1px solid #b8b2a4; background: #f6f4ee; border-radius: 6px; padding: 6px 10px; cursor: pointer; font-size: 12px; }
.fail { color: #b42318; font-size: 12px; }
.foot { font-size: 12px; color: #8a857a; margin-top: 14px; line-height: 1.6; }
</style>
