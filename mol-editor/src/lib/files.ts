// 文件级导入导出（全部本地完成）。
// - 工程 .meproj.json：原始输入草稿 + 图（含楔键、芳香键、电荷、同位素）
// - .mol：V2000，楔键/双键几何携带立体信息，可被 RDKit 再导入
// - .smi：规范异构 SMILES（@/@@ 与 /\\ 保持立体）
import type { MolGraph, Project } from '../editor/types';
import { writeMolblock } from '../editor/molblock';
import { kekulize } from '../editor/kekulize';

export function downloadText(filename: string, text: string, mime = 'text/plain'): void {
  const blob = new Blob([text], { type: mime + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportMolblock(graph: MolGraph, name: string): string {
  const kek = kekulize(graph);
  return writeMolblock(graph, { kekulizeMap: kek.assignments, name });
}

export function exportProject(project: Project): string {
  return JSON.stringify(project, null, 2);
}

export function readTextFile(file: File): Promise<string> {
  return file.text();
}

export function isMolblock(text: string): boolean {
  return /V2000\s*$/m.test(text) || /V3000\s*$/m.test(text);
}

export function parseProject(text: string): Project {
  const obj = JSON.parse(text) as Project;
  if (obj.version !== 1 || !('graph' in obj)) throw new Error('不是本工具的工程文件');
  return obj;
}
