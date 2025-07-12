```text
.
└── src
    ├── a.ts
    └── b.ts
```
### src/a.ts

```ts
import b from './b'
export const foo = "bar";
export function fetchData() { return b(); }

```
### src/b.ts

```ts
import c from './c'
export default function b() { return c(); }

```
