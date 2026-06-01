# Studio feature request: export an agent as a PWA

> **From**: the Tama team
> **To**: deco studio (mesh) maintainers
> **Status**: spec / request for comment

## Summary

Make any agent in Studio installable as a Progressive Web App with its own
icon, name, theme color, and entry point. Tapping the installed PWA opens
that specific agent's primary UI inside a chromeless Studio shell.

The killer use case: a person installs *their pet's agent* on their iPhone
home screen, *their plant-watering agent* on their desktop, etc. Today
they bookmark a URL; tomorrow they pin an app.

## Why this matters

Agent-per-purpose is becoming the default pattern in Studio. People are
building one-pet care agents (like Tama), one-house gardening agents,
one-team status agents. Each of these has a stable identity (a name, an
icon, a color) but lives behind a generic Studio URL today. The icon on
the home screen is the natural surface for that identity.

## What's there today

(All paths relative to `~/Projects/mesh`.)

- **Agent model** — agents are stored as `VIRTUAL` connections in
  `apps/mesh/src/storage/virtual.ts:30-44` with `id`, `title`,
  `description`, `icon`, `status`, plus organization scoping. Icons
  support `icon://<IconName>?color=<colorName>` with 16 named colors plus
  custom image URLs via `apps/mesh/src/web/components/agent-icon.tsx`.
- **Stable MCP URL** — `studio.decocms.com/mcp/virtual-mcp/<agentId>`
  (canonical) and legacy `/mcp/gateway/<agentId>`. Routed via
  `apps/mesh/src/api/routes/virtual-mcp.ts:31-100`.
- **A static manifest** at `apps/mesh/public/manifest.webmanifest` with
  `display: "standalone"` + `display_override: ["window-controls-overlay"]`.
  This covers Studio itself as a PWA, but not individual agents.
- **Tool UI inlining** — tools declare `ui://…` resources via MCP `_meta`
  and `MCPAppRenderer` (`apps/mesh/src/mcp-apps/types.ts:16-42`) renders
  them in `collapsed | expanded | view | fullscreen` modes.

## Gaps we hit

1. The `manifest.webmanifest` is static and global — there's no per-agent
   manifest generation, so every agent shares Studio's name/icon when
   pinned.
2. No service worker registered at the studio origin → most browsers
   fail the installability check (Chrome/Edge require an `install` event
   path, which requires an SW).
3. No agent-detail web route. The `agents-list` page exists
   (`apps/mesh/src/web/routes/agents-list.tsx`) but there's no
   `/orgs/<org>/agents/<id>` URL for `start_url` to point at.
4. No "Install as app" UI; no `beforeinstallprompt` handler buttoning the
   experience.
5. No way for a tool to declare itself the agent's homepage. We need a
   "this tool is the PWA entry point" flag.

## Proposed surface

### 1. Dynamic per-agent manifest

A worker route at `studio.decocms.com/agents/<agentId>/manifest.webmanifest`
that builds a manifest from the agent row:

```json
{
  "name": "<connection.title>",
  "short_name": "<connection.title (truncated)>",
  "description": "<connection.description>",
  "start_url": "/agents/<agentId>",
  "scope": "/agents/<agentId>/",
  "display": "standalone",
  "display_override": ["window-controls-overlay", "standalone"],
  "background_color": "<agent.color or default>",
  "theme_color": "<agent.color or default>",
  "icons": [
    { "src": "/agents/<agentId>/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/agents/<agentId>/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

For `icon://<Name>?color=...` icons, render to PNG at the two required
sizes on-demand or via a build step. For custom-URL icons, proxy through
to apply the standard sizes.

### 2. Service worker at studio origin

A minimal SW that:

- Pre-caches the agent shell HTML + critical assets on install.
- Routes navigation requests under `/agents/<agentId>/*` through a
  network-first strategy with offline fallback.
- Reuses Studio's existing push subscription plumbing.

The SW does NOT need to be agent-aware — it can serve any agent — but
the install prompt's `beforeinstallprompt` is scoped per-agent via the
distinct `start_url`.

### 3. Agent detail web route

A new SPA route `/agents/<agentId>` whose default view is the agent's
primary UI resource in fullscreen mode. Reuse the existing
`MCPAppRenderer` with `display: "fullscreen"`.

When no primary UI is declared (see point 5), default to the chat
surface for that agent.

### 4. "Install" call-to-action

On `/agents/<agentId>`, surface an Install button that:

- Listens for `beforeinstallprompt` and stores the event.
- Renders a small chip in the header when the event is available.
- Triggers `prompt()` on click.

On iOS where `beforeinstallprompt` is unsupported, fall back to a
helper modal explaining the Add-to-Home-Screen flow with screenshots.

### 5. Primary UI declaration

A small schema bump in tool MCP `_meta` to add an optional `ui.primary:
true` flag. When set on exactly one tool's UI resource per agent, that
tool's `ui://` URI becomes the `/agents/<agentId>` default view. Today
Tama would set it on the dashboard tool; another agent might set it on
its chat thread.

```ts
// Example in a tool definition
createTool({
  id: "dashboard",
  _meta: { ui: { resourceUri: "ui://myvet/main", primary: true } },
  // ...
});
```

## Out of scope (for v1 of this request)

- Offline-first behavior beyond the shell cache. The agent's MCP calls
  go through Studio's API and stay online-required.
- Deep-link routing into specific tools (`/agents/<id>/tools/<toolId>?...`).
  Useful, but separable.
- Cross-agent unified launcher inside the PWA.

## Acceptance

When this lands, the Tama agent should be installable as follows:

1. Owner finishes the adopt flow and deploys their tama worker.
2. They register the deployed `/mcp` endpoint as an agent in Studio.
3. They visit `studio.decocms.com/agents/<their-tama-id>`.
4. They see an Install button (or use iOS share sheet → Add to Home).
5. The pinned icon shows *their pet's name* (e.g. "Beto") and color.
6. Tapping it opens the dashboard at `start_url`, no browser chrome.
7. The Tama worker's push notifications still fire and land in the PWA.

## Implementation hints

- The icon-rendering work can lean on `web/components/agent-icon.tsx`'s
  existing `icon://` parser. A 512×512 raster of a named-icon-plus-color
  can be a build-time generated SVG → PNG via `sharp` or runtime via a
  Workers AI image route.
- The service worker can be a copy of any well-known minimal SW
  (Workbox or hand-rolled ~50 LOC). The cache key includes the agent
  id so an uninstall of one agent doesn't blow others away.
- The `primary` flag survives existing MCP clients gracefully (clients
  that don't care just ignore unknown `_meta` keys).

## Related: AGENTS.md convention

This request is paired with `docs/studio-agents-md-convention.md` — a
proposal that Studio's "Import from GitHub" flow should look for an
`AGENTS.md` at the repo root and treat it as setup instructions for the
coding agent. The two together would close the loop: import → adopt →
deploy → install as PWA, all driven from inside Studio.
