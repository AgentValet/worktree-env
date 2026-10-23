import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { discoverEnvFiles, filterEnv, link } from "../bin/worktree-env.mjs";

const quiet = () => {};

function git(cwd, ...args) {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}

function setup(config) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "worktree-env-"));
  const main = path.join(root, "main");
  fs.mkdirSync(path.join(main, "apps", "api"), { recursive: true });
  git(main, "init", "-q", "-b", "main");
  fs.writeFileSync(path.join(main, ".gitignore"), ".env\n**/.env\n**/.env.*\n!**/.env.example\nnode_modules\n");
  fs.writeFileSync(path.join(main, ".env.example"), "API_KEY=\n");
  if (config) fs.writeFileSync(path.join(main, ".worktree-env.json"), JSON.stringify(config));
  git(main, "add", ".");
  git(main, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "init");
  fs.writeFileSync(path.join(main, ".env"), "API_KEY=not-a-real-key\nAGENTVALET_TOKEN=av_123\nNODE_ENV=development\n");
  fs.writeFileSync(path.join(main, "apps", "api", ".env.local"), "DB_URL=postgres://x\n");
  fs.writeFileSync(path.join(main, ".env.bak.1"), "OLD=1\n");
  fs.mkdirSync(path.join(main, "node_modules", "pkg"), { recursive: true });
  fs.writeFileSync(path.join(main, "node_modules", "pkg", ".env"), "IGNORED=1\n");
  const wt = path.join(root, "wt");
  git(main, "worktree", "add", "-q", wt);
  return { main, wt };
}

test("discovers gitignored env files and skips templates and node_modules", () => {
  const { main } = setup();
  assert.deepEqual(discoverEnvFiles(main), [".env", "apps/api/.env.local"]);
});

test("links env files into a new worktree", () => {
  const { main, wt } = setup();
  const results = link({ cwd: wt, log: quiet });
  for (const r of results) assert.match(r.action, /^(linked|copied)$/);
  assert.equal(fs.readFileSync(path.join(wt, ".env"), "utf8"), fs.readFileSync(path.join(main, ".env"), "utf8"));
  assert.ok(fs.existsSync(path.join(wt, "apps", "api", ".env.local")));
});

test("running twice is safe and leaves existing files alone", () => {
  const { wt } = setup();
  link({ cwd: wt, log: quiet });
  const again = link({ cwd: wt, log: quiet });
  for (const r of again) assert.match(r.action, /^(ok|exists)$/);
});

test("does nothing in the main checkout", () => {
  const { main } = setup();
  assert.deepEqual(link({ cwd: main, log: quiet }), []);
});

test("agent mode keeps only allow-listed keys", () => {
  const { wt } = setup({ files: [".env"], agent: { keep: ["AGENTVALET_*", "NODE_ENV"] } });
  link({ cwd: wt, agent: true, log: quiet });
  const text = fs.readFileSync(path.join(wt, ".env"), "utf8");
  assert.match(text, /AGENTVALET_TOKEN=av_123/);
  assert.match(text, /NODE_ENV=development/);
  assert.doesNotMatch(text, /not-a-real-key/);
  // a second agent run refreshes its own copy without --force
  assert.equal(link({ cwd: wt, agent: true, log: quiet })[0].action, "filtered");
});

test("agent mode without a keep list is refused", () => {
  const { wt } = setup();
  assert.throws(() => link({ cwd: wt, agent: true, log: quiet }), /agent.*keep/);
});

test("skips files that are not gitignored", () => {
  const { main, wt } = setup({ files: ["config.env"] });
  fs.writeFileSync(path.join(main, "config.env"), "X=1\n");
  assert.equal(link({ cwd: wt, log: quiet })[0].action, "unignored");
  assert.ok(!fs.existsSync(path.join(wt, "config.env")));
});

test("filterEnv handles export, quotes and multi-line values", () => {
  const text = 'export AV_TOKEN="a"\n# comment\nSECRET=x\nAV_CERT="line1\nline2"\nOTHER=y\n';
  assert.deepEqual(filterEnv(text, ["AV_*"]), ['export AV_TOKEN="a"', 'AV_CERT="line1', 'line2"']);
});
