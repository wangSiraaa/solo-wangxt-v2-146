<script setup lang="ts">
/**
 * 校验与性质面板：RDKit 校验状态、规范形式、分子式、基本性质、
 * 立体标签、导出与"导出→再导入"立体保持自检。
 */
import { computed, ref } from 'vue'
import { state, selectAtom } from '../store/editorStore'
import { DESCRIPTOR_LABELS, roundTripCheck, type RoundTripReport } from '../rdkit/service'
import { molblockFromGraph } from '../chem/molblock'

const analysis = computed(() => state.analysis)

const descriptorRows = computed(() => {
  const d = analysis.value?.descriptors ?? {}
  return DESCRIPTOR_LABELS.filter(([k]) => k in d).map(([k, label]) => ({
    label,
    value: formatNum(d[k]),
  }))
})

function formatNum(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(2)
}

const stereoText = computed(() => {
  const tags = analysis.value?.stereoTags ?? []
  if (tags.length === 0) return '无'
  return tags
    .map((t) => {
      if (t.kind === 'atom') {
        const a = state.graph.atoms[t.index]
        return `原子 ${t.index + 1}(${a?.elem ?? '?'})：${t.label}`
      }
      return `双键 ${t.index + 1}–${(t.index2 ?? 0) + 1}：${t.label}`
    })
    .join('；')
})

const roundTrip = ref<RoundTripReport | null>(null)
function runRoundTrip(): void {
  const a = analysis.value
  if (!a || !a.valid || a.empty) return
  roundTrip.value = roundTripCheck(state.graph, a.canonicalSmiles, a.stereoTags)
}

function copyCanonical(): void {
  const s = analysis.value?.canonicalSmiles
  if (s) navigator.clipboard?.writeText(s)
}

function downloadMol(): void {
  const mb = molblockFromGraph(state.graph, { name: 'MolEditor' })
  const blob = new Blob([mb], { type: 'chemical/x-mdl-molfile' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'molecule.mol'
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="panel">
    <h3>校验与性质（RDKit {{ state.rdkitVersion }}）</h3>

    <div v-if="!analysis || analysis.empty" class="hint">画布为空。</div>

    <template v-else>
      <div class="status" :class="analysis.valid ? 'ok' : 'bad'">
        {{ analysis.valid ? '✓ 结构有效（价态/芳香性/电荷/同位素校验通过）' : '✗ 结构无效' }}
      </div>

      <div v-if="!analysis.valid" class="error-box">
        <div>{{ analysis.error }}</div>
        <div v-if="analysis.valenceHints.length > 0" class="hints">
          可能出问题的原子（局部估算，仅供参考）：
          <button
            v-for="p in analysis.valenceHints" :key="p.atomId"
            class="link" @click="selectAtom(p.atomId)"
          >
            {{ p.elem }}（成键数 ≈ {{ p.used }}，常见上限 {{ p.max }}）
          </button>
        </div>
        <div class="hint">结构已保留在画布上，可继续修改；不会自动替换成其他分子。</div>
      </div>

      <template v-if="analysis.valid">
        <div class="kv"><span>分子式</span><b class="mono">{{ analysis.formula }}</b></div>

        <div class="desc-grid">
          <div v-for="r in descriptorRows" :key="r.label" class="desc-item">
            <span class="desc-label">{{ r.label }}</span>
            <span class="mono">{{ r.value }}</span>
          </div>
        </div>

        <div class="kv"><span>立体标签</span><span class="mono small">{{ stereoText }}</span></div>
        <div class="kv" v-if="analysis.inchi"><span>InChI</span><span class="mono small break">{{ analysis.inchi }}</span></div>

        <div class="actions">
          <button @click="copyCanonical">复制规范 SMILES</button>
          <button @click="downloadMol">下载 .mol</button>
          <button @click="runRoundTrip">导出→再导入自检</button>
        </div>

        <div v-if="roundTrip" class="roundtrip" :class="roundTrip.stereoPreserved ? 'ok-box' : 'bad-box'">
          <b>{{ roundTrip.stereoPreserved ? '✓ 立体信息在导出→再导入后保持' : '✗ 往返后不一致' }}</b>
          <div class="small">{{ roundTrip.detail }}</div>
        </div>
      </template>
    </template>
  </div>
</template>

<style scoped>
.panel { border: 1px solid #d0d7de; border-radius: 8px; padding: 10px 12px; background: #fff; }
h3 { margin: 0 0 8px; font-size: 14px; color: #57606a; }
.hint { font-size: 12px; color: #8c959f; }
.status { font-size: 13px; margin-bottom: 6px; }
.status.ok { color: #1a7f37; }
.status.bad { color: #cf222e; }
.error-box { padding: 8px; border: 1px solid #ffb3ad; background: #fff1f0; border-radius: 6px; font-size: 13px; color: #cf222e; margin-bottom: 6px; }
.hints { margin-top: 4px; }
.link { background: none; border: none; color: #0969da; cursor: pointer; text-decoration: underline; font-size: 13px; padding: 2px 4px; }
.kv { display: flex; gap: 8px; font-size: 13px; margin: 4px 0; align-items: baseline; }
.kv > span:first-child { flex: none; width: 64px; color: #57606a; }
.mono { font-family: ui-monospace, monospace; }
.small { font-size: 12px; }
.break { word-break: break-all; }
.desc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 12px; margin: 8px 0; font-size: 13px; }
.desc-item { display: flex; justify-content: space-between; border-bottom: 1px dashed #eaeef2; padding: 2px 0; }
.desc-label { color: #57606a; }
.actions { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
.actions button { padding: 4px 10px; border: 1px solid #d0d7de; background: #f6f8fa; border-radius: 6px; cursor: pointer; font-size: 13px; }
.roundtrip { margin-top: 8px; padding: 8px; border-radius: 6px; font-size: 13px; }
.ok-box { border: 1px solid #4ac26b; background: #dafbe1; color: #1a7f37; }
.bad-box { border: 1px solid #ffb3ad; background: #fff1f0; color: #cf222e; }
</style>
