#!/usr/bin/env node
// 构建并运行全部纯逻辑测试（真实 RDKit wasm，无浏览器）
import { build } from 'esbuild';

const entries = ['run', 'run2', 'run3'];
for (const e of entries) {
  await build({
    entryPoints: [`test/${e}.ts`],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    outfile: `test-bundle/${e}.js`,
    logLevel: 'silent',
  });
}
console.log('已打包测试模块\n');

let failed = 0;
for (const e of entries) {
  const { execFileSync } = await import('node:child_process');
  console.log(`── ${e} ────────────────────────────`);
  try {
    const out = execFileSync('node', [`test-bundle/${e}.js`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    console.log(out.trimEnd());
  } catch (err) {
    failed++;
    console.log(err.stdout?.toString() ?? '');
    console.log(err.stderr?.toString() ?? '');
    console.log('（该组存在失败）');
  }
}
process.exit(failed ? 1 : 0);
