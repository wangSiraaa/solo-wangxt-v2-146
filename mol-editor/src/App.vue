<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { state, bootRDKit, undo, redo, deleteSelected } from './store/editorStore'
import SmilesImport from './components/SmilesImport.vue'
import ExamplesBar from './components/ExamplesBar.vue'
import EditorToolbar from './components/EditorToolbar.vue'
import StructureEditor from './components/StructureEditor.vue'
import SelectionPanel from './components/SelectionPanel.vue'
import ValidationPanel from './components/ValidationPanel.vue'
import ComparePanel from './components/ComparePanel.vue'
import ProjectsPanel from './components/ProjectsPanel.vue'

const tab = ref<'editor' | 'compare' | 'projects'>('editor')

function onKeydown(e: KeyboardEvent): void {
  const target = e.target as HTMLElement
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
  if (tab.value !== 'editor') return
  if (e.key === 'Delete' || e.key === 'Backspace') {
    deleteSelected()
    e.preventDefault()
  } else if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    undo()
    e.preventDefault()
  } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
    redo()
    e.preventDefault()
  }
}

onMounted(() => {
  bootRDKit()
  window.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="app">
    <header>
      <h1>分子结构编辑器（教学版）</h1>
      <p class="sub">
        本地运行，无后端 · RDKit.js 负责解析 / 价态 / 规范化 · 工程保存在浏览器 IndexedDB
      </p>
    </header>

    <div v-if="state.initError" class="fatal">{{ state.initError }}</div>
    <div v-else-if="!state.ready" class="loading">正在加载 RDKit(wasm)…</div>

    <nav class="tabs">
      <button :class="{ active: tab === 'editor' }" @click="tab = 'editor'">结构编辑</button>
      <button :class="{ active: tab === 'compare' }" @click="tab = 'compare'">异构体比较</button>
      <button :class="{ active: tab === 'projects' }" @click="tab = 'projects'">我的工程</button>
    </nav>

    <main v-show="tab === 'editor'" class="editor-layout">
      <aside class="left">
        <SmilesImport />
        <ExamplesBar />
      </aside>
      <section class="center">
        <EditorToolbar />
        <StructureEditor />
      </section>
      <aside class="right">
        <ValidationPanel />
        <SelectionPanel />
      </aside>
    </main>

    <main v-if="tab === 'compare'" class="page">
      <ComparePanel />
    </main>

    <main v-if="tab === 'projects'" class="page">
      <ProjectsPanel />
    </main>

    <footer>
      示例分子均为常见无害教学分子，仅用于结构表示与基本性质观察；本工具不提供合成或实验指导。
    </footer>
  </div>
</template>

<style>
* { box-sizing: border-box; }
body { margin: 0; font-family: -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif; background: #f6f8fa; color: #1f2328; }
.app { max-width: 1280px; margin: 0 auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; min-height: 100vh; }
header h1 { margin: 0; font-size: 20px; }
header .sub { margin: 4px 0 0; font-size: 13px; color: #57606a; }
.loading, .fatal { padding: 10px 14px; border-radius: 8px; font-size: 14px; }
.loading { background: #ddf4ff; color: #0969da; }
.fatal { background: #fff1f0; color: #cf222e; }
.tabs { display: flex; gap: 4px; border-bottom: 1px solid #d0d7de; }
.tabs button { padding: 8px 16px; border: none; background: none; cursor: pointer; font-size: 14px; border-bottom: 2px solid transparent; }
.tabs button.active { border-bottom-color: #0969da; color: #0969da; font-weight: 600; }
.editor-layout { display: grid; grid-template-columns: 300px 1fr 320px; gap: 12px; align-items: start; }
@media (max-width: 1100px) { .editor-layout { grid-template-columns: 1fr; } }
.left, .right { display: flex; flex-direction: column; gap: 12px; }
.center { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.page { display: flex; flex-direction: column; gap: 12px; }
footer { margin-top: auto; font-size: 12px; color: #8c959f; padding-top: 12px; border-top: 1px solid #eaeef2; }
</style>
