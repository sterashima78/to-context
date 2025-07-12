# context-map

CLI tool to generate context for LLMs by searching a codebase and resolving import dependencies.

## Setup

```bash
npm install
```

Lint with [Oxlint](https://github.com/oxc-project/oxc):

```bash
npm run lint
```

## Usage

```bash
# Search identifier fetchData in examples and output markdown
npm run context fetchData -- -r examples > context.md

# Search string literal and limit output lines
npm run context "ユーザーID" -- -r examples --literal -m 120 -o markdown

# JSON list of files
npm run context handleError -- -r examples -o json > files.json

# Skip interactive prompt and accept all candidates
npm run context fetchData -- -r examples --all

# Limit dependency depth to 2
npm run context fetchData -- -r examples --depth 2
# Include files that depend on the entry files
npm run context uniqueB -- -r examples --upstream -a -o markdown
```

Requires Node.js 18 or newer.

