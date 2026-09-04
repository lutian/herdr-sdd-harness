import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync, mkdirSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { describe, it, after } from "node:test";

const KIT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = join(KIT, "bin", "sddharness");
const SCHEMA = join(KIT, "schema", "feature_list.schema.json");
const MARKER = "## TODO — preencha após instalar o arnês";
const H = "sddharness";

describe("sddharness schema", () => {
  it("schema file exists and is valid JSON", () => {
    const raw = readFileSync(SCHEMA, "utf8");
    const schema = JSON.parse(raw);
    assert.equal(schema.title, "sddharness feature_list");
    assert.ok(schema.properties.features);
  });

  it("accepts feature-01 naming pattern in schema", () => {
    const schema = JSON.parse(readFileSync(SCHEMA, "utf8"));
    const pattern = schema.properties.features.items.properties.name.pattern;
    assert.equal(pattern, "^feature-[0-9]{2,}$");
    assert.ok(new RegExp(pattern).test("feature-01"));
    assert.ok(!new RegExp(pattern).test("feature-1"));
  });
});

describe("sddharness CLI init (install skeleton)", () => {
  const dest = mkdtempSync(join(tmpdir(), "sddharness-"));

  after(() => {
    rmSync(dest, { recursive: true, force: true });
  });

  it("copies skeleton without error", () => {
    const r = spawnSync(process.execPath, [CLI, "init", dest], {
      encoding: "utf8",
    });
    assert.equal(r.status, 0, r.stderr || r.stdout);
    assert.ok(existsSync(join(dest, "CLAUDE.md")));
    assert.ok(existsSync(join(dest, H, "AGENTS.md")));
    assert.ok(existsSync(join(dest, H, "feature_list.json")));
    assert.ok(existsSync(join(dest, H, "scripts", "git-session.mjs")));
    assert.ok(existsSync(join(dest, H, "init.sh")));
    assert.ok(existsSync(join(dest, ".sddharness", "config.json")));
    assert.ok(existsSync(join(dest, ".cursor", "commands", "sddharness.md")));
    assert.ok(existsSync(join(dest, ".claude", "agents", "docs_filler.md")));
    assert.ok(existsSync(join(dest, ".cursor", "agents", "docs_filler.md")));
    assert.ok(!existsSync(join(dest, "feature_list.json")));
    assert.ok(!existsSync(join(dest, "AGENTS.md")));
  });

  it("docs still have TODO marker after install", () => {
    for (const f of ["architecture.md", "conventions.md", "verification.md"]) {
      const text = readFileSync(join(dest, H, "docs", f), "utf8");
      assert.ok(text.includes(MARKER), f);
    }
  });

  it("docs-ready.mjs exits 1 on stubs", () => {
    const r = spawnSync(
      process.execPath,
      [join(dest, H, "scripts", "docs-ready.mjs")],
      { cwd: dest, encoding: "utf8" }
    );
    assert.notEqual(r.status, 0);
  });

  it("slash command documents init, filldocs, write-spec — not execute", () => {
    const cmd = readFileSync(
      join(dest, ".cursor", "commands", "sddharness.md"),
      "utf8"
    );
    assert.match(cmd, /filldocs/);
    assert.match(cmd, /\/sddharness init/);
    assert.match(cmd, /write-spec/);
    assert.match(cmd, /\/sddharness task/);
    assert.match(cmd, /\/sddharness usage/);
    assert.doesNotMatch(cmd, /\/sddharness execute/);
  });

  it("repo config is local-only (verifyCmd), not executors", () => {
    const cfg = JSON.parse(
      readFileSync(join(dest, ".sddharness", "config.json"), "utf8")
    );
    assert.ok(!cfg.agents);
    assert.ok(!cfg.runtime);
    assert.ok("verifyCmd" in cfg);
  });

  it("copies herdr runtime scripts and documents config list", () => {
    assert.ok(existsSync(join(dest, H, "scripts", "herdr-agent.mjs")));
    assert.ok(existsSync(join(dest, H, "scripts", "config.mjs")));
    assert.ok(
      existsSync(join(dest, H, "scripts", "runtime", "providers", "claude.mjs"))
    );
    assert.ok(
      existsSync(join(dest, H, "scripts", "runtime", "providers", "codex.mjs"))
    );
    assert.ok(
      existsSync(join(dest, H, "scripts", "runtime", "providers", "cursor.mjs"))
    );
    assert.ok(
      existsSync(join(dest, H, "scripts", "runtime", "providers", "opencode.mjs"))
    );
    const cmd = readFileSync(
      join(dest, ".cursor", "commands", "sddharness.md"),
      "utf8"
    );
    assert.match(cmd, /config list/);
  });

  it("does not overwrite existing sddharness/AGENTS.md on second init", () => {
    const marker = "# CUSTOM AGENTS\n";
    writeFileSync(join(dest, H, "AGENTS.md"), marker);
    const r = spawnSync(process.execPath, [CLI, "init", dest], {
      encoding: "utf8",
    });
    assert.equal(r.status, 0, r.stderr || r.stdout);
    assert.equal(readFileSync(join(dest, H, "AGENTS.md"), "utf8"), marker);
  });

  it("validate passes on empty feature list", () => {
    const r = spawnSync(process.execPath, [CLI, "validate", dest], {
      encoding: "utf8",
    });
    assert.equal(r.status, 0, r.stderr || r.stdout);
  });
});

describe("docs-ready.mjs", () => {
  it("exits 0 when TODO markers removed", () => {
    const dir = mkdtempSync(join(tmpdir(), "docs-ready-"));
    try {
      mkdirSync(join(dir, H, "docs"), { recursive: true });
      mkdirSync(join(dir, H, "scripts"), { recursive: true });
      cpSync(
        join(KIT, "template", H, "scripts", "docs-ready.mjs"),
        join(dir, H, "scripts", "docs-ready.mjs")
      );
      for (const f of ["architecture.md", "conventions.md", "verification.md"]) {
        writeFileSync(
          join(dir, H, "docs", f),
          `# ${f}\n\nConteúdo real sem stub.\n`
        );
      }
      const r = spawnSync(
        process.execPath,
        [join(dir, H, "scripts", "docs-ready.mjs")],
        { cwd: dir, encoding: "utf8" }
      );
      assert.equal(r.status, 0, r.stdout + r.stderr);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("validate-features name rule", () => {
  it("rejects feature-1 (no zero-pad)", () => {
    const dir = mkdtempSync(join(tmpdir(), "harness-bad-"));
    try {
      mkdirSync(join(dir, H, "scripts"), { recursive: true });
      mkdirSync(join(dir, H, "specs"), { recursive: true });
      const validator = readFileSync(
        join(KIT, "template", H, "scripts", "validate-features.mjs"),
        "utf8"
      );
      writeFileSync(join(dir, H, "scripts", "validate-features.mjs"), validator);
      writeFileSync(
        join(dir, H, "feature_list.json"),
        JSON.stringify({
          project: "t",
          rules: { valid_status: ["pending"] },
          features: [
            {
              id: 1,
              name: "feature-1",
              title: "x",
              description: "y",
              acceptance: [],
              sdd: true,
              status: "pending",
            },
          ],
        })
      );
      const r = spawnSync(
        process.execPath,
        [join(dir, H, "scripts", "validate-features.mjs")],
        { cwd: dir, encoding: "utf8" }
      );
      assert.notEqual(r.status, 0);
      assert.match(r.stdout + r.stderr, /feature-01/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("allows two in_progress of the same epic", () => {
    const dir = mkdtempSync(join(tmpdir(), "harness-par-"));
    try {
      mkdirSync(join(dir, H, "scripts"), { recursive: true });
      mkdirSync(join(dir, H, "specs"), { recursive: true });
      writeFileSync(
        join(dir, H, "scripts", "validate-features.mjs"),
        readFileSync(join(KIT, "template", H, "scripts", "validate-features.mjs"), "utf8")
      );
      const feat = (id, name) => ({
        id,
        name,
        title: "x",
        description: "y",
        acceptance: [],
        sdd: false,
        status: "in_progress",
        jira_key: "PROJ-1",
        repo: id === 1 ? "api" : "web",
      });
      writeFileSync(
        join(dir, H, "feature_list.json"),
        JSON.stringify({
          project: "t",
          source: { type: "jira", key: "PROJ-1" },
          rules: { valid_status: ["in_progress"], max_parallel: 3 },
          features: [feat(1, "feature-01"), feat(2, "feature-02")],
        })
      );
      const r = spawnSync(
        process.execPath,
        [join(dir, H, "scripts", "validate-features.mjs")],
        { cwd: dir, encoding: "utf8" }
      );
      assert.equal(r.status, 0, r.stdout + r.stderr);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
