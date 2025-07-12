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
  .action(async (kw, opts) => {
    const rootDir = path.resolve(process.cwd(), opts.root);
    const maxLines = parseInt(opts.maxLines, 10);
    const files = await collectFiles(rootDir);
    const matches = await searchFiles(files, kw, opts.literal);
    if (matches.length === 0) {
      console.error("No matches found");
      process.exitCode = 1;
      return;
    }
    const { selected } = await inquirer.prompt({
      type: "checkbox",
      name: "selected",
      message: "Select entry files",
      choices: matches.map((m) => ({ name: `${m.file} (${m.lines.join(",")})`, value: m.file })),
    });
    if (!selected || selected.length === 0) {
      console.error("No files selected");
      process.exitCode = 1;
      return;
    }
    const closure = await buildClosure(selected);
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

async function searchFiles(files: string[], kw: string, literal: boolean): Promise<MatchInfo[]> {
  const res: MatchInfo[] = [];
  for (const f of files) {
    const content = await fs.readFile(f, "utf8");
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

async function parseImports(file: string): Promise<string[]> {
  const content = await fs.readFile(file, "utf8");
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

async function buildClosure(entries: string[]): Promise<Set<string>> {
  const graph = new DirectedGraph();
  const visited = new Set<string>();
  const queue = [...entries];
  while (queue.length) {
    const f = queue.shift()!;
    if (visited.has(f)) continue;
    visited.add(f);
    if (!graph.hasNode(f)) graph.addNode(f);
    const deps = await parseImports(f);
    for (const d of deps) {
      if (!graph.hasNode(d)) graph.addNode(d);
      if (!graph.hasEdge(f, d)) graph.addEdge(f, d);
      if (!visited.has(d)) queue.push(d);
    }
  }
  return new Set(graph.nodes());
}

async function outputFiles(files: string[], format: string, maxLines: number) {
  if (format === "json") {
    console.log(JSON.stringify(files, null, 2));
    return;
  }
  for (const f of files) {
    const content = await fs.readFile(f, "utf8");
    const lines = content.split(/\r?\n/);
    const slice = maxLines > 0 ? lines.slice(0, maxLines) : lines;
    const rel = path.relative(process.cwd(), f);
    console.log(`### ${rel}\n\n\`\`\`ts\n${slice.join("\n")}\n\`\`\``);
  }
}

