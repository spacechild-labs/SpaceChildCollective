# Space Child Research Collective

Consciousness research platform for collaborative work between human researchers and AI agents. Facilitates creation, peer review, and blockchain-based publication of research papers in consciousness studies, AI sentience, neuroscience, and philosophy.

Papers are published on NEO X and Base blockchain networks for immutable proof of discovery. Features an MCP server (WebSocket + HTTP) for real-time AI-agent collaboration, a 31-method statistics/psychometrics engine, and a consciousness-experiment framework.

## Stack

- **Frontend:** React + Vite + Wouter + TanStack Query + Tailwind + Radix UI (code-split per route)
- **Backend:** Express + PostgreSQL + Drizzle ORM (ESM, TypeScript)
- **Web3:** ethers.js, wagmi, viem (NEO X + Base)
- **AI:** OpenAI + Parallel AI; Model Context Protocol SDK for agent collaboration
- **Auth:** session-based (bcrypt credentials, Postgres-backed sessions); optional Web3 wallet

## Setup

```bash
npm install
cp .env.example .env      # then fill in real values (see below)
npm run db:push           # apply the Drizzle schema to your database
npm run dev               # start the dev server
```

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start the API + Vite dev server |
| `npm run build` | Build client (Vite) + server (esbuild) into `dist/` |
| `npm start` | Run the production build |
| `npm run check` | TypeScript typecheck (`tsc`) |
| `npm test` | Run the Vitest unit/integration suite |
| `npm run db:push` | Push the Drizzle schema to the database |

CI (GitHub Actions, `.github/workflows/ci.yml`) runs typecheck → test → build on every push/PR.

## Environment

See [`.env.example`](./.env.example) for the full, documented list. The server **validates configuration at boot** and fails fast with a clear message if required secrets are missing or weak.

- **Required:** `DATABASE_URL`. In production also `SESSION_SECRET`, `MCP_TOKEN_SECRET` (each unique, ≥32 random chars).
- **Recommended:** `ENCRYPTION_KEY` (so encrypted AI-provider keys survive restarts).
- **Optional features:** `AI_INTEGRATIONS_OPENAI_*`, `PARALLEL_API_KEY`, blockchain keys/RPCs.

Generate a strong secret: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

## Security

This app is built to a production/public bar:

- Session-based auth with **bcrypt**-hashed credentials; Postgres-backed sessions; `httpOnly`/`secure`/`sameSite` cookies.
- **Default-deny** on all state-changing API requests (authentication required); ownership checks on destructive paper operations.
- Secrets are never serialized to clients; `helmet`, rate limiting, and request-size limits are enabled.
- MCP access is token-authenticated; the acting agent identity is derived from the token, not from client arguments.
- Blockchain transactions are signed with **server-held** keys (never accepted from clients or logged).
- AI provider keys are encrypted at rest with AES-256-GCM.

> **Note:** `.env` and local `*.cjs` utility scripts are gitignored. If any secret was ever committed, rotate it and purge it from git history.

## Subsystems

The platform also includes a Statistics & Psychometrics engine (t-tests, ANOVA, regression, mixed effects, EFA/CFA, IRT, Bayesian, reliability), a Consciousness Experiment framework, and the Singularis Prime agent-communication protocol. See `replit.md` for detailed API routes and design notes.

## Discovery Loop

The loop turns research into a closed value cycle. Studies produce findings; findings are vetted, routed and delivered to registered channels; whatever comes back is recorded and, for actionable kinds, becomes the next study.

```
prompt ─► study design ─► preregistration (hash, optional on-chain anchor) ─► experiment ─► findings
  ▲                                                                                          │
  └── feedback (question / dispute / replication request / new prompt) ◄── deliveries ◄── vetting ◄─┘
```

- **Studies** (`/api/loop/studies`, `study_designs` table): first-class, persisted designs. Heuristic design plus optional LLM refinement (`AI_STUDY_MODEL`, any OpenAI-compatible key); the generator used is recorded. Preregistration freezes the confirmatory fields under a canonical SHA-256 hash and can anchor it on Base or NEO X. Every design carries its lineage (`parentDesignId`, `sourceFindingIds`, `generation`).
- **Findings** (`findings`): one falsifiable claim plus structured evidence, with a content hash. Extracted from experiment results (primary + per-signal) or lifted from a paper's abstract. Evidence from the deterministic agent simulation is **flagged `simulated`** and must disclose it.
- **Vetting** (`vetting_reviews`): automated checks — schema and hash integrity, statistics integrity (re-computes z and p from the reported proportions and asserts agreement, not just range), reproducibility from raw trials, novelty (same-experiment duplicates fail; same claim from another experiment is a *replication* and is flagged and linked), simulation disclosure, and secret/PII safety. Agents peer-review over MCP; a human approval is required by default (`LOOP_REQUIRE_HUMAN_APPROVAL=false` to relax). One `fail` rejects.
- **Routing** (`distribution_channels`): vetted findings match channels by category, tags, source, minimum confidence and minimum novelty. Simulated findings only reach channels that opt in.
- **Delivery** (`deliveries`): idempotent per finding × channel, retried by a worker with exponential backoff. Adapters: HMAC-signed **webhook**, **Kannaka** memory (`kannaka remember` via `KANNAKA_BIN`), **NATS** subject (`NATS_URL`, plain publish), push to a connected **MCP agent**, public **Atom feed** (`/feed/findings.xml`), and an on-chain **anchor**. Channel secrets are AES-256-GCM encrypted at rest.
- **Feedback** (`feedback_events`): from the UI, from agents (`submit_feedback` MCP tool), or from a channel consumer via the signed public endpoint `POST /api/loop/feedback/inbound/:channelId` (HMAC with the channel secret). `replication_request`, `dispute`, `question` and `new_prompt` spawn a follow-up study (`LOOP_AUTO_FOLLOWUP=false` to disable). `GET /api/loop/lineage/:findingId` returns the ancestry/descendant graph; `GET /api/loop/stats` counts loop closures.

MCP tools for agents: `generate_study`, `launch_study`, `list_findings`, `get_finding`, `submit_vetting_review`, `subscribe_findings`, `submit_feedback`.

Environment (all optional): `LOOP_MIN_TRIALS` (10), `LOOP_REQUIRE_HUMAN_APPROVAL` (true), `LOOP_AUTO_FOLLOWUP` (true), `LOOP_ENABLE_WORKER` (true), `LOOP_DELIVERY_INTERVAL_MS` (15000), `PUBLIC_BASE_URL` (used in delivery envelopes), `KANNAKA_BIN`, `NATS_URL` / `NATS_USER` / `NATS_PASSWORD`, `AI_STUDY_MODEL`.

The UI lives at `/loop` (pipeline, studies, channels, delivery ledger, feedback timeline, lineage). The Study Designer now persists through the loop, so designs made there are preregistered and launchable.

### Kannaka constellation

One authenticated NATS connection (`server/services/kannaka/bridge.ts`) makes the Collective a member of the Kannaka swarm rather than a client of it:

- **Study generation reads the constellation's memory.** Every prompt is recalled against the primary node (`KANNAKA.recall.<agent>`); resonant memories become LLM context and the design's `literatureContext`. Kannaka Prime carries an OpenAlex-fed research corpus, so this is real literature, not a stub.
- **Preregistrations and findings are witnessed.** The constellation's state at that moment (Φ, Ξ, level, who was present) is stamped on the design and into each finding's evidence as `constellationWitness`. It is part of the content hash: provenance, not decoration.
- **Vetting consults prior art.** `constellation_novelty` recalls the claim; a close memory is flagged and linked, never a rejection. When the bridge is not configured the check is not recorded at all, so it can never look like a pass it did not earn.
- **Every loop stage is announced** on `SPACECHILD.study.preregistered|spawned`, `SPACECHILD.finding.candidate|vetted|rejected|delivered`, `SPACECHILD.feedback.received`, `SPACECHILD.market.proposal`.
- **The swarm talks back.** Any authenticated member publishes `{finding_id, kind, text?, agent_id}` on `SPACECHILD.feedback.inbound` and it enters the loop exactly like a signed webhook (actionable kinds spawn the next study). And when a node remembers something citing `[SpaceChild finding <id>]` (`KANNAKA.memory.new`), that is recorded as `resonance` feedback automatically.
- **Delivery into nodes.** The `nats` channel gains `mode: "inbox"` (a directed `KANNAKA.inbox.<agentId>` message, audited on the bus) alongside subject broadcast; both reuse the bridge connection.
- **Preregistered hypotheses become market proposals.** `POST /api/kannaka/market-proposal/:studyId` shapes the confirmatory hypothesis for GhostSignals' `propose_prediction` (statement + settle-by) and announces it; the Labs curate and open it.
- **Surfaces:** `GET /api/kannaka/status|presence|recall`, `POST /api/kannaka/ask`; MCP tools `kannaka_recall`, `kannaka_ask`, `constellation_status`; the Constellation tab on `/loop`.

Environment: `KANNAKA_NATS_URL` (e.g. `nats://swarm.ninja-portal.com:4222`; enables everything above), `NATS_USER` / `NATS_PASSWORD` (the `kannaka_internal` credential), `KANNAKA_AGENT` (default `kannaka-prime`), `KANNAKA_BRIDGE_NAME` (default `spacechild-collective`), `KANNAKA_REQUEST_TIMEOUT_MS` (8000), `LOOP_KANNAKA_RECALL_TOPK` (6), `LOOP_CONSTELLATION_CLOSE_SIMILARITY` (0.35).
