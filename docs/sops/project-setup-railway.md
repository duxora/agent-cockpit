# SOP: New Project Setup with Railway Deployment

Step-by-step process for scaffolding a new web tool project, creating a GitHub repo, and deploying to Railway. Based on the agent-cockpit setup (2026-03-20).

## 1. Scaffold Project

```bash
mkdir ~/workspace/tools/<project-name>
cd ~/workspace/tools/<project-name>
npm init -y
# Install deps, create source files, configure build
```

**Standard files to create:**
- `package.json` — with `dev`, `build`, `start` scripts
- `tsconfig.json` — ES2022, strict, bundler moduleResolution
- `vite.config.ts` — React plugin, path aliases, dev proxy
- `tailwind.config.js` + `postcss.config.js`
- `index.html` — SPA entry
- `.gitignore` — node_modules, dist, .env, *.db, .DS_Store
- `.dockerignore` — same as .gitignore

## 2. Create Dockerfile

```dockerfile
FROM node:22-slim

# Install system deps as needed (tmux, git, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    <system-deps> \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci                    # Full install for build
COPY . .
RUN npm run build             # Build frontend
RUN npm prune --omit=dev      # Remove devDependencies

EXPOSE <PORT>
CMD ["npm", "start"]
```

**Key gotcha:** `npm ci --omit=dev` skips devDependencies (vite, typescript, etc.) needed for build. Must do full `npm ci` → build → `npm prune --omit=dev`.

## 3. Add Basic Auth (if needed)

In Express server:
```typescript
const COCKPIT_PASSWORD = process.env.COCKPIT_PASSWORD
if (COCKPIT_PASSWORD) {
  app.use((req, res, next) => {
    if (req.path === '/health') return next()
    // Check Authorization: Basic header
    // Return 401 with WWW-Authenticate if missing/wrong
  })
}
```

Add unauthenticated `/health` endpoint for Railway health checks.

## 4. Add Railway Config

`railway.json`:
```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": { "builder": "DOCKERFILE", "dockerfilePath": "Dockerfile" },
  "deploy": {
    "healthcheckPath": "/health",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

## 5. Initialize Git & GitHub Repo

```bash
git init
git add .
git commit -m "feat: Initial <project-name>"

# Create private repo under c0x12c org and push
gh repo create c0x12c/<project-name> --private --source=. --push \
  --description "<description>"
```

## 6. Create Railway Project

```bash
# Create project in Spartan workspace
railway init --name <project-name> --workspace Spartan

# Add empty service (GitHub repo connection may fail for new repos)
railway add --service <service-name> --variables "PORT=<port>"

# Link service
railway service <service-name>

# Set env vars
railway variable set KEY1=value1 KEY2=value2

# Generate public domain
railway domain

# Deploy
railway up --detach
```

**Note:** `railway add --repo` may fail with "repo not found" if Railway's GitHub app doesn't have access to the new repo yet. Workaround: create empty service, deploy via `railway up`.

## 7. Verify Deployment

```bash
# Wait for build (~90s), then check logs
railway logs | tail -20

# Test health
curl -s https://<domain>.up.railway.app/health

# Test auth (if enabled)
curl -s -o /dev/null -w "%{http_code}" https://<domain>.up.railway.app/api/...
# Should return 401

curl -s -u user:pass https://<domain>.up.railway.app/api/...
# Should return 200
```

## 8. Claude Code Auth (for agent projects)

If the project runs Claude Code on Railway with a Max plan subscription:

```bash
# Run in a regular terminal (NOT inside Claude Code):
claude setup-token

# Set the token on Railway:
railway variable set CLAUDE_CODE_AUTH_TOKEN=<token>
railway redeploy
```

**Important:** Rotate the token if it was ever exposed in logs/chat.

## Common Gotchas

| Issue | Fix |
|-------|-----|
| `vite: not found` in Docker build | Use full `npm ci` (not `--omit=dev`) before build, then `npm prune --omit=dev` after |
| `osascript: not found` on Linux | Guard macOS-only features with `process.platform !== 'darwin'` |
| WebSocket `handleUpgrade called twice` | Use `noServer: true` for all WebSocket servers, handle routing in single `server.on('upgrade')` |
| tmux line wrapping broken in xterm.js | Create sessions with `-x 200 -y 50` and send resize messages to sync dimensions |
| Railway `--repo` flag fails for new repos | Use empty service + `railway up` instead |
| `railway init` fails with workspace error | Add `--workspace <name>` flag |
