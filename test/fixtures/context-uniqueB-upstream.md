```text
.
└── examples
    ├── a.ts
    ├── b.ts
    └── c.ts
```

### examples/b.ts

```ts
import c from "./c";
export const uniqueB = 1;
export default function b() {
  return c();
}
```

### examples/a.ts

```ts
import b from "./b";
export const foo = "bar";
export function fetchData() {
  return b();
}
```

### examples/c.ts

```ts
export default function c() {
  return 1;
}
```
