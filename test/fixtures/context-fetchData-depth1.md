```text
.
└── examples
    ├── a.ts
    └── b.ts
```

### examples/a.ts

```ts
import b from "./b";
export const foo = "bar";
export function fetchData() {
  return b();
}
```

### examples/b.ts

```ts
import c from "./c";
export const uniqueB = 1;
export default function b() {
  return c();
}
```
