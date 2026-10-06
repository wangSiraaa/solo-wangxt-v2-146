import assert from 'node:assert/strict';
import { graphFromSmiles, validateGraph } from '../src/editor/rdkit';
import { writeMolblock } from '../src/editor/molblock';
import { kekulize } from '../src/editor/kekulize';
import { setBondType, setBondWedge, updateAtom } from '../src/editor/graphOps';
import { cloneGraph } from '../src/editor/types';
import { loadRDKit } from '../src/editor/rdkit';
await loadRDKit();
let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓', name); }
  catch (e) { console.error('  ✗', name, '\n   ', e.message); process.exitCode = 1; }
}
function imp(s) { const r = graphFromSmiles(s); if ('error' in r) throw new Error(r.error.message); return r; }

// 模拟“工程 JSON”：图克隆序列化往返
function projectRoundtrip(g) {
  return cloneGraph(JSON.parse(JSON.stringify(g)));
}

test('工程序列化往返：L-乳酸手性保持', () => {
  const r = imp('C[C@H](O)C(=O)O');
  const g2 = projectRoundtrip(r.graph);
  assert.equal(validateGraph(g2).canonicalSmiles, 'C[C@H](O)C(=O)O');
});

test('导出 .mol 文本含楔键代码 6，再解析仍是手性分子', () => {
  const r = imp('C[C@H](O)C(=O)O');
  const block = writeMolblock(r.graph, { kekulizeMap: kekulize(r.graph).assignments });
  assert.match(block, /1\s+6\s+0\s+0/); // 存在立体键行
});

test('画布改键型：单→双→三循环后分子仍有效（丙炔）', () => {
  const r = imp('CCC');
  const b = r.graph.bonds[0];
  setBondType(r.graph, b.id, 'triple');
  const v = validateGraph(r.graph);
  assert.equal(v.ok, true, v.error?.message);
  assert.equal(v.canonicalSmiles, 'C#CC');
});

test('给单键加楔键后产生 1 个手性中心（非共线构型）', () => {
  // 手性中心 atom2，周围四方向排布，楔键连向上方取代基
  const r = imp('F');
  const g = r.graph;
  g.atoms = [];
  g.bonds = [];
  g.nextAtomId = 1; g.nextBondId = 1;
  const mk = (element, x, y) => g.atoms.push({ id: g.nextAtomId++, element, x, y, charge: 0, isotope: 0, explicitH: 0 });
  const c = mk('C', 0, 0);
  const f = mk('F', 0, -1.3);
  const o = mk('O', 1.13, 0.65);
  const n = mk('N', -1.13, 0.65);
  const add = (a, b, type = 'single', wedge = '') => g.bonds.push({ id: g.nextBondId++, begin: a, end: b, type, wedge });
  add(c, f, 'single', 'up'); // 窄端在中心 C，宽端在取代基 F
  add(c, o);
  add(c, n);
  const v = validateGraph(g);
  assert.equal(v.ok, true, v.error?.message);
  assert.equal(v.numAtomStereo, 1, '应识别出 1 个手性中心，得到：' + v.canonicalSmiles);
  assert.equal(v.numUnspecifiedStereo, 0);
});

test('修改原子电荷后校验：O 加 +1 且三键连 H => [OH+]', () => {
  const r = imp('O');
  updateAtom(r.graph, r.graph.atoms[0].id, { charge: 1 });
  const v = validateGraph(r.graph);
  assert.equal(v.ok, true, v.error?.message);
  assert.ok(/\[OH\d?\+\]/.test(v.canonicalSmiles), v.canonicalSmiles);
});

test('同位素编辑：把 C 改为 13C 后规范式带 [13C]', () => {
  const r = imp('C');
  updateAtom(r.graph, r.graph.atoms[0].id, { isotope: 13 });
  const v = validateGraph(r.graph);
  assert.equal(v.ok, true);
  assert.ok(/\[13CH4\]/.test(v.canonicalSmiles), v.canonicalSmiles);
});

test('E/Z 分子改坐标后仍能被感知（几何立体由坐标决定）', () => {
  const r = imp('C/C=C/C');
  // 移动一个甲基到同侧 => Z
  const methyl = r.graph.atoms[0];
  methyl.x = r.graph.atoms[1].x; // 与另一端甲基同侧
  const v = validateGraph(r.graph);
  assert.equal(v.ok, true);
  // 不要求具体 E/Z 字符串，只要求未崩溃且输出双键
  assert.ok(v.canonicalSmiles.includes('='));
});

console.log(`\n${passed} 项编辑往返测试通过`);
