/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

/**
 * @rdkit/rdkit 自带的 index.d.ts 只声明了全局 Window.initRDKitModule，
 * 没有模块导出声明；这里按实际 UMD 导出补充（仅声明用到的子集）。
 */
declare module '@rdkit/rdkit' {
  export interface JSMol {
    delete(): void
    is_valid(): boolean
    has_coords(): boolean
    set_new_coords(useCoordGen?: boolean): boolean
    get_smiles(): string
    get_molblock(): string
    get_json(): string
    get_descriptors(): string
    get_stereo_tags(): string
    get_inchi(): string
  }
  export interface RDKitModule {
    get_mol(input: string, details_json?: string): JSMol | null
    version(): string
  }
  const initRDKitModule: (opts?: { locateFile?: () => string }) => Promise<RDKitModule>
  export default initRDKitModule
}
