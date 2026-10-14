import { readFile } from "node:fs/promises";
import ts from "typescript";
const cache = new Map();
async function moduleUrl(url) {
  if (cache.has(url.href)) return cache.get(url.href);
  const source = await readFile(url, "utf8");
  let js = url.pathname.endsWith(".json") ? `export default ${source};` : ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const imports = [...js.matchAll(/from\s+["'](\.[^"']+)["']/g)];
  for (const match of imports) {
    const relative = match[1].endsWith(".json") ? match[1] : match[1] + ".ts";
    js = js.replace(match[0], `from ${JSON.stringify(await moduleUrl(new URL(relative, url)))}`);
  }
  const result = `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`;
  cache.set(url.href, result);
  return result;
}
export async function loadTs(path) { return import(await moduleUrl(new URL(`../${path}`, import.meta.url))); }
