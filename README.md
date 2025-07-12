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
# Search identifier fetchData in src and output markdown
npm run context fetchData > context.md

# Search string literal and limit output lines
npm run context "ユーザーID" -- --literal -m 120 -o markdown

# JSON list of files
npm run context handleError -- -o json > files.json

# Skip interactive prompt and accept all candidates
npm run context fetchData -- --all

# Limit dependency depth to 2
npm run context fetchData -- --depth 2
```

Requires Node.js 18 or newer.

