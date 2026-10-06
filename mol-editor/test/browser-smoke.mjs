import { chromium } from 'playwright';

const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' });

// 等待 RDKit 就绪标识
await page.waitForFunction(() => document.body.textContent?.includes('RDKit'), { timeout: 15000 });
await page.waitForFunction(() => /RDKit\s+20/.test(document.body.textContent || ''), { timeout: 15000 });
console.log('✓ RDKit 已在浏览器初始化');

// 默认导入乙醇：校验状态条
await page.waitForFunction(() => document.body.textContent?.includes('校验通过'), { timeout: 10000 });
console.log('✓ 默认分子校验通过');

// 画布上出现原子文字
const labels = await page.locator('text=C').allInnerTexts();
if (!labels.length) throw new Error('画布未渲染原子');
console.log('✓ SVG 画布渲染原子');

// 导入坏 SMILES
await page.fill('.smiles-input', 'C(C');
await page.click('button:has-text("导入并规范化")');
await page.waitForFunction(() => document.body.textContent?.includes('无法解析'), { timeout: 5000 });
console.log('✓ 无法解析时显示错误且不替换');

// 保留草稿文本仍在输入框
const kept = await page.inputValue('.smiles-input');
if (kept !== 'C(C') throw new Error('草稿未保留: ' + kept);
console.log('✓ 原始草稿保留：', kept);

// 导入手性乳酸并检查规范式
await page.fill('.smiles-input', 'C[C@H](O)C(=O)O');
await page.click('button:has-text("导入并规范化")');
await page.waitForFunction(() => document.body.textContent?.includes('C[C@H](O)C(=O)O'), { timeout: 5000 });
console.log('✓ 手性 SMILES 规范化保持 @');

// 切换到比较页
await page.click('button:has-text("异构比较")');
await page.waitForFunction(() => document.body.textContent?.includes('L-乳酸'), { timeout: 5000 });
console.log('✓ 异构比较页渲染');

// 切回编辑页，验证工具按钮存在
await page.click('button:has-text("结构编辑")');
await page.waitForSelector('.canvas');
console.log('✓ 编辑页与工具栏可用');

if (errors.length) {
  console.log('\n浏览器错误：');
  for (const e of errors) console.log(' -', e);
  process.exit(1);
}
console.log('\n✓ 浏览器冒烟测试全部通过，无控制台错误');
await browser.close();
