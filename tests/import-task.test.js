import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  cpSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { describe, it, afterEach } from "node:test";

const KIT = join(dirname(fileURLToPath(import.meta.url)), "..");
const IMPORT = join(KIT, "template", "sddharness", "scripts", "import-task.mjs");
const VALIDATE = join(
  KIT,
  "template",
  "sddharness",
  "scripts",
  "validate-features.mjs"
);
const EMPTY_LIST = join(KIT, "template", "sddharness", "feature_list.json");

const { nextTaskId, titleFromDescription, nextFeatureName } = await import(
  pathToFileURL(IMPORT).href
);

describe("nextTaskId", () => {
  it("returns 1 on empty history", () => {
    assert.equal(nextTaskId(""), 1);
    assert.equal(nextTaskId("# Histórico de sessões\n\n"), 1);
  });

  it("returns N+1 when Tarefa N exists", () => {
    const history = `## 2026-08-19 — Tarefa 3\n\n- **Origem:** manual\n- **Id:** 3\n`;
    assert.equal(nextTaskId(history), 4);
  });
});

describe("titleFromDescription / nextFeatureName", () => {
  it("uses the first line as title", () => {
    assert.equal(
      titleFromDescription("Atualizar payment\n\nDetalhes longos"),
      "Atualizar payment"
    );
  });

  it("pads the next feature name", () => {
    assert.equal(nextFeatureName([]), "feature-01");
    assert.equal(nextFeatureName([{ name: "feature-01" }]), "feature-02");
  });
});

describe("import-task.mjs CLI", () => {
  let dir;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  function harness(history = "") {
    dir = mkdtempSync(join(tmpdir(), "sdd-task-"));
    mkdirSync(join(dir, "sddharness", "scripts"), { recursive: true });
    mkdirSync(join(dir, "sddharness", "progress"), { recursive: true });
    mkdirSync(join(dir, "sddharness", "specs"), { recursive: true });
    cpSync(IMPORT, join(dir, "sddharness", "scripts", "import-task.mjs"));
    cpSync(VALIDATE, join(dir, "sddharness", "scripts", "validate-features.mjs"));
    writeFileSync(
      join(dir, "sddharness", "feature_list.json"),
      readFileSync(EMPTY_LIST, "utf8")
    );
    writeFileSync(
      join(dir, "sddharness", "progress", "history.md"),
      history || "# Histórico de sessões\n\n"
    );
    writeFileSync(
      join(dir, "sddharness", "progress", "current.md"),
      "# Sessão atual\n\n## Feature em andamento\n\nNenhuma.\n"
    );
    return dir;
  }

  function run(cwd, args) {
    return spawnSync(
      process.execPath,
      [join(cwd, "sddharness", "scripts", "import-task.mjs"), ...args],
      { cwd, encoding: "utf8" }
    );
  }

  it("next-id is 1 when history has no Tarefa", () => {
    const cwd = harness();
    const r = run(cwd, ["next-id"]);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.equal(r.stdout.trim(), "1");
  });

  it("next-id is 4 when history has Tarefa 3", () => {
    const cwd = harness("## 2026-08-01 — Tarefa 3\n\n- **Id:** 3\n");
    const r = run(cwd, ["next-id"]);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.equal(r.stdout.trim(), "4");
  });

  it("two imports increment 1 then 2 and set source.manual", () => {
    const cwd = harness();
    const first = run(cwd, [
      "import",
      "--description",
      "Primeira tarefa\ncorpo",
    ]);
    assert.equal(first.status, 0, first.stderr + first.stdout);
    const out1 = JSON.parse(first.stdout);
    assert.equal(out1.id, 1);
    assert.equal(out1.key, "1");
    assert.equal(out1.title, "Primeira tarefa");

    const second = run(cwd, ["import", "--description", "Segunda tarefa"]);
    assert.equal(second.status, 0, second.stderr + second.stdout);
    const out2 = JSON.parse(second.stdout);
    assert.equal(out2.id, 2);

    const list = JSON.parse(
      readFileSync(join(cwd, "sddharness", "feature_list.json"), "utf8")
    );
    assert.equal(list.source.type, "manual");
    assert.equal(list.source.key, "2");
    assert.equal(list.features.length, 2);
    assert.equal(list.features[0].name, "feature-01");
    assert.equal(list.features[1].name, "feature-02");

    const history = readFileSync(
      join(cwd, "sddharness", "progress", "history.md"),
      "utf8"
    );
    assert.match(history, /Tarefa 1/);
    assert.match(history, /Tarefa 2/);

    const v = spawnSync(
      process.execPath,
      [join(cwd, "sddharness", "scripts", "validate-features.mjs")],
      { cwd, encoding: "utf8" }
    );
    assert.equal(v.status, 0, v.stderr + v.stdout);
  });
});
