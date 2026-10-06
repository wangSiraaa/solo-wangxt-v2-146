import assert from 'node:assert/strict';
import { graphFromSmiles, validateGraph } from '../src/editor/rdkit';
import { parseMolblock, writeMolblock } from '../src/editor/molblock';
import { kekulize } from '../src/editor/kekulize';
import { loadRDKit } from '../src/editor/rdkit';
await loadRDKit();
let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓', name); }
  catch (e) { console.error('  ✗', name, '\n   ', e.message); process.exitCode = 1; }
}
function imp(s) { const r = graphFromSmiles(s); if ('error' in r) throw new Error(r.error.message); return r; }

test('呋喃 c1ccoc1 往返', () => {
  const r = imp('c1ccoc1');
  assert.equal(validateGraph(r.graph).canonicalSmiles, 'c1ccoc1');
});
test('咪唑（含 [nH] 与吡啶 N）往返', () => {
  const r = imp('c1ncc[nH]1');
  const v = validateGraph(r.graph);
  assert.equal(v.ok, true, v.error?.message);
  assert.ok(/\[nH\]/.test(v.canonicalSmiles));
});
test('噻吩往返', () => {
  const r = imp('c1ccsc1');
  assert.equal(validateGraph(r.graph).canonicalSmiles, 'c1ccsc1');
});
test('萘稠环往返且仍芳香', () => {
  const r = imp('c1ccc2ccccc2c1');
  assert.equal(validateGraph(r.graph).canonicalSmiles, 'c1ccc2ccccc2c1');
});
test('氘标记氯 [2H]Cl 保留质量数 2', () => {
  const r = imp('[2H]Cl');
  const v = validateGraph(r.graph);
  assert.equal(v.ok, true);
  assert.ok(/\[2H\]/.test(v.canonicalSmiles), v.canonicalSmiles);
});
test('错误定位：多余右括号 CC)C 指在第 3 列', () => {
  const r = graphFromSmiles('CC)C');
  assert.ok('error' in r);
  if ('error' in r) assert.equal(r.error.column, 2);
});
test('错误定位：未闭合环 c1ccccc 不崩溃', () => {
  const r = graphFromSmiles('c1ccccc');
  assert.ok('error' in r);
  if ('error' in r) assert.ok(r.error.column >= 0);
});
test('导出 molblock 字符串再用 parseMolblock 导入，原子键数量不变', () => {
  const r = imp('CC(=O)O');
  const block = writeMolblock(r.graph, { kekulizeMap: kekulize(r.graph).assignments });
  const g2 = parseMolblock(block);
  assert.equal(g2.atoms.length, 4);
  assert.equal(g2.bonds.length, 3);
  assert.equal(validateGraph(g2).canonicalSmiles, 'CC(=O)O');
});
test('吡咯块重导入后含 [nH]（H 计数列生效）', () => {
  const r = imp('c1cc[nH]c1');
  const block = writeMolblock(r.graph, { kekulizeMap: kekulize(r.graph).assignments });
  const g2 = parseMolblock(block);
  assert.equal(validateGraph(g2).canonicalSmiles, 'c1cc[nH]c1');
});
test('苯的芳香键在图中保持 aromatic 类型（不只是双线画法）', () => {
  const r = imp('c1ccccc1');
  assert.ok(r.graph.bonds.every((b) => b.type === 'aromatic'));
});
test('三键分子 N#N 往返', () => {
  const r = imp('N#N');
  const v = validateGraph(r.graph);
  assert.equal(v.canonicalSmiles, 'N#N');
  assert.equal(r.graph.bonds[0].type, 'triple');
});
test('氧鎓 [OH3+] 电荷校验通过并保留 +', () => {
  const r = imp('[OH3+]');
  const v = validateGraph(r.graph);
  assert.equal(v.ok, true, v.error?.message);
  assert.ok(/\+/.test(v.canonicalSmiles));
});
console.log(`\n${passed} 项边界测试通过`);
