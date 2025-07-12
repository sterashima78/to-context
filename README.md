# context-map

CLI tool to generate context for LLMs by searching a codebase and resolving import dependencies.

## Setup

```bash
npm install
```

## Usage

```bash
# Search identifier fetchData in src and output markdown
npm run context fetchData > context.md

# Search string literal and limit output lines
npm run context "ユーザーID" -- --literal -m 120 -o markdown

# JSON list of files
npm run context handleError -- -o json > files.json
```

Requires Node.js 18 or newer.

