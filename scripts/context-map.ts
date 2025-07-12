#!/usr/bin/env tsx
import { program } from "commander";
import { parse, Lang } from "@ast-grep/napi";
import inquirer from "inquirer";
import fs from "fs/promises";
import path from "path";
import { DirectedGraph } from "graphology";

// CLI definition
program
  .argument("<keyword>")
  .option("-l, --literal", "リテラル検索", false)
  .option("-o, --output <type>", "markdown|json", "markdown")
  .option("-m, --max-lines <n>", "0 で無制限", "0")
  .option("-r, --root <dir>", "検索ルート", "src")
  .option("-d, --depth <n>", "依存の深さ (0 は無制限)", "0")
  .option("-u, --upstream", "初期ファイルを依存に持つファイル群も含める", false)
  .option("-a, --all", "全ての候補ファイルを選択", false)
  .action(async (kw, opts) => {
    const rootDir = path.resolve(process.cwd(), opts.root);
    const maxLines = parseInt(opts.maxLines, 10);
    const depth = parseInt(opts.depth, 10);
    const files = await collectFiles(rootDir);
    const graph = new DirectedGraph();
    const matches = await searchFiles(files, kw, opts.literal, graph);
    if (matches.length === 0) {
      console.error("No matches found");
      process.exitCode = 1;
      return;
    }
    const selected = opts.all
      ? matches.map((m) => m.file)
      : (
          await inquirer.prompt({
            type: "checkbox",
            name: "selected",
            message: "Select entry files",
            choices: matches.map((m) => ({ name: `${m.file} (${m.lines.join(",")})`, value: m.file })),
          })
        ).selected;
    if (!selected || selected.length === 0) {
      console.error("No files selected");
      process.exitCode = 1;
      return;
    }
    let entries: string[] = selected;
    if (opts.upstream) {
      const parents = findDependents(graph, selected);
      entries = [...new Set([...selected, ...parents])];
    }
    const closure = await buildClosure(graph, entries, depth > 0 ? depth : Infinity);
    await outputFiles([...closure], opts.output, maxLines);
  });

program.parse();

type MatchInfo = { file: string; lines: number[] };

const exts = [".ts", ".tsx", ".js", ".jsx"];

async function collectFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const e of entries) {
    const res = path.join(dir, e.name);
    if (e.isDirectory()) {
      files.push(...(await collectFiles(res)));
    } else if (exts.includes(path.extname(e.name))) {
      files.push(res);
    }
  }
  return files;
}

function guessLang(file: string): Lang {
  const ext = path.extname(file);
  if (ext === ".ts") return Lang.TypeScript;
  if (ext === ".tsx") return Lang.Tsx;
  if (ext === ".jsx") return Lang.JavaScript;
  return Lang.JavaScript;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function searchFiles(files: string[], kw: string, literal: boolean, graph?: DirectedGraph): Promise<MatchInfo[]> {
  const res: MatchInfo[] = [];
  for (const f of files) {
    const content = await fs.readFile(f, "utf8");
    if (graph) {
      if (!graph.hasNode(f)) graph.addNode(f);
      const deps = await parseImportsFromContent(f, content);
      for (const d of deps) {
        if (!graph.hasNode(d)) graph.addNode(d);
        if (!graph.hasEdge(f, d)) graph.addEdge(f, d);
      }
    }
    const lang = guessLang(f);
    const root = parse(lang, content);
    const rule = literal
      ? { rule: { kind: "string_fragment", regex: escapeRegex(kw) }, language: lang }
      : { rule: { kind: "identifier", regex: `^${escapeRegex(kw)}$` }, language: lang };
    // ast-grep type lacks generics for pattern object
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nodes = root.root().findAll(rule as any);
    const lines = new Set<number>();
    for (const n of nodes) {
      lines.add(n.range().start.line + 1);
    }
    if (lines.size > 0) res.push({ file: f, lines: [...lines].sort((a, b) => a - b) });
  }
  return res;
}

async function parseImportsFromContent(file: string, content: string): Promise<string[]> {
  const regexes = [
    /import[^'"\n]*['"]([^'"]+)['"]/g,
    /require\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  const deps = new Set<string>();
  for (const r of regexes) {
    let m;
    while ((m = r.exec(content))) {
      const dep = m[1];
      if (dep.startsWith(".")) {
        const resolved = await resolveModule(file, dep);
        if (resolved) deps.add(resolved);
      }
    }
  }
  return [...deps];
}

async function parseImports(file: string): Promise<string[]> {
  const content = await fs.readFile(file, "utf8");
  return parseImportsFromContent(file, content);
}

async function resolveModule(baseFile: string, spec: string): Promise<string | null> {
  const base = path.resolve(path.dirname(baseFile), spec);
  const candidates = [
    base,
    ...exts.map((e) => base + e),
    ...exts.map((e) => path.join(base, `index${e}`)),
  ];
  for (const c of candidates) {
    try {
      const st = await fs.stat(c);
      if (st.isFile()) return c;
    } catch {
      // ignore
    }
  }
  return null;
}

function findDependents(graph: DirectedGraph, entries: string[]): Set<string> {
  const visited = new Set<string>();
  const queue = [...entries];
  while (queue.length) {
    const f = queue.shift()!;
    if (visited.has(f)) continue;
    visited.add(f);
    const parents = graph.inNeighbors(f) || [];
    for (const p of parents) {
      if (!visited.has(p)) queue.push(p);
    }
  }
  for (const e of entries) {
    visited.delete(e);
  }
  return visited;
}

async function buildClosure(graph: DirectedGraph, entries: string[], maxDepth: number): Promise<Set<string>> {
  const visited = new Set<string>();
  const queue: Array<{ file: string; depth: number }> = entries.map((f) => ({ file: f, depth: 0 }));
  while (queue.length) {
    const { file: f, depth } = queue.shift()!;
    if (visited.has(f)) continue;
    visited.add(f);
    if (depth >= maxDepth) continue;
    const deps = graph.outNeighbors(f) || [];
    for (const d of deps) {
      if (!visited.has(d)) queue.push({ file: d, depth: depth + 1 });
    }
  }
  return visited;
}

async function outputFiles(files: string[], format: string, maxLines: number) {
  if (format === "json") {
    console.log(JSON.stringify(files, null, 2));
    return;
  }
  const rels = files.map((f) => path.relative(process.cwd(), f)).sort();
  console.log("```text\n" + generateFileTree(rels) + "\n```");
  for (const f of files) {
    const content = await fs.readFile(f, "utf8");
    const lines = content.split(/\r?\n/);
    const slice = maxLines > 0 ? lines.slice(0, maxLines) : lines;
    const rel = path.relative(process.cwd(), f);
    console.log(`### ${rel}\n\n\`\`\`ts\n${slice.join("\n")}\n\`\`\``);
  }
}

function generateFileTree(paths: string[]): string {
  const root: Record<string, any> = {};
  for (const p of paths) {
    const parts = p.split(path.sep);
    let node = root;
    for (const part of parts) {
      node[part] = node[part] || {};
      node = node[part];
    }
  }
  const lines = ["."];
  const traverse = (node: Record<string, any>, prefix: string) => {
    const entries = Object.keys(node).sort();
    for (let i = 0; i < entries.length; i++) {
      const name = entries[i];
      const last = i === entries.length - 1;
      lines.push(prefix + (last ? "└── " : "├── ") + name);
      traverse(node[name], prefix + (last ? "    " : "│   "));
    }
  };
  traverse(root, "");
  return lines.join("\n");
}

