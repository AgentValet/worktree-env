# worktree-env

Give every git worktree the env files from your main checkout.

`.env` files are gitignored, so a new worktree starts without them. When you run several AI coding agents in parallel (Claude Code, Codex, Orca, Conductor and others), each one gets a fresh worktree, and none of them can boot your app until someone copies the secrets across. Then the copies drift.

`worktree-env` links them instead. Your main checkout keeps the only real copy. Every worktree points at it.

```sh
cd path/to/a/worktree
npx github:AgentValet/worktree-env
```

```
linked    .env
linked    apps/api/.env
linked    apps/web/.env.local
```

No config, no dependencies. Node 18+.

## What it does

1. Finds the main checkout from the worktree you're in.
2. Finds every gitignored `.env`, `.env.*` and `.dev.vars` file there. It skips templates (`.env.example`, `.env.sample`) and backups (`.env.bak`), and anything in `node_modules`.
3. Symlinks each one into the same path in this worktree.

It's careful:

- It never overwrites a file that already exists (unless you pass `--force`).
- It won't write a file the worktree doesn't gitignore, so secrets can't end up in a commit.
- It's safe to run again: files already linked report `ok`.
- If Windows refuses the symlink (it needs Developer Mode on), it copies the file instead and tells you.

## Agent mode: don't hand your agents every key

Linking gives each agent's worktree every secret your main checkout has. For an agent, that's usually more than it needs. A coding agent with your live Stripe key can spend money with it.

Agent mode writes a filtered copy that holds only the keys you allow:

```json
// .worktree-env.json, committed at the repo root
{
  "agent": { "keep": ["AGENTVALET_*", "NODE_ENV", "PORT", "DATABASE_URL"] }
}
```

```sh
npx github:AgentValet/worktree-env --agent
# or set WORKTREE_ENV_AGENT=1 in the agent's environment
```

Keys support `*` and `?` wildcards. Comments and every other key are left out. Run it again to refresh: it rewrites its own copies without `--force`.

What the agent still needs to call APIs is better handled by a credential broker than by keys in a file. That's what we build at [AgentValet](https://agentvalet.ai): the agent holds one token, and every call it makes is scoped, approved where needed, and logged.

## Run it automatically for every new worktree

Make it your tool's worktree setup command:

| Tool | Where |
|---|---|
| Orca | Repo settings → Setup script: `pnpm install && npx -y github:AgentValet/worktree-env` |
| Claude Code, Codex, others | Add the command to your project's setup steps, or tell the agent to run it first in a new worktree |
| Plain git | A `post-checkout` hook, or run it once after `git worktree add` |

## Options

```
worktree-env [link]   Link env files from the main checkout into this worktree
worktree-env status   Show what each env file in this worktree points at

--agent     Write filtered copies holding only the keys in agent.keep
--copy      Copy instead of symlinking
--force     Replace env files that already exist here
--dry-run   Print what would happen, change nothing
```

## Config

Optional. Put `.worktree-env.json` at the repo root.

```json
{
  "files": [".env", "apps/api/.env", "apps/worker/.dev.vars"],
  "agent": { "keep": ["AGENTVALET_*", "NODE_ENV"] }
}
```

- `files`: the exact files to share. Without it, they're discovered automatically. Listing them skips the scan, which is faster in big repos.
- `agent.keep`: the keys agent mode keeps. Agent mode refuses to run without it.

## Licence

MIT
