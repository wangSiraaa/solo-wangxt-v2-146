<script setup lang="ts">
/**
 * 工程管理：保存/载入/删除，全部存于浏览器 IndexedDB，无后端。
 */
import { onMounted, ref } from 'vue'
import { state, loadGraph } from '../store/editorStore'
import { listProjects, saveProject, deleteProject, type Project } from '../db/idb'
import { molblockFromGraph, graphFromMolblock } from '../chem/molblock'

const projects = ref<Project[]>([])
const name = ref('')
const message = ref('')

async function refresh(): Promise<void> {
  try {
    projects.value = (await listProjects()).sort((a, b) => b.updatedAt - a.updatedAt)
  } catch (e) {
    message.value = `读取工程失败：${String(e)}`
  }
}

onMounted(refresh)

async function save(): Promise<void> {
  const n = name.value.trim() || `工程 ${new Date().toLocaleString()}`
  const p: Project = {
    name: n,
    updatedAt: Date.now(),
    draftSmiles: state.rawInput,
    molblock: molblockFromGraph(state.graph, { name: n }),
    canonicalSmiles: state.analysis?.canonicalSmiles ?? '',
  }
  await saveProject(p)
  name.value = ''
  message.value = `已保存「${n}」`
  await refresh()
}

function load(p: Project): void {
  try {
    const g = graphFromMolblock(p.molblock)
    loadGraph(g, p.draftSmiles || p.canonicalSmiles)
    message.value = `已载入「${p.name}」`
  } catch (e) {
    message.value = `载入失败：${String(e)}`
  }
}

async function remove(p: Project): Promise<void> {
  if (p.id == null) return
  await deleteProject(p.id)
  message.value = `已删除「${p.name}」`
  await refresh()
}

function fmt(t: number): string {
  return new Date(t).toLocaleString()
}
</script>

<template>
  <div class="projects">
    <div class="save-row">
      <input v-model="name" placeholder="工程名称（可空）" />
      <button :disabled="state.graph.atoms.length === 0" @click="save">保存当前工程</button>
    </div>
    <p class="hint">工程保存在浏览器 IndexedDB 中，仅存于本机，不上传任何服务器。</p>
    <p v-if="message" class="msg">{{ message }}</p>

    <ul class="list">
      <li v-for="p in projects" :key="p.id">
        <div class="info">
          <b>{{ p.name }}</b>
          <span class="mono small">{{ p.canonicalSmiles || '（空画布）' }}</span>
          <span class="small">{{ fmt(p.updatedAt) }}</span>
        </div>
        <div class="ops">
          <button @click="load(p)">载入</button>
          <button class="danger" @click="remove(p)">删除</button>
        </div>
      </li>
      <li v-if="projects.length === 0" class="empty">暂无保存的工程</li>
    </ul>
  </div>
</template>

<style scoped>
.projects { display: flex; flex-direction: column; gap: 10px; }
.save-row { display: flex; gap: 6px; }
.save-row input { flex: 1; padding: 6px 8px; border: 1px solid #d0d7de; border-radius: 6px; }
button { padding: 5px 12px; border: 1px solid #d0d7de; background: #f6f8fa; border-radius: 6px; cursor: pointer; font-size: 13px; }
button:disabled { opacity: 0.5; cursor: default; }
button.danger { color: #cf222e; }
.hint { font-size: 12px; color: #8c959f; margin: 0; }
.msg { font-size: 13px; color: #1a7f37; margin: 0; }
.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.list li { display: flex; justify-content: space-between; align-items: center; border: 1px solid #eaeef2; border-radius: 6px; padding: 8px 10px; }
.list li.empty { color: #8c959f; justify-content: center; }
.info { display: flex; flex-direction: column; gap: 2px; }
.mono { font-family: ui-monospace, monospace; }
.small { font-size: 12px; color: #8c959f; }
.ops { display: flex; gap: 6px; }
</style>
