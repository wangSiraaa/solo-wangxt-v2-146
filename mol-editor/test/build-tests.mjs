// 用 esbuild 将被测 TS 打包为 ESM（自动处理 .vue 之外的纯 TS 模块）
import { build } from 'esbuild';

await build({
  entryPoints: ['test/run.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  outfile: 'test-bundle/run.js',
  sourcemap: false,
  logLevel: 'info',
});
