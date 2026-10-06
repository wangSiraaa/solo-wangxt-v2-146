// 测试打包脚本：为 ?url 导入打桩后运行指定测试入口
import { build } from 'esbuild'

const urlStub = {
  name: 'url-stub',
  setup(b) {
    b.onResolve({ filter: /\?url$/ }, (args) => ({
      path: args.path,
      namespace: 'url-stub',
    }))
    b.onLoad({ filter: /.*/, namespace: 'url-stub' }, () => ({
      contents: 'export default "stub.wasm"',
    }))
  },
}

const entry = process.argv[2]
const out = process.argv[3]
await build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: out,
  plugins: [urlStub],
  logLevel: 'warning',
})
