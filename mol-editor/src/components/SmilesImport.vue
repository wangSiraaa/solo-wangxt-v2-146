<script setup lang="ts">
/**
 * SMILES 导入：显示原始输入与规范形式的对照；
 * 解析失败时定位错误字符并保留草稿，不做任何近似替换。
 */
import { computed } from 'vue'
import { state, importFromInput, newMolecule } from '../store/editorStore'

const errorSegments = computed(() => {
  const err = state.importError
  if (!err || err.position < 0) return null
  const s = state.rawInput
  const pos = Math.min(err.position, s.length - 1)
  return { before: s.slice(0, pos), bad: s[pos] ?? '', after: s.slice(pos + 1) }
})

const canonical = computed(() => state.analysis?.canonicalSmiles ?? '')
const sameAsInput = computed(
  () => canonical.value !== '' && canonical.value === state.importedRaw,
)

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Enter') importFromInput()
}
</script>

<template>
  <div class="panel">
    <h3>SMILES 导入</h3>
    <div class="input-row">
      <input
        v-model="state.rawInput"
        type="text"
        class="mono"
        placeholder="例如 CCO、c1ccccc1、C[C@H](O)C(=O)O"
        :disabled="!state.ready"
        @keydown="onKeydown"
      />
      <button :disabled="!state.ready || !state.rawInput.trim()" @click="importFromInput">导入</button>
      <button @click="newMolecule">清空</button>
    </div>

    <div v-if="state.importError" class="error-box">
      <div>解析失败：{{ state.importError.message }}</div>
      <div v-if="errorSegments" class="mono error-loc">
        {{ errorSegments.before }}<mark>{{ errorSegments.bad }}</mark>{{ errorSegments.after }}
      </div>
      <div class="hint">草稿已保留，可直接修改后重新导入；不会用近似分子替代。</div>
    </div>

    <div v-if="state.importedRaw && !state.importError" class="compare-box">
      <div class="line"><span class="tag">原始输入</span><span class="mono">{{ state.importedRaw }}</span></div>
      <div class="line">
        <span class="tag">规范形式</span>
        <span class="mono">{{ canonical || '—' }}</span>
        <span v-if="sameAsInput" class="ok">一致</span>
        <span v-else-if="canonical" class="note">已规范化</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.panel { border: 1px solid #d0d7de; border-radius: 8px; padding: 10px 12px; background: #fff; }
h3 { margin: 0 0 8px; font-size: 14px; color: #57606a; }
.input-row { display: flex; gap: 6px; }
.input-row input { flex: 1; padding: 6px 8px; border: 1px solid #d0d7de; border-radius: 6px; }
.mono { font-family: ui-monospace, SFMono-Regular, monospace; font-size: 13px; }
button { padding: 5px 12px; border: 1px solid #d0d7de; background: #f6f8fa; border-radius: 6px; cursor: pointer; }
button:disabled { opacity: 0.5; cursor: default; }
.error-box { margin-top: 8px; padding: 8px; border: 1px solid #ffb3ad; background: #fff1f0; border-radius: 6px; font-size: 13px; color: #cf222e; }
.error-loc { margin-top: 4px; background: #fff; padding: 4px 6px; border-radius: 4px; word-break: break-all; }
.error-loc mark { background: #ffd33d; color: #cf222e; font-weight: 700; padding: 0 1px; }
.hint { font-size: 12px; color: #8c959f; margin-top: 4px; }
.compare-box { margin-top: 8px; display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
.line { display: flex; align-items: center; gap: 8px; }
.tag { flex: none; width: 64px; font-size: 12px; color: #57606a; }
.ok { color: #1a7f37; font-size: 12px; }
.note { color: #9a6700; font-size: 12px; }
</style>
