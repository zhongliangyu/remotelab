# Core Domain Contract

> Status: working contract for the next refactor cycle.
> Goal: freeze the core concepts before implementation work gets split across multiple sessions.

---

## Why This Exists

RemoteLab has been carrying several overlapping mental models at once:

- session-centric chat
- app-centric policy/template flows
- owner vs visitor branching
- share snapshots as a separate feature line
- sidebar/progress state as a parallel view of the same work

That overlap is now the main source of architectural drift.

This note intentionally chooses a simpler center of gravity:

- **Session is the primary product object**
- **Run is an operational child of a session, not a competing product primitive**
- **App is a reusable scope/policy dimension attached to sessions**
- **Share is a separate read-only publication object**
- **Sidebar/progress state is derived UI state, not domain truth**

---

## Product Stance

The product is not evolving toward a multi-user collaboration suite with rich account management.

The near-term product remains:

- one machine owner with full authority
- one default built-in app for the owner's normal RemoteLab console
- optional additional apps that create narrower entry surfaces
- optional external access to those apps or to read-only shares

So the contract should stay simple, but it still needs enough structure to avoid role-specific hacks spreading everywhere.

---

## Canonical Objects

### 1. Session

**Session is the primary canonical object.**

A session is one conversation thread with the AI worker.

It owns:

- conversation history
- session presentation metadata
- archive state
- its associated app dimension
- who initiated it
- which run is currently active

It does **not** own reusable app definition, share publication state, or the transient mechanics of in-flight execution.

Short form:

```text
session = one durable conversation thread
```

Operational rules:

- a session can exist with no active run
- a session can outlive many runs
- a session is the main thing users browse, rename, group, archive, open, and revisit

Most importantly:

- **all user-visible durable facts should converge into session-owned truth**

That means if a run discovers or produces something that matters for later reading, it should end up in one of these places:

- the session event/history log
- session-level derived metadata
- artifacts that are referenced from session-visible events

This is the cleanest version of the session-centric stance:

- session is where humans return to understand what happened
- run is not allowed to become a parallel product-history universe

Recommended minimum fields:

- `id`
- `appId`
- `createdByPrincipalId`
- `name`
- `group`
- `description`
- `createdAt`
- `updatedAt`
- `archivedAt` or `archived`
- `activeRunId`
- `latestSeq` / history pointers as derived metadata

### 2. Run

**Run is a child operational object of a session.**

The important correction is this:

- a run is **not merely a cache layer**

It is the durable record for one assistant work cycle under a session.

Usually that means one user submission leading to one AI reply cycle, but the same shape can also cover:

- resume after interruption
- explicit compact operations
- drop-tool / maintenance actions when they require model work

Run owns the mechanics that the session should not directly absorb:

- in-flight execution state
- request deduplication / request identity
- cancel / resume / finalize lifecycle
- tool + model + reasoning config used for that turn
- spool / partial output / exit outcome
- run-scoped artifacts and usage data

Short form:

```text
run = one operational execution attempt for a session turn
```

Design stance:

- **product-primary:** no
- **architecturally real:** yes
- **UI-visible when useful:** sometimes

So the product can keep run mostly hidden, while the backend still treats it as a real first-class operational boundary.

The best way to reconcile the product view and the runtime view is:

- **session owns durable conversational truth**
- **run owns operational execution truth**

In practice, that means:

- raw spool, cancel state, partial execution details, request identity, and sidecar coordination can live under run
- but anything the product wants to preserve as conversation truth should be normalized back into session history or session metadata

So run is not “just cache”, but it also should not accumulate product-visible facts that never flow back into session.

This is important because if run gets downgraded to “just cache”, the project will later lose a clean home for:

- restart recovery
- cancellation semantics
- duplicate-submit protection
- per-turn usage accounting
- per-turn artifacts
- sidecar execution state

Recommended minimum fields:

- `id`
- `sessionId`
- `requestId`
- `state`
- `tool`
- `model`
- `effort`
- `startedAt`
- `finalizedAt`
- `result`
- `usage`

### 3. App

**App is a reusable scope/policy/presentation dimension above sessions.**

An app is not the conversation itself.

An app answers questions like:

- which entry surface is this?
- what bootstrap prompt or instructions apply?
- what welcome framing should be shown?
- what defaults or restrictions shape sessions created under this app?

Short form:

```text
app = reusable session scope/policy definition
```

Important consequence:

- the default owner console is also an app

So there should be a built-in default app, even if it is mostly implicit in the UI.

That keeps the model consistent:

- normal owner chat is not a special exception
- it is the default app surface

App should own:

- reusable bootstrap/policy fields
- presentation defaults
- sharing/access settings for sessions created through it

App should **not** own:

- live session history
- active execution state
- run spools/results

Recommended minimum fields:

- `id`
- `slug` or stable name
- `title`
- `systemPrompt`
- `welcomeMessage`
- `defaultTool` / tool policy if needed
- `visibility` / access mode
- `createdAt`
- `updatedAt`

Product-shape clarification:

- in the backend/domain model, app is still a real object
- in the frontend/product expression, app can often feel like a session dimension or filter

That is a good simplification as long as the project does **not** flatten app into a bare string field with no reusable definition behind it.

The right compromise is:

- sessions carry `appId`
- the UI can filter or preselect by app
- the backend still keeps a reusable app record with policy/defaults/sharing config

### 4. Principal

This note deliberately uses **principal** instead of **user** for the core contract.

Reason:

- “user” makes the system sound like it already has or wants a full account model
- today the project really needs an access/identity subject, not a full user-management product

Short form:

```text
principal = whoever is acting through a session/app surface
```

In practice, v1 can stay simple:

- one owner principal with global authority
- optional app-scoped non-owner principals for sessions created through shared app surfaces

This preserves the simplification you want:

- no need for a separate product-facing “visitor” concept

But it avoids a trap:

- the capability distinction still exists, even if the product stops calling it visitor

So the recommendation is:

- remove `visitor` as a product concept
- keep a principal/access-scope concept in the domain model

Recommended minimum fields:

- `id`
- `kind`
- `appScope` if applicable
- `createdAt`

### 5. Share Snapshot

**Share is a separate publication object.**

This part of your proposal is directionally right:

- share should not be collapsed into session/app auth logic
- it should be a standalone read-only publication flow

But there is one important correction:

- share still needs a first-class record, even if the UI is “just a page”

Why:

- it needs a stable id
- it needs an immutable content boundary
- it needs revocation / expiry policy
- it needs to remain understandable even if the source session keeps moving

Recommended model:

```text
shareSnapshot = read-only published view of session events up to a frozen boundary
```

That boundary should normally be expressed as:

- `sessionId`
- `maxSeq`
- optional `minSeq` if partial-range shares become useful later

This gives the “no physical copy unless needed” behavior you want, while still making the contract explicit.

Recommended minimum fields:

- `id`
- `sessionId`
- `maxSeq`
- optional `minSeq`
- `createdByPrincipalId`
- `createdAt`
- `revokedAt`

---

## Explicitly Derived, Not Canonical

The following should be treated as derived surfaces, not core truth:

- sidebar summary / progress state
- session list grouping and sorting views
- unread markers
- session badges
- cross-session rollups

This means the current sidebar summary system can be deprecated later without forcing another domain-model rewrite.

That is the right place for it:

- optional
- derived
- replaceable

---

## Recommended Relationships

```text
App 1 --- N Session
Principal 1 --- N Session
Session 1 --- N Run
Session 1 --- N ShareSnapshot
```

Interpretation:

- every session belongs to one app
- every session has one initiating principal
- every session can accumulate many runs across time
- every session can generate zero or more shares

---

## Access Model (Simple v1)

To stay close to the current product while cleaning up the model:

### Owner principal

- can see all apps
- can create/manage all apps
- can see all sessions
- can create/revoke all shares

### App-scoped non-owner principal

- enters through one app surface
- can create sessions under that app
- can access only the sessions allowed by that app scope
- cannot manage global app configuration

Recommended v1 visibility rule:

- by default, a non-owner principal sees only sessions under the current app that were created by that same principal

This keeps the model tight and avoids accidentally sliding into a full multi-user collaboration surface before the product is ready.

### Public share access

- no app login required
- read-only
- only sees the published share snapshot

This is the clean replacement for hard-coding “owner vs visitor” everywhere.

The distinction still exists, but the model is now:

- owner principal
- app-scoped principal
- public share reader

instead of:

- one-off role branches leaking through unrelated modules

---

## Important Challenges To The Proposed Simplification

### Challenge 1 — “Run is just cache” is too weak

I do **not** recommend locking that wording into the architecture.

It sounds simple, but it removes the clean home for the hardest runtime problems.

The safer contract is:

- **session is the product object**
- **run is the operational execution object**

That keeps the product centered on sessions without flattening away the execution boundary.

### Challenge 2 — Query param should not become authority

Using a query like `?appId=` is fine for:

- filtering
- preselecting an app
- opening a specific app surface

But it should **not** be the canonical thing that decides permissions or reinterprets a session.

The server-owned truth must still be:

- `session.appId`
- principal access scope
- app policy

So the right framing is:

- query param is **navigation state**
- app/session metadata is **domain state**

This still leaves room for the product shape you described:

- `?appId=` can preselect the app surface
- owner can use app/user filters in the UI
- non-owner can be restricted to the current app scope

But all of that remains a UI/navigation layer over server-enforced access rules.

### Challenge 3 — “No visitor concept” is good product language, but not enough as a data model

I agree with removing visitor as a product-level abstraction.

I do **not** agree with removing the access subject distinction entirely.

If the project only says “everything is just a user now”, the missing capability boundary will come back later as ad hoc flags.

So the cleaner move is:

- drop the visitor terminology
- keep the principal/access-scope concept

If the product later wants to look more like an account system, that can be added incrementally.

The safe sequence is:

1. start with owner principal + simple app-scoped non-owner principals
2. optionally let one shared app use a shared principal as a lightweight demo/trial path
3. only later promote that into a heavier stable user-account model if the product truly needs it

That preserves the product simplicity you want without forcing the backend to pretend that all access subjects are equivalent.

### Challenge 3.5 — Permission control cannot be delegated to the model

This is one place where I want to push back hard.

The model can help with:

- workflow decisions
- presentation
- guidance
- app-specific behavioral norms

But authority must remain server-owned.

The server must still enforce:

- which principal can see which sessions
- which app a principal can enter
- whether a share is readable
- whether an archived session remains externally accessible

If permission control is treated as “mostly something the model decides”, the architecture will become unsafe and hard to reason about.

So the right split is:

- **model controls behavior inside granted scope**
- **server controls scope boundaries**

### Challenge 4 — Archive should not secretly become the only share revocation model

Your safety instinct is good, but there is a modeling risk here.

If archive means both:

- “hide/retire this session from the main UI”
- and “revoke all public visibility for security reasons”

then one field is carrying two unrelated meanings.

Recommendation:

- in v1, it is acceptable to block share access when the source session is archived if that keeps things safe
- but the contract should still reserve a separate share revocation path

Otherwise archive becomes semantically overloaded.

### Challenge 5 — Grouping can replace part of sidebar summary, but not necessarily all of it

I agree that sidebar summary should be demoted from “core architecture” to “optional derived UI”.

I do **not** fully agree that grouping/sorting is guaranteed to replace all of its value.

They solve overlapping but different problems:

- grouping/sorting = organization
- summary/progress = derived situational awareness

So the right current stance is:

- do not design the core model around sidebar summary
- keep it removable
- but do not assume its use case disappears automatically

---

## Working Contract To Use For The Next Refactor

If we need one compact version to guide implementation, it should be this:

### Canonical

- `Session` = primary durable conversation object
- `Run` = per-turn operational execution object under a session
- `App` = reusable scope/policy/presentation layer for session creation
- `Principal` = actor/access subject
- `ShareSnapshot` = standalone read-only publication record over a frozen session range

### Derived / Replaceable

- sidebar summary
- progress rollups
- grouping/sorting views
- UI filter state such as current app tab/query

### Rules

- every session belongs to exactly one app
- every session has exactly one initiating principal
- runs belong to sessions, not to apps directly
- shares belong to sessions, not to apps directly
- all user-visible durable facts should converge back into session-owned truth
- query params can select/filter app surfaces but do not define authority
- owner may filter by app and principal; non-owner scope is server-filtered by principal and app
- archive is session lifecycle state; share revocation should remain separately representable
- model behavior is not an authorization boundary

---

## Immediate Implementation Consequences

This contract implies the following high-level refactor direction:

1. Stop treating default chat as app-less; give it an implicit built-in app.
2. Reframe `visitor` handling into principal/app-scope handling.
3. Keep run as a real backend boundary even if the UI hides it.
4. Keep share as a separate public-read object with a frozen event boundary.
5. Treat sidebar/progress as fully derived and removable.
6. Let the UI expose app/principal filtering mainly for owner/admin surfaces rather than making it part of the core permission model.
7. Keep permission checks in server code even if product copy downplays the access model.

---

## Open Questions Still Worth Settling

These are the remaining sharp edges that should be decided before heavy implementation:

1. Do app-scoped non-owner principals keep a stable identity across visits, or is each app entry a fresh principal?
2. Can non-owner principals see only their own sessions, or all sessions under the same shared app?
3. Should the built-in default app be materialized in storage, or treated as an implicit reserved id?
4. When a share snapshot is created, do we guarantee future readability from referenced event storage, or do we materialize data if old event bodies are later compacted?
5. Is archive allowed to revoke share access in v1, or should share revocation be explicit from day one?

Until these are decided, the contract above is still stable enough to guide decomposition work.
