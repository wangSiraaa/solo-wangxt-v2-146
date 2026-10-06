<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import Toolbar from './components/Toolbar.vue';
import ImportPanel from './components/ImportPanel.vue';
import StructureCanvas from './components/StructureCanvas.vue';
import InspectorPanel from './components/InspectorPanel.vue';
import InfoPanel from './components/InfoPanel.vue';
import ExamplesView from './components/ExamplesView.vue';
import { useEditor } from './stores/editor';
import { listProjects } from './lib/db';
import type { Project } from './editor/types';

const { state, init, importSmiles, undo, redo, deleteSelection, renameProject, loadSaved } = useEditor();
const tab = ref<'edit' | 'compare' | 'saved'>('edit');
const saved = ref<Project[]>([]);
const loadErr = ref('');

onMounted(async () => {
  await init();
  // 默认载入一个教学分子
  if (!state.graph) importSmiles('CCO');
  window.addEventListener('keydown', onKey);
});
onUnmounted(() => window.removeEventListener('keydown', onKey));

function onKey(e: KeyboardEvent) {
  if (tab.value !== 'edit') return;
  const tag = (e.target as HTMLElement)?.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    e.shiftKey ? redo() : undo();
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
    e.preventDefault();
    redo();
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    deleteSelection();
  }
}

async function refreshSaved() {
  saved.value = await listProjects();
}
async function openSaved(p: Project) {
  await loadSaved(p.id);
  tab.value = 'edit';
}
</script>

<template>
  <div class="app">
    <Toolbar />
    <nav class="tabs">
      <button :class="{ on: tab === 'edit' }" @click="tab = 'edit'">结构编辑</button>
      <button :class="{ on: tab === 'compare' }" @click="tab = 'compare'">构造 / 立体异构比较</button>
      <button :class="{ on: tab === 'saved' }" @click="refreshSaved(); tab = 'saved'">已保存工程</button>
    </nav>

    <main v-if="!state.ready" class="loading">正在从本地加载 RDKit（WebAssembly），无需联网与后端…</main>

    <main v-else-if="tab === 'edit'" class="layout">
      <div class="left">
        <ImportPanel />
        <InspectorPanel />
        <InfoPanel />
      </div>
      <div class="center">
        <div class="canvas-head">
          <input class="proj-name" :value="state.projectName" @change="renameProject(($event.target as HTMLInputElement).value)" />
          <div class="hint">
            空白处双击放置原子 · 切到“连键”后从原子拖出 · 点键改型（单/双/三/芳香），单键可设楔键
            · 拖动原子双键几何会被重新感知
          </div>
        </div>
        <div class="canvas-wrap">
          <StructureCanvas />
        </div>
        <div v-if="state.validation && !state.validation.ok" class="error-strip">
          {{ state.validation.error?.message }}
        </div>
      </div>
    </main>

    <main v-else-if="tab === 'compare'" class="compare-wrap">
      <ExamplesView @open-in-editor="(s) => { importSmiles(s); tab = 'edit'; }" />
    </main>

    <main v-else class="saved-wrap">
      <section class="panel">
        <h2>IndexedDB 中的工程</h2>
        <p v-if="!saved.length" class="muted">还没有保存的工程。在工具栏点“存到浏览器”后会出现在这里。</p>
        <ul class="saved-list">
          <li v-for="p in saved" :key="p.id">
            <div>
              <strong>{{ p.name }}</strong>
              <small>{{ new Date(p.savedAt).toLocaleString() }} · 原子 {{ p.graph?.atoms.length ?? 0 }} · 键 {{ p.graph?.bonds.length ?? 0 }}</small>
            </div>
            <div class="raw-preview" v-if="p.rawInput">原始输入草稿：<code>{{ p.rawInput }}</code></div>
            <button class="btn" @click="openSaved(p)">打开</button>
          </li>
        </ul>
      </section>
    </main>

    <footer class="foot">
      教学用途：仅做分子表示与基础性质检查，不生成合成路线、反应条件或实验操作指导。所有数据保存在本地浏览器 IndexedDB。
    </footer>
  </div>
</template>

<style scoped>
.app { display: flex; flex-direction: column; min-height: 100vh; }
.tabs { display: flex; gap: 4px; background: #edeae2; padding: 6px 14px 0; border-bottom: 1px solid #d8d3c6; }
.tabs button { border: 1px solid transparent; border-bottom: none; background: transparent; padding: 8px 16px; border-radius: 8px 8px 0 0; cursor: pointer; font-size: 13px; color: #5f5a4f; }
.tabs button.on { background: #f7f6f2; border-color: #d8d3c6; color: #c2410c; font-weight: 700; }
.loading { padding: 60px; text-align: center; color: #8a857a; }
.layout { display: grid; grid-template-columns: 360px 1fr; gap: 14px; padding: 14px; flex: 1; align-items: start; }
.left { display: flex; flex-direction: column; gap: 12px; max-height: calc(100vh - 120px); overflow-y: auto; padding-right: 4px; }
.center { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.canvas-head { display: flex; align-items: center; gap: 12px; }
.proj-name { border: 1px solid #d8d3c6; border-radius: 6px; padding: 6px 10px; font-size: 14px; width: 200px; background: #fff; }
.hint { font-size: 12px; color: #8a857a; }
.canvas-wrap { border: 1px solid #d8d3c6; border-radius: 10px; overflow: hidden; height: calc(100vh - 210px); min-height: 420px; }
.error-strip { background: #fef2f2; border: 1px solid #f3b9b9; color: #8f1d1d; font-size: 13px; padding: 8px 12px; border-radius: 8px; }
.compare-wrap, .saved-wrap { padding: 14px; }
.saved-list { list-style: none; padding: 0; margin: 10px 0 0; display: flex; flex-direction: column; gap: 8px; }
.saved-list li { border: 1px solid #e3e0d8; border-radius: 8px; padding: 10px 12px; display: flex; align-items: center; gap: 12px; background: #fdfcf9; }
.saved-list small { display: block; color: #8a857a; font-size: 11px; }
.raw-preview { flex: 1; font-size: 12px; color: #6b655a; }
.btn { border: 1px solid #b8b2a4; background: #f6f4ee; border-radius: 6px; padding: 6px 12px; cursor: pointer; }
.muted { color: #8a857a; }
.foot { background: #22303c; color: #93a1ad; font-size: 11px; padding: 8px 16px; text-align: center; }
</style>
