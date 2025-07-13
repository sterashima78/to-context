#!/usr/bin/env -S deno run --allow-read

interface Options {
  literal: boolean;
  output: string;
  maxLines: number;
  root: string;
  depth: number;
  upstream: boolean;
  all: boolean;
}

function parseArgs(
  args: string[],
): { keyword: string | undefined; opts: Options } {
  const opts: Options = {
    literal: false,
    output: "markdown",
    maxLines: 0,
    root: "src",
    depth: 0,
    upstream: false,
    all: false,
  };
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    switch (a) {
      case "-l":
      case "--literal":
        opts.literal = true;
        break;
      case "-o":
      case "--output":
        opts.output = args[++i];
        break;
      case "-m":
      case "--max-lines":
        opts.maxLines = Number(args[++i]);
        break;
      case "-r":
      case "--root":
        opts.root = args[++i];
        break;
      case "-d":
      case "--depth":
        opts.depth = Number(args[++i]);
        break;
      case "-u":
      case "--upstream":
        opts.upstream = true;
        break;
      case "-a":
      case "--all":
        opts.all = true;
        break;
      default:
        rest.push(a);
    }
  }
  const keyword = rest.shift();
  return { keyword, opts };
}

class DirectedGraph {
  nodes = new Set<string>();
  edges = new Map<string, Set<string>>();
  reverse = new Map<string, Set<string>>();

  addEdge(from: string, to: string) {
    if (!this.edges.has(from)) this.edges.set(from, new Set());
    this.edges.get(from)!.add(to);
    if (!this.reverse.has(to)) this.reverse.set(to, new Set());
    this.reverse.get(to)!.add(from);
    this.nodes.add(from);
    this.nodes.add(to);
  }

  outNeighbors(n: string): string[] {
    return [...(this.edges.get(n) ?? [])];
  }

  inNeighbors(n: string): string[] {
    return [...(this.reverse.get(n) ?? [])];
  }
}

interface MatchInfo {
  file: string;
  lines: number[];
}

const exts = [".ts", ".tsx", ".js", ".jsx"];

async function collectFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  for await (const entry of Deno.readDir(dir)) {
    const p = `${dir}/${entry.name}`;
    if (entry.isDirectory) {
      files.push(...(await collectFiles(p)));
    } else if (exts.some((e) => entry.name.endsWith(e))) {
      files.push(p);
    }
  }
  return files;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function searchFiles(
  files: string[],
  kw: string,
  literal: boolean,
  graph: DirectedGraph,
): Promise<MatchInfo[]> {
  const res: MatchInfo[] = [];
  const ident = new RegExp(`\\b${escapeRegex(kw)}\\b`);
  const str = new RegExp(`(['\"\`])${escapeRegex(kw)}\\1`);
  for (const f of files) {
    const content = await Deno.readTextFile(f);
    const deps = await parseImportsFromContent(f, content);
    for (const d of deps) graph.addEdge(f, d);
    const lines: number[] = [];
    const regex = literal ? str : ident;
    const arr = content.split(/\r?\n/);
    arr.forEach((line, i) => {
      if (regex.test(line)) lines.push(i + 1);
    });
    if (lines.length) res.push({ file: f, lines });
  }
  return res;
}

async function parseImportsFromContent(
  file: string,
  content: string,
): Promise<string[]> {
  const regexes = [
    /import[^'"\n]*['"]([^'"]+)['"]/g,
    /require\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  const deps = new Set<string>();
  for (const r of regexes) {
    let m: RegExpExecArray | null;
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

async function resolveModule(
  baseFile: string,
  spec: string,
): Promise<string | null> {
  const base = new URL(spec, `file://${baseFile}`).pathname.replace(
    /\/\\/g,
    "/",
  );
  const candidates = [
    base,
    ...exts.map((e) => base + e),
    ...exts.map((e) => `${base}/index${e}`),
  ];
  for (const c of candidates) {
    try {
      const st = await Deno.stat(c);
      if (st.isFile) return c;
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
    const parents = graph.inNeighbors(f);
    for (const p of parents) {
      if (!visited.has(p)) queue.push(p);
    }
  }
  for (const e of entries) visited.delete(e);
  return visited;
}

async function buildClosure(
  graph: DirectedGraph,
  entries: string[],
  maxDepth: number,
): Promise<Set<string>> {
  const visited = new Set<string>();
  const queue: Array<{ file: string; depth: number }> = entries.map((f) => ({
    file: f,
    depth: 0,
  }));
  while (queue.length) {
    const { file: f, depth } = queue.shift()!;
    if (visited.has(f)) continue;
    visited.add(f);
    if (depth >= maxDepth) continue;
    for (const d of graph.outNeighbors(f)) {
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
  const rels = files.map((f) => relative(Deno.cwd(), f)).sort();
  console.log("```text\n" + generateFileTree(rels) + "\n```");
  for (const f of files) {
    const content = await Deno.readTextFile(f);
    const lines = content.split(/\r?\n/);
    const slice = maxLines > 0 ? lines.slice(0, maxLines) : lines;
    const rel = relative(Deno.cwd(), f);
    console.log(`### ${rel}\n\n\`\`\`ts\n${slice.join("\n")}\n\`\`\``);
  }
}

function generateFileTree(paths: string[]): string {
  const root: Record<string, any> = {};
  for (const p of paths) {
    const parts = p.split("/");
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

function relative(from: string, to: string): string {
  const f = from.split("/");
  const t = to.split("/");
  while (f.length && t.length && f[0] === t[0]) {
    f.shift();
    t.shift();
  }
  return t.join("/");
}

async function main() {
  const { keyword, opts } = parseArgs(Deno.args);
  if (!keyword) {
    console.error("Keyword is required");
    Deno.exit(1);
  }
  const rootDir = `${Deno.cwd()}/${opts.root}`;
  const files = await collectFiles(rootDir);
  const graph = new DirectedGraph();
  const matches = await searchFiles(files, keyword, opts.literal, graph);
  if (matches.length === 0) {
    console.error("No matches found");
    Deno.exit(1);
  }
  let selected: string[];
  if (opts.all) {
    selected = matches.map((m) => m.file);
  } else {
    matches.forEach((m, i) => {
      console.log(`[${i}] ${m.file} (${m.lines.join(",")})`);
    });
    const input = prompt("Select entry files (comma separated numbers): ") ??
      "";
    const nums = input.split(/\s*,\s*/).filter((s) => s.length > 0).map((s) =>
      parseInt(s, 10)
    );
    selected = nums.map((n) => matches[n]?.file).filter((f): f is string =>
      !!f
    );
  }
  if (selected.length === 0) {
    console.error("No files selected");
    Deno.exit(1);
  }
  let entries = selected;
  if (opts.upstream) {
    const parents = findDependents(graph, selected);
    entries = [...new Set([...selected, ...parents])];
  }
  const closure = await buildClosure(
    graph,
    entries,
    opts.depth > 0 ? opts.depth : Infinity,
  );
  await outputFiles([...closure], opts.output, opts.maxLines);
}

if (import.meta.main) {
  main();
}
