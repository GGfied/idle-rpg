---
name: hosting-workers-builds
description: Deploy path chosen by the user: Cloudflare Workers Builds with static assets, no GitHub deploy workflow
metadata:
  type: project
---
Build `npm run build`, deploy `npx wrangler deploy`, non-prod `npx wrangler versions upload`, NODE_VERSION=20.18.1. Config in /wrangler.jsonc (assets.directory ./dist, SPA fallback). `_headers` in public/ is honoured by Workers assets.
**Why:** the user connected the repo via the Workers flow on 2026-10-08. **How to apply:** CI workflow only checks; never add a deploy job or secrets.
