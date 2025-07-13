function join(...parts: string[]): string {
  const res = parts.join("/");
  return res.replace(/\/+/g, "/");
}

function dirname(path: string): string {
  return path.replace(/\/[^\/]*$/, "");
}

function fromFileUrl(url: string): string {
  return new URL(url).pathname;
}

function assertEquals(actual: unknown, expected: unknown) {
  if (actual !== expected) {
    console.error("Assertion failed", { actual, expected });
    throw new Error("Assertion failed");
  }
}

const __dirname = dirname(fromFileUrl(import.meta.url));
const root = join(__dirname, "..");

async function run(args: string[]): Promise<string> {
  const cmd = new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "--allow-read",
      join(root, "scripts", "context-map.ts"),
      ...args,
    ],
    stdout: "piped",
  });
  const { stdout } = await cmd.output();
  return new TextDecoder().decode(stdout);
}

Deno.test("context-map fetchData snapshot", async () => {
  const out = await run([
    "fetchData",
    "-r",
    "examples",
    "-a",
    "-o",
    "markdown",
  ]);
  const expected = await Deno.readTextFile(
    join(__dirname, "fixtures", "context-fetchData.md"),
  );
  assertEquals(out, expected);
});

Deno.test("context-map depth 1", async () => {
  const out = await run([
    "fetchData",
    "-r",
    "examples",
    "-a",
    "-o",
    "markdown",
    "--depth",
    "1",
  ]);
  const expected = await Deno.readTextFile(
    join(__dirname, "fixtures", "context-fetchData-depth1.md"),
  );
  assertEquals(out, expected);
});

Deno.test("context-map upstream", async () => {
  const out = await run([
    "uniqueB",
    "-r",
    "examples",
    "-a",
    "-o",
    "markdown",
    "--upstream",
  ]);
  const expected = await Deno.readTextFile(
    join(__dirname, "fixtures", "context-uniqueB-upstream.md"),
  );
  assertEquals(out, expected);
});
