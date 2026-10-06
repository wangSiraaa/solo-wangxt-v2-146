<script setup lang="ts">
/**
 * 示例分子栏：常见无害教学分子，点击载入编辑器。
 * 仅用于结构表示与基本性质观察。
 */
import { EXAMPLE_MOLECULES } from '../chem/examples'
import { state, importFromInput } from '../store/editorStore'

function load(smiles: string): void {
  state.rawInput = smiles
  importFromInput()
}
</script>

<template>
  <div class="panel">
    <h3>示例分子</h3>
    <div class="list">
      <button
        v-for="m in EXAMPLE_MOLECULES" :key="m.smiles"
        :title="m.smiles" :disabled="!state.ready"
        @click="load(m.smiles)"
      >
        {{ m.name }}<span v-if="m.note" class="note">（{{ m.note }}）</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.panel { border: 1px solid #d0d7de; border-radius: 8px; padding: 10px 12px; background: #fff; }
h3 { margin: 0 0 8px; font-size: 14px; color: #57606a; }
.list { display: flex; flex-wrap: wrap; gap: 4px; }
button { padding: 3px 8px; border: 1px solid #d0d7de; background: #f6f8fa; border-radius: 6px; cursor: pointer; font-size: 12px; }
button:disabled { opacity: 0.5; cursor: default; }
.note { color: #8c959f; }
</style>
