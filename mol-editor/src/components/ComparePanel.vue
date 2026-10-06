<script setup lang="ts">
/**
 * 异构体比较：输入两个 SMILES（或取用当前编辑器分子），
 * 基于 RDKit 规范形式判定 同一/构造异构/立体异构/不同。
 */
import { computed, reactive } from 'vue'
import { state } from '../store/editorStore'
import { summarizeSmiles } from '../rdkit/service'
import { classifyRelation, RELATION_LABELS, type MolSummary, type Relation } from '../chem/compare'
import type { SmilesError } from '../chem/smilesError'
import { EXAMPLE_PAIRS } from '../chem/examples'

const inputs = reactive({ a: '', b: '' })
const results = reactive<{
  a: MolSummary | null
  b: MolSummary | null
  errA: SmilesError | null
  errB: SmilesError | null
  relation: Relation | null
  compared: boolean
}>({ a: null, b: null, errA: null, errB: null, relation: null, compared: false })

const relationLabel = computed(() => (results.relation ? RELATION_LABELS[results.relation] : ''))

function compare(): void {
  if (!state.ready) return
  const ra = summarizeSmiles(inputs.a)
  const rb = summarizeSmiles(inputs.b)
  results.a = ra.ok ? ra.summary : null
  results.b = rb.ok ? rb.summary : null
  results.errA = ra.ok ? null : ra.error
  results.errB = rb.ok ? null : rb.error
  results.relation = results.a && results.b ? classifyRelation(results.a, results.b) : null
  results.compared = true
}

function useCurrent(side: 'a' | 'b'): void {
  const can = state.analysis?.canonicalSmiles
  if (can) inputs[side] = can
}

function loadPair(a: string, b: string): void {
  inputs.a = a
  inputs.b = b
  compare()
}
</script>

<template>
  <div class="compare">
    <p class="hint">
      判定基于 RDKit 规范形式：规范异构 SMILES 相同为同一分子；去立体后相同为立体异构；
      分子式相同但连接不同为构造异构。示例均为常见无害教学分子，仅作表示与性质比较。
    </p>

    <div class="grid">
      <div v-for="side in (['a', 'b'] as const)" :key="side" class="side">
        <div class="input-row">
          <input
            v-model="inputs[side]" class="mono" :placeholder="side === 'a' ? '分子 A 的 SMILES' : '分子 B 的 SMILES'"
            :disabled="!state.ready" @keydown.enter="compare"
          />
          <button :disabled="!state.analysis?.valid" @click="useCurrent(side)">用当前分子</button>
        </div>
        <div v-if="results.compared && results['err' + side.toUpperCase() as 'errA' | 'errB']" class="err">
          {{ results['err' + side.toUpperCase() as 'errA' | 'errB']!.message }}
        </div>
        <div v-if="results[side]" class="summary">
          <div><span class="tag">规范式</span><span class="mono">{{ results[side]!.isoSmiles }}</span></div>
          <div><span class="tag">分子式</span><span class="mono">{{ results[side]!.formula }}</span></div>
        </div>
      </div>
    </div>

    <button class="compare-btn" :disabled="!state.ready || !inputs.a.trim() || !inputs.b.trim()" @click="compare">
      比较
    </button>

    <div v-if="results.relation" class="result" :class="results.relation">
      {{ relationLabel }}
    </div>

    <div class="examples">
      <h4>示例比较（点击载入）</h4>
      <div class="pair-list">
        <button v-for="p in EXAMPLE_PAIRS" :key="p.title" @click="loadPair(p.a.smiles, p.b.smiles)">
          {{ p.title }}
          <span class="expect">{{ p.expect }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.compare { display: flex; flex-direction: column; gap: 12px; }
.hint { font-size: 13px; color: #57606a; margin: 0; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
@media (max-width: 800px) { .grid { grid-template-columns: 1fr; } }
.input-row { display: flex; gap: 6px; }
.input-row input { flex: 1; padding: 6px 8px; border: 1px solid #d0d7de; border-radius: 6px; }
.mono { font-family: ui-monospace, monospace; font-size: 13px; }
button { padding: 5px 12px; border: 1px solid #d0d7de; background: #f6f8fa; border-radius: 6px; cursor: pointer; font-size: 13px; }
button:disabled { opacity: 0.5; cursor: default; }
.err { color: #cf222e; font-size: 13px; margin-top: 4px; }
.summary { margin-top: 6px; font-size: 13px; display: flex; flex-direction: column; gap: 2px; }
.tag { display: inline-block; width: 52px; color: #57606a; font-size: 12px; }
.compare-btn { align-self: flex-start; background: #0969da; color: #fff; border-color: #0969da; }
.result { padding: 10px 14px; border-radius: 8px; font-weight: 600; font-size: 15px; }
.result.identical { background: #dafbe1; color: #1a7f37; }
.result.stereoisomers { background: #fff8c5; color: #9a6700; }
.result.constitutional { background: #ddf4ff; color: #0969da; }
.result.different { background: #f6f8fa; color: #57606a; }
.examples h4 { margin: 4px 0 8px; font-size: 13px; color: #57606a; }
.pair-list { display: flex; flex-direction: column; gap: 6px; }
.pair-list button { text-align: left; display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; }
.expect { font-size: 12px; color: #8c959f; }
</style>
