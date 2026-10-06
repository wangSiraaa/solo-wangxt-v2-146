/**
 * service 层集成测试：在 Node 中用真实 RDKit 驱动 src/rdkit/service.ts
 * （UI 调用的就是这些函数）。?url 导入由 esbuild 插件打桩。
 */
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const init = require('@rdkit/rdkit')
const RDKit = await init()

import {
  setRDKitInstance, analyzeGraph, importSmiles, summarizeSmiles, roundTripCheck,
} from '../src/rdkit/service'
import { classifyRelation } from '../src/chem/compare'
import { findBond, orientWedge } from '../src/chem/model'

setRDKitInstance(RDKit)

let failures = 0
function check(name: string, cond: boolean, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  | ' + extra : ''}`)
  if (!cond) failures++
}

// 导入 + 分析：手性分子
{
  const r = importSmiles('C[C@H](O)C(=O)O')
  check('import chiral ok', r.ok)
  if (r.ok) {
    const a = analyzeGraph(r.graph)
    check('analysis valid', a.valid)
    check('canonical keeps @', a.canonicalSmiles.includes('@'), a.canonicalSmiles)
    check('formula C3H6O3', a.formula === 'C3H6O3', a.formula)
    check('stereo tag (S)', a.stereoTags.some((t) => t.kind === 'atom' && t.label === '(S)'), JSON.stringify(a.stereoTags))
    check('impHs present', a.impHs.length === r.graph.atoms.length, JSON.stringify(a.impHs))
    check('noStereo differs', a.noStereoSmiles === 'CC(O)C(=O)O', a.noStereoSmiles)
    check('descriptors picked', typeof a.descriptors.amw === 'number' && typeof a.descriptors.tpsa === 'number')
    const rt = roundTripCheck(r.graph, a.canonicalSmiles, a.stereoTags)
    check('round-trip preserves stereo', rt.stereoPreserved, rt.detail)
  }
}

// E/Z 往返自检
{
  const r = importSmiles('C/C=C/C')
  if (r.ok) {
    const a = analyzeGraph(r.graph)
    check('E tag present', a.stereoTags.some((t) => t.kind === 'bond' && t.label === '(E)'), JSON.stringify(a.stereoTags))
    const rt = roundTripCheck(r.graph, a.canonicalSmiles, a.stereoTags)
    check('E/Z round-trip preserved', rt.stereoPreserved, rt.detail)
  } else check('import E-butene', false)
}

// 解析失败：定位 + 不替代
{
  const r = importSmiles('C1CC')
  check('unclosed ring fails', !r.ok)
  if (!r.ok) check('position at ring digit', r.error.position === 1, JSON.stringify(r.error))
  const r2 = importSmiles('CCX')
  if (!r2.ok) check('bad token position', r2.error.position === 2, JSON.stringify(r2.error))
  else check('CCX should fail', false)
}

// 编辑为超价 → 无效但保留图
{
  const r = importSmiles('CC(=O)O')
  if (r.ok) {
    const g = r.graph
    const oh = g.atoms.find((a) => a.elem === 'O'
      && g.bonds.some((b) => (b.a1 === a.id || b.a2 === a.id) && b.order === 1))!
    const b = g.bonds.find((x) => x.a1 === oh.id || x.a2 === oh.id)!
    b.order = 2
    const a = analyzeGraph(g)
    check('hypervalent invalid', !a.valid)
    check('valence hint flags C', a.valenceHints.some((p) => p.elem === 'C'), JSON.stringify(a.valenceHints))
    check('graph preserved after invalid edit', g.atoms.length === 4 && g.bonds.length === 3)
  } else check('import acetic acid', false)
}

// 楔形键编辑 → 手性出现；上/下对调 → 对映体；窄端朝向错误时 orientWedge 修正
{
  const r = importSmiles('CCC(C)O')
  if (r.ok) {
    const g = r.graph
    const o = g.atoms.find((a) => a.elem === 'O')!
    const b = g.bonds.find((x) => x.a1 === o.id || x.a2 === o.id)!
    b.stereo = 1
    const a1 = analyzeGraph(g)
    check('wedge creates stereocenter', a1.stereoTags.length > 0, JSON.stringify(a1.stereoTags))
    // 上/下对调（1↔6）→ 对映体
    b.stereo = 6
    const a2 = analyzeGraph(g)
    check('toggle up/down gives enantiomer',
      a1.canonicalSmiles !== a2.canonicalSmiles &&
      a1.noStereoSmiles === a2.noStereoSmiles &&
      a1.stereoTags[0]?.label !== a2.stereoTags[0]?.label,
      `${a1.canonicalSmiles}(${a1.stereoTags[0]?.label}) vs ${a2.canonicalSmiles}(${a2.stereoTags[0]?.label})`)
    check('classify enantiomers as stereoisomers',
      classifyRelation(
        { isoSmiles: a1.canonicalSmiles, noStereoSmiles: a1.noStereoSmiles, formula: a1.formula },
        { isoSmiles: a2.canonicalSmiles, noStereoSmiles: a2.noStereoSmiles, formula: a2.formula },
      ) === 'stereoisomers')
    // 窄端放在端基 O 上 → RDKit 无法感知手性；orientWedge 修正后恢复
    const chiralC = g.atoms.find((a) => a.elem === 'C' && findBond(g, a.id, o.id))!
    b.stereo = 1
    b.a1 = o.id
    b.a2 = chiralC.id
    const aBad = analyzeGraph(g)
    check('wedge from terminal atom gives unspecified (?) center',
      aBad.stereoTags.some((t) => t.label === '(?)') && !aBad.canonicalSmiles.includes('@'),
      `${aBad.canonicalSmiles} ${JSON.stringify(aBad.stereoTags)}`)
    orientWedge(g, b)
    const aFixed = analyzeGraph(g)
    check('orientWedge restores stereocenter', aFixed.stereoTags.length === 1, aFixed.canonicalSmiles)
  } else check('import 2-butanol', false)
}

// 同位素与电荷参与校验与分子式
{
  const r = importSmiles('[13CH4]')
  if (r.ok) {
    const a = analyzeGraph(r.graph)
    check('isotope in formula', a.formula.includes('[13C]'), a.formula)
    check('isotope in canonical', a.canonicalSmiles.includes('13'), a.canonicalSmiles)
  }
  const r2 = importSmiles('CC(=O)[O-]')
  if (r2.ok) {
    const a = analyzeGraph(r2.graph)
    check('charge kept', a.canonicalSmiles.includes('[O-]'), a.canonicalSmiles)
    check('acetate formula', a.formula === 'C2H3O2', a.formula)
  }
}

// summarizeSmiles + 空图
{
  const s = summarizeSmiles('COC')
  check('summarize ether', s.ok && s.summary.formula === 'C2H6O', s.ok ? s.summary.formula : '')
  const empty = analyzeGraph({ atoms: [], bonds: [] })
  check('empty graph analysis', empty.empty && empty.valid)
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
