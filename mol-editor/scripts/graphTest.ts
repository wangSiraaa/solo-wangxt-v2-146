/**
 * 图模型 ↔ molblock ↔ RDKit 往返测试（在 Node 中运行真实 TS 模块）。
 * 由 esbuild 打包后执行，见 package.json 的 test:graph 脚本。
 */
import { createRequire } from 'node:module'
import { graphFromMolblock, molblockFromGraph } from '../src/chem/molblock'
import { stripStereo, findBond } from '../src/chem/model'
import { diagnoseSmiles } from '../src/chem/smilesError'
import { atomsFromRdkitJson, hillFormula } from '../src/chem/formula'
import { estimateValenceProblems } from '../src/chem/valence'
import { classifyRelation } from '../src/chem/compare'

const require = createRequire(import.meta.url)
const initRDKit = require('@rdkit/rdkit')
const RDKit = await initRDKit()

let failures = 0
function check(name: string, cond: boolean, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  | ' + extra : ''}`)
  if (!cond) failures++
}

function tryParse(s: string): boolean {
  const m = RDKit.get_mol(s)
  if (!m) return false
  const ok = m.is_valid()
  m.delete()
  return ok
}

/** SMILES → RDKit → molblock → 模型 → molblock → RDKit → 规范 SMILES 应一致 */
function roundTrip(smiles: string, label: string) {
  const mol = RDKit.get_mol(smiles)
  if (!mol) { check(`${label}: initial parse`, false); return }
  const expected = mol.get_smiles()
  if (!mol.has_coords()) mol.set_new_coords()
  const g = graphFromMolblock(mol.get_molblock())
  mol.delete()
  const mb2 = molblockFromGraph(g)
  const mol2 = RDKit.get_mol(mb2)
  const got = mol2 ? mol2.get_smiles() : '(null)'
  check(`${label}: graph round-trip`, got === expected, `${expected} -> ${got}`)
  if (mol2) mol2.delete()
}

roundTrip('CCO', 'ethanol')
roundTrip('C[C@H](O)C(=O)O', 'L-lactic acid (chiral)')
roundTrip('C[C@@H](O)C(=O)O', 'D-lactic acid (chiral)')
roundTrip('F/C=C/F', '(E)-1,2-difluoroethene')
roundTrip('F/C=C\\F', '(Z)-1,2-difluoroethene')
roundTrip('c1ccccc1', 'benzene (aromatic)')
roundTrip('c1ccncc1', 'pyridine (aromatic N)')
roundTrip('CC(=O)[O-]', 'acetate (charge)')
roundTrip('[NH4+]', 'ammonium (charge)')
roundTrip('[13CH3]C', 'isotope 13C')
roundTrip('C1CCCCC1', 'cyclohexane (ring)')
roundTrip('CC(=O)Oc1ccccc1C(=O)O', 'aspirin (multi-ring)')
roundTrip('C[C@H](N)C(=O)O', 'alanine (chiral)')

// 去立体后规范 SMILES 用于构造/立体异构判定
{
  const mol = RDKit.get_mol('C[C@H](O)C(=O)O')
  mol.set_new_coords()
  const g = graphFromMolblock(mol.get_molblock())
  mol.delete()
  const plain = RDKit.get_mol(molblockFromGraph(stripStereo(g)))
  const noStereo = plain.get_smiles()
  check('stripStereo removes @', !noStereo.includes('@'), noStereo)
  plain.delete()
}

// 编辑模拟 1：乙醇 C-O 单键改双键 → 乙醛
{
  const mol = RDKit.get_mol('CCO')
  mol.set_new_coords()
  const g = graphFromMolblock(mol.get_molblock())
  mol.delete()
  const o = g.atoms.find((a) => a.elem === 'O')!
  const c = g.atoms.find((a) => a.elem === 'C' && findBond(g, a.id, o.id))!
  const b = findBond(g, c.id, o.id)!
  b.order = 2
  const m2 = RDKit.get_mol(molblockFromGraph(g))
  check('edit single->double gives acetaldehyde', m2 && m2.get_smiles() === 'CC=O', m2?.get_smiles())
  m2 && m2.delete()
}

// 编辑模拟 2：苯环全部键设为芳香 → 仍是苯
{
  const mol = RDKit.get_mol('c1ccccc1')
  mol.set_new_coords()
  const g = graphFromMolblock(mol.get_molblock())
  mol.delete()
  for (const b of g.bonds) { b.aromatic = true; b.order = 1 }
  const m2 = RDKit.get_mol(molblockFromGraph(g))
  check('all-aromatic benzene ring canonical', m2 && m2.get_smiles() === 'c1ccccc1', m2?.get_smiles())
  m2 && m2.delete()
}

// 编辑模拟 3：2-丁醇 C-O 键加楔形 → 出现手性标记
{
  const mol = RDKit.get_mol('CCC(C)O')
  mol.set_new_coords()
  const g = graphFromMolblock(mol.get_molblock())
  mol.delete()
  const o = g.atoms.find((a) => a.elem === 'O')!
  const b = g.bonds.find((x) => x.a1 === o.id || x.a2 === o.id)!
  b.stereo = 1 // 楔形朝前
  const m2 = RDKit.get_mol(molblockFromGraph(g))
  const smi = m2 ? m2.get_smiles() : ''
  check('wedge bond creates chirality tag', smi.includes('@'), smi)
  // 再往返一次，立体应保持
  if (m2) {
    m2.set_new_coords()
    const g2 = graphFromMolblock(m2.get_molblock())
    m2.delete()
    const m3 = RDKit.get_mol(molblockFromGraph(g2))
    check('chirality survives second round-trip', m3 && m3.get_smiles() === smi, m3?.get_smiles())
    m3 && m3.delete()
  }
}

// 编辑模拟 4：制造超价（乙酸 C-OH 改双键）→ RDKit 拒绝，局部估算能定位到 C
{
  const mol = RDKit.get_mol('CC(=O)O')
  mol.set_new_coords()
  const g = graphFromMolblock(mol.get_molblock())
  mol.delete()
  const oh = g.atoms.find((a) => a.elem === 'O' && g.bonds.filter((b) => b.a1 === a.id || b.a2 === a.id).length === 1
    && findBond(g, a.id, g.atoms.find((c) => c.elem === 'C' && findBond(g, c.id, a.id))!.id)!.order === 1)!
  const b = g.bonds.find((x) => x.a1 === oh.id || x.a2 === oh.id)!
  b.order = 2
  const m2 = RDKit.get_mol(molblockFromGraph(g))
  check('hypervalent carbon rejected by RDKit', !m2 || !m2.is_valid())
  const problems = estimateValenceProblems(g)
  check('local valence hint flags the carbon', problems.some((p) => p.elem === 'C'), JSON.stringify(problems))
  m2 && m2.delete()
}

// 工程保存/载入路径：自写 molblock → 自解析 → 再写出应逐字节一致
{
  const mol = RDKit.get_mol('C[C@H](O)C(=O)O')
  mol.set_new_coords()
  const g = graphFromMolblock(mol.get_molblock())
  mol.delete()
  const mb1 = molblockFromGraph(g, { name: 'P' })
  const g2 = graphFromMolblock(mb1)
  const mb2 = molblockFromGraph(g2, { name: 'P' })
  check('own molblock reparse is stable', mb1 === mb2)
  const m3 = RDKit.get_mol(mb2)
  check('reloaded project keeps chirality', m3 && m3.get_smiles() === 'C[C@H](O)C(=O)O', m3?.get_smiles())
  m3 && m3.delete()
}

// 分子式（含隐式氢与同位素）
{
  const mol = RDKit.get_mol('CCO')
  const atoms = atomsFromRdkitJson(mol.get_json())
  check('ethanol formula C2H6O', hillFormula(atoms) === 'C2H6O', hillFormula(atoms))
  mol.delete()
  const iso = RDKit.get_mol('[13CH4]')
  const f = hillFormula(atomsFromRdkitJson(iso.get_json()))
  check('13C methane formula shows isotope', f.includes('[13C]'), f)
  iso.delete()
}

// SMILES 错误诊断
{
  const e1 = diagnoseSmiles('C1CC', tryParse)
  check('unclosed ring located', e1.position === 1, JSON.stringify(e1))
  const e2 = diagnoseSmiles('CC(C', tryParse)
  check('unclosed paren located', e2.position === 2, JSON.stringify(e2))
  const e3 = diagnoseSmiles('CCX', tryParse)
  check('bad token located at X', e3.position === 2, JSON.stringify(e3))
  const e4 = diagnoseSmiles('OC(=O)=O', tryParse)
  check('valence-type failure located near second =', e4.position >= 6 && e4.position <= 7, JSON.stringify(e4))
}

// 异构关系判定
{
  const sum = (smi: string) => {
    const m = RDKit.get_mol(smi)
    m.set_new_coords()
    const g = graphFromMolblock(m.get_molblock())
    const iso = m.get_smiles()
    const plain = RDKit.get_mol(molblockFromGraph(stripStereo(g)))
    const noStereo = plain.get_smiles()
    const formula = hillFormula(atomsFromRdkitJson(m.get_json()))
    m.delete(); plain.delete()
    return { isoSmiles: iso, noStereoSmiles: noStereo, formula }
  }
  const ethanol = sum('CCO')
  check('ethanol vs dimethyl ether = constitutional',
    classifyRelation(ethanol, sum('COC')) === 'constitutional')
  check('lactic R vs S = stereoisomers',
    classifyRelation(sum('C[C@H](O)C(=O)O'), sum('C[C@@H](O)C(=O)O')) === 'stereoisomers')
  check('E vs Z butene = stereoisomers',
    classifyRelation(sum('C/C=C/C'), sum('C/C=C\\C')) === 'stereoisomers')
  check('same molecule identical',
    classifyRelation(ethanol, sum('OCC')) === 'identical')
  check('ethanol vs methanol = different',
    classifyRelation(ethanol, sum('CO')) === 'different')
  check('n-butane vs isobutane = constitutional',
    classifyRelation(sum('CCCC'), sum('CC(C)C')) === 'constitutional')
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
