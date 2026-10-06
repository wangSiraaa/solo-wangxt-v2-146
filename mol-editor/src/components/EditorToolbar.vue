<script setup lang="ts">
/**
 * 编辑器工具栏：选择 / 键类型 / 原子元素 / 删除，以及撤销重做。
 */
import { COMMON_ELEMENTS } from '../chem/model'
import { state, BOND_TOOLS, undo, redo, deleteSelected } from '../store/editorStore'

function pickBondTool(i: number): void {
  state.bondTool = BOND_TOOLS[i]
  state.tool = 'bond'
}

function isBondToolActive(i: number): boolean {
  return state.tool === 'bond' && state.bondTool === BOND_TOOLS[i]
}
</script>

<template>
  <div class="toolbar">
    <div class="group">
      <button :class="{ active: state.tool === 'select' }" @click="state.tool = 'select'">选择/移动</button>
    </div>
    <div class="group">
      <button
        v-for="(t, i) in BOND_TOOLS" :key="t.label"
        :class="{ active: isBondToolActive(i) }"
        @click="pickBondTool(i)"
      >{{ t.label }}</button>
    </div>
    <div class="group">
      <button :class="{ active: state.tool === 'atom' }" @click="state.tool = 'atom'">原子</button>
      <select v-model="state.atomElement" @click.stop>
        <option v-for="el in COMMON_ELEMENTS" :key="el" :value="el">{{ el }}</option>
      </select>
    </div>
    <div class="group">
      <button :class="{ active: state.tool === 'erase' }" @click="state.tool = 'erase'">删除</button>
      <button :disabled="state.selectedAtomId == null && state.selectedBondId == null" @click="deleteSelected">
        删除选中
      </button>
    </div>
    <div class="group">
      <button @click="undo">撤销</button>
      <button @click="redo">重做</button>
    </div>
  </div>
</template>

<style scoped>
.toolbar { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; padding: 6px 8px; border: 1px solid #d0d7de; border-radius: 8px; background: #f6f8fa; }
.group { display: flex; gap: 4px; align-items: center; }
.group + .group { border-left: 1px solid #d0d7de; padding-left: 12px; }
button { padding: 4px 10px; border: 1px solid #d0d7de; background: #fff; border-radius: 6px; cursor: pointer; font-size: 13px; }
button.active { background: #0969da; color: #fff; border-color: #0969da; }
button:disabled { opacity: 0.5; cursor: default; }
select { padding: 3px 6px; border: 1px solid #d0d7de; border-radius: 6px; }
</style>
