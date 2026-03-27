# Frontend State Store Refactor

> Current shipped frontend boundary contract lives in `docs/frontend-chat-architecture.md`.
> This note records the original store-focused refactor rationale and scope.
> Follow-up work has since added `static/chat/composer-store.js` for composer draft / attachment / pending-send state; keep this note as historical rationale for the first shell-state pass.

## Goal

Keep the current chat UI and interaction model intact while reducing coupling between:

- HTTP and WebSocket invalidation logic
- session catalog / active-session state
- DOM rendering concerns
- future test coverage for state transitions

This round does **not** rewrite the UI. It introduces a small canonical client store for the main session/navigation state so the existing frontend can keep rendering the same surface with fewer cross-file implicit writes.

## Why this first

The current frontend already has a strong server contract:

- HTTP is canonical state
- WebSocket mostly signals invalidation
- message rendering already consumes server-projected `DisplayEvent[]`

What remains messy is mostly client-side mutation flow. Session list refreshes, active-session selection, archive toggles, and optimistic updates are spread across several files and often update global variables directly.

The highest-leverage first step is therefore:

1. introduce one explicit frontend store for session/navigation state
2. route HTTP/WS write paths through store actions
3. keep UI files mostly as renderers over the current state snapshot

## Scope of this round

This round focuses on the state that drives the main chat shell:

### Canonical remote-backed state

- `sessions`
- `currentSessionId`
- `hasAttachedSession`
- `hasLoadedSessions`
- `archivedSessionCount`
- `archivedSessionsLoaded`
- `archivedSessionsLoading`
- `sessionStatus`

### Local navigation state

- `activeSourceFilter`
- `activeTab`

### Explicitly out of scope for this round

- composer draft/image state
- settings/tooling refactors
- message timeline render virtualization
- replacing the current DOM rendering style

Those can move later once session/navigation state no longer leaks across the codebase.

## New boundary

### Store/model layer

`static/chat/session-store.js`

Owns pure state transitions for:

- replacing active session lists
- replacing archived session lists
- upserting one session
- selecting the current session
- toggling loading flags
- syncing source filter / sidebar tab

This file should stay DOM-free and side-effect-free so it can be tested with plain Node `vm` tests.

### Sync layer

- `static/chat/session-http.js`
- `static/chat/session-http-list-state.js`
- `static/chat/realtime.js`

These files fetch data, normalize server payloads, dispatch store actions, and then call existing UI refresh helpers.

### Render layer

- `static/chat/session-list-ui.js`
- `static/chat/ui.js`
- `static/chat/session-surface-ui.js`
- `static/chat/realtime-render.js`

These should increasingly read current state and render it, rather than owning cross-module state mutations.

## Action contract for this round

The store should be the preferred write path for:

- `replace-active-sessions`
- `replace-archived-sessions`
- `upsert-session`
- `set-current-session`
- `set-archived-sessions-loading`
- `set-active-source-filter`
- `set-active-tab`
- `set-session-status`
- `replace-state`

The immediate intent is not “Redux everywhere”. The intent is just to make the mutable contract explicit and testable.

## Testing strategy

For now, keep the existing lightweight frontend test style:

- plain Node scripts
- `vm.runInNewContext(...)`
- no browser runtime dependency
- no new bundler or framework requirement

Why not add a dedicated test framework yet:

- the repo already has a working pattern for pure frontend model tests
- the split frontend is non-module global-script code, so the current `vm` approach matches shipped reality closely
- introducing a framework now would add tooling churn before the state seam itself is stable

Once more logic has moved behind pure store/selectors, re-evaluating a more ergonomic test runner becomes easier and lower-risk.

## Expected follow-up phases

### Phase 1

- land the store
- move session/navigation write paths onto store actions
- add focused reducer tests

### Phase 2

- add selector helpers for render files
- reduce direct reads of scattered globals
- make list/header empty states easier to test

### Phase 3

- isolate composer state into its own model
- move settings/tooling off the chat core state path

### Phase 4

- optionally revisit a higher-level test runner or rendering abstraction if it still buys enough value

## Success criteria for this round

- the current UI still behaves the same for normal chat usage
- session catalog mutations have one explicit state seam
- HTTP/WS code no longer hand-edits the main session globals in multiple places
- store logic is covered by focused pure tests
- the refactor plan lives in-repo so later iterations can continue from a stable reference
