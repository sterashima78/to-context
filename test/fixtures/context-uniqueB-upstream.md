```text
.
└── src
    ├── a.ts
    ├── b.ts
    └── c.ts
```
### src/b.ts

```ts
import c from './c'
export const uniqueB = 1;
export default function b() { return c(); }

```
### src/a.ts

```ts
import b from './b'
export const foo = "bar";
export function fetchData() { return b(); }

```
### src/c.ts

```ts
export default function c() { return 1; }

```
