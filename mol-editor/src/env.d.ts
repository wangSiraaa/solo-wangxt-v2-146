/// <reference types="vite/client" />
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}
declare module '@rdkit/rdkit/dist/RDKit_minimal.js?url' {
  const url: string
  export default url
}
