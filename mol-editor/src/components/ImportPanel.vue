<script setup lang="ts">
// SMILES 导入面板：原始输入与规范形式并排呈现；失败时定位错误并保留草稿。
import { computed, ref } from 'vue';
import { useEditor } from '../stores/editor';
import { SINGLE_EXAMPLES } from '../examples/index';

const { state, importSmiles } = useEditor();
const text = ref(state.rawInput || 'CCO');

const error = computed(() => (state.validation && !state.validation.ok ? state.validation.error : null));

// 将原始输入分成：正常 / 错误起点 / 未被接受后缀，用于定位高亮
const segments = computed(() => {
  const raw = text.value;
  const col = error.value?.column ?? -1;
  if (col < 0) return [{ t: raw, cls: '' }];
  return [
    { t: raw.slice(0, col), cls: 'ok-prefix' },
    { t: raw.slice(col), cls: 'bad-suffix' },
  ];
});

function doImport() {
  importSmiles(text.value);
}
</script>

<template>
  <section class="panel">
    <h2>从 SMILES 导入</h2>
    <div class="row">
      <input v-model="text" class="smiles-input" spellcheck="false" placeholder="例如：C[C@H](O)C(=O)O" @keydown.enter="doImport" />
      <button class="btn primary" @click="doImport">导入并规范化</button>
    </div>
    <div class="examples-line">
      <span class="muted">快速填入：</span>
      <button v-for="ex in SINGLE_EXAMPLES.slice(0, 6)" :key="ex.smiles" class="chip" :title="ex.note" @click="text = ex.smiles">
        {{ ex.label }}
      </button>
    </div>

    <div v-if="state.rawInput" class="compare">
      <div class="cmp-cell">
        <div class="cmp-label">原始输入（草稿，始终保留）</div>
        <code class="cmp-value raw">
          <span v-for="(s, i) in segments" :key="i" :class="s.cls">{{ s.t || ' ' }}</span>
        </code>
      </div>
      <div class="cmp-cell">
        <div class="cmp-label">RDKit 规范（异构）SMILES</div>
        <code class="cmp-value canon">
          <template v-if="state.validation?.ok">{{ state.validation.canonicalSmiles }}</template>
          <span v-else class="muted">— 当前结构未通过校验 —</span>
        </code>
      </div>
    </div>

    <div v-if="error" class="error-box">
      <strong>无法解析，未生成近似分子。</strong>
      <p>{{ error.message }}</p>
      <p v-if="error.column >= 0" class="hint">
        定位：第 {{ error.column + 1 }} 个字符附近（红色部分）。草稿已保留，可直接修改后重试。
      </p>
    </div>
  </section>
</template>

<style scoped>
.panel { background: #fff; border: 1px solid #e3e0d8; border-radius: 10px; padding: 14px; }
h2 { margin: 0 0 10px; font-size: 15px; color: #2b3440; }
.row { display: flex; gap: 8px; }
.smiles-input {
  flex: 1; min-width: 0; padding: 8px 10px; border: 1px solid #cfcabd; border-radius: 6px;
  font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 14px;
}
.smiles-input:focus { outline: 2px solid #c2410c33; border-color: #c2410c; }
.btn { border: 1px solid #b8b2a4; background: #f6f4ee; border-radius: 6px; padding: 8px 12px; cursor: pointer; font-size: 13px; }
.btn.primary { background: #c2410c; color: #fff; border-color: #c2410c; }
.examples-line { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 8px; }
.chip { border: 1px solid #d6d1c4; background: #fbfaf6; border-radius: 999px; padding: 2px 10px; font-size: 12px; cursor: pointer; }
.chip:hover { background: #fff3ea; border-color: #e0a070; }
.muted { color: #8a857a; }
.compare { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 12px; }
.cmp-label { font-size: 12px; color: #6b655a; margin-bottom: 3px; }
.cmp-value { display: block; padding: 8px 10px; border-radius: 6px; font-size: 13px; word-break: break-all; min-height: 2.2em; }
.cmp-value.raw { background: #f7f5ef; border: 1px solid #e6e2d6; }
.cmp-value.canon { background: #eef6ff; border: 1px solid #cfe0f2; color: #0b4a86; }
.ok-prefix { background: #e6f4e8; border-radius: 3px; }
.bad-suffix { background: #fde2e2; border-bottom: 2px wavy #dc2626; border-radius: 3px; }
.error-box { margin-top: 10px; background: #fef2f2; border: 1px solid #f3b9b9; border-radius: 8px; padding: 10px; color: #8f1d1d; font-size: 13px; }
.error-box p { margin: 4px 0 0; }
.hint { color: #a33; }
</style>
