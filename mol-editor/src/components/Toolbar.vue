<script setup lang="ts">
import { ref } from 'vue';
import { useEditor } from '../stores/editor';
import { downloadText, exportMolblock, exportProject, isMolblock, parseProject, readTextFile } from '../lib/files';
import { ELEMENTS } from '../editor/elements';
import type { BondType } from '../editor/types';

const {
  state,
  canUndo,
  canRedo,
  undo,
  redo,
  beginNewProject,
  setTool,
  setPendingElement,
  setPendingBondType,
  exportProject: getProject,
  importProject,
  importMolblock,
  importSmiles,
  persistNow,
} = useEditor();

const fileInput = ref<HTMLInputElement | null>(null);
const elements = ELEMENTS.filter((e) => e.symbol !== 'H');
const bondTypes: { t: BondType; label: string }[] = [
  { t: 'single', label: '单' },
  { t: 'double', label: '双' },
  { t: 'triple', label: '三' },
  { t: 'aromatic', label: '芳' },
];

async function onFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const text = await readTextFile(file);
  if (file.name.endsWith('.json') || text.trimStart().startsWith('{')) {
    try {
      importProject(parseProject(text));
    } catch (err) {
      alert('工程文件无法读取：' + (err as Error).message);
    }
  } else if (isMolblock(text)) {
    if (!importMolblock(text)) alert('MOL 文件导入后未通过 RDKit 校验，请检查文件内容。');
  } else {
    if (!importSmiles(text.trim())) alert('SMILES 无法解析，草稿已保留。');
  }
  input.value = '';
}

function saveMol() {
  if (!state.graph) return;
  downloadText(safeName(state.projectName) + '.mol', exportMolblock(state.graph, state.projectName), 'chemical/x-mdl-molfile');
}
function saveSmi() {
  if (!state.validation?.canonicalSmiles) return;
  downloadText(safeName(state.projectName) + '.smi', state.validation.canonicalSmiles + '\n');
}
function saveProjectFile() {
  const p = getProject();
  downloadText(safeName(state.projectName) + '.meproj.json', exportProject(p), 'application/json');
}
async function saveDb() {
  await persistNow();
}
function safeName(n: string) {
  return n.replace(/[\\/:*?"<>|\s]+/g, '_') || 'molecule';
}
</script>

<template>
  <header class="toolbar">
    <div class="brand">
      <span class="logo">⚛</span>
      <div>
        <strong>分子结构编辑器</strong>
        <small v-if="state.ready">RDKit {{ state.rdkitVersion }} · 纯本地运行</small>
        <small v-else>正在加载 RDKit…</small>
      </div>
    </div>

    <div class="group">
      <button class="tb" title="新建" @click="beginNewProject">新建</button>
      <button class="tb" :disabled="!canUndo" title="撤销 Ctrl+Z" @click="undo">↶ 撤销</button>
      <button class="tb" :disabled="!canRedo" title="重做 Ctrl+Y" @click="redo">↷ 重做</button>
    </div>

    <div class="group tool-group">
      <button class="tb" :class="{ on: state.tool === 'select' }" @click="setTool('select')">选择/拖动</button>
      <button class="tb" :class="{ on: state.tool === 'addBond' }" @click="setTool('addBond')">连键</button>
      <span class="sep" />
      <span class="mini-label">原子</span>
      <button
        v-for="el in elements.slice(0, 8)" :key="el.symbol"
        class="tb elem"
        :class="{ on: state.pendingElement === el.symbol }"
        @click="setPendingElement(el.symbol)"
      >{{ el.symbol }}</button>
      <span class="sep" />
      <span class="mini-label">新键</span>
      <button
        v-for="b in bondTypes" :key="b.t"
        class="tb"
        :class="{ on: state.pendingBondType === b.t }"
        @click="setPendingBondType(b.t)"
      >{{ b.label }}</button>
    </div>

    <div class="group spacer" />

    <div class="group">
      <button class="tb" :disabled="!state.graph" @click="saveDb">存到浏览器</button>
      <button class="tb" :disabled="!state.graph" @click="saveMol">导出 .mol</button>
      <button class="tb" :disabled="!state.validation?.ok" @click="saveSmi">导出 .smi</button>
      <button class="tb" :disabled="!state.graph" @click="saveProjectFile">导出工程</button>
      <button class="tb primary" @click="fileInput?.click()">导入 ▾</button>
      <input ref="fileInput" type="file" accept=".mol,.smi,.sma,.json,.txt" hidden @change="onFile" />
    </div>
  </header>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  background: #22303c;
  color: #eee;
  flex-wrap: wrap;
}
.brand { display: flex; align-items: center; gap: 10px; }
.brand strong { display: block; font-size: 15px; }
.brand small { font-size: 11px; color: #a8b3bd; }
.logo { font-size: 22px; }
.group { display: flex; align-items: center; gap: 4px; }
.group.spacer { flex: 1; }
.sep { width: 1px; height: 20px; background: #3c4a57; margin: 0 4px; }
.mini-label { font-size: 11px; color: #93a1ad; margin: 0 2px; }
.tb {
  border: 1px solid #3c4a57;
  background: #2c3b48;
  color: #e5e9ed;
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 12px;
  cursor: pointer;
}
.tb:hover:not(:disabled) { background: #364857; }
.tb.on { background: #c2410c; border-color: #c2410c; }
.tb.elem { font-weight: 700; min-width: 30px; }
.tb.primary { background: #0f518c; border-color: #0f518c; }
.tb:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
