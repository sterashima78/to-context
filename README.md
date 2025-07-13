# context-map

CLI tool to generate context for LLMs by searching a codebase and resolving
import dependencies.

## Setup

Install [Deno](https://deno.land/).

Lint with `deno lint`:

```bash
deno task lint
```

Format with `deno fmt`:

```bash
deno task format
```

## Usage

```bash
# Search identifier fetchData in examples and output markdown
deno run --allow-read scripts/context-map.ts fetchData -r examples > context.md

# Search string literal and limit output lines
deno run --allow-read scripts/context-map.ts "ユーザーID" -r examples --literal -m 120 -o markdown

# JSON list of files
deno run --allow-read scripts/context-map.ts handleError -r examples -o json > files.json

# Skip interactive prompt and accept all candidates
deno run --allow-read scripts/context-map.ts fetchData -r examples --all

# Limit dependency depth to 2
deno run --allow-read scripts/context-map.ts fetchData -r examples --depth 2
# Include files that depend on the entry files
deno run --allow-read scripts/context-map.ts uniqueB -r examples --upstream -a -o markdown
```

To build a single binary, use the provided task:

```bash
deno task build
```

The compiled `context-map` binary will be created in the current directory.

Requires Deno 1.42 or newer.
