# PARALLAX FORGE

**Persistent-memory autonomous operations agent.** PARALLAX FORGE turns a goal into an evidence-grounded, verifiable plan. It recalls similar past problems from a Qdrant vector memory, including what worked, what failed, and what was never tested. It asks your existing **Lyzr** agent for a plan grounded in that evidence, lets you track each step, and saves the *verified* outcome back to memory so the next plan improves.

Optionally, it pulls personal context from your **Omi** wearable (memories + conversations) into the prompt.

```
goal ─► embed ─► Qdrant search ─► relevance filter ─► (Omi context) ─► Lyzr agent ─► structured plan
                                                                                      │
          Qdrant ◄── embed ◄── verified outcome + lessons ◄── you mark steps done/failed
```

## Stack

| Layer | Tech |
| --- | --- |
| Frontend | React 19 + TypeScript + Vite, React Router, lucide icons, hand-written CSS design system |
| Backend | Node.js + TypeScript (Express 5, zod validation, tsx) |
| Reasoning | Existing Lyzr agent via `POST /v3/inference/chat/` (server-side only) |
| Memory | Qdrant, collection `parallax_experiences`, **384-d, Cosine** |
| Embeddings | `Xenova/all-MiniLM-L6-v2` run locally via transformers.js (ONNX). No API key needed, and the same model is used for insert and search |
| Personal context | Omi hosted MCP server (`https://api.omi.me/v1/mcp`), optional |

## Setup

Prerequisites: Node 20+, Docker Desktop.

### 1. Install

```bash
npm install          # root (concurrently)
npm run install:all  # server + client
```

### 2. Configure credentials

```bash
cp server/.env.example server/.env
```

Edit `server/.env`:

| Variable | Where to find it |
| --- | --- |
| `LYZR_API_KEY` | Lyzr Studio → your agent → API (the `x-api-key` value) |
| `LYZR_AGENT_ID` | Same curl example (`agent_id`) |
| `LYZR_USER_ID` | Same curl example (`user_id`, usually your email) |
| `LYZR_API_URL` | Confirm it matches the endpoint in the curl example (default `https://agent-prod.studio.lyzr.ai/v3/inference/chat/`) |
| `OMI_API_KEY` | Optional. Omi app → Settings → Developer → MCP → create key (`omi_mcp_…`). Leave empty to disable |

Each task uses its own Lyzr session (`<agent_id>-<task_id>`), so conversations don't bleed between tasks. Secrets are read only by the backend. The browser talks only to `/api`, and errors and logs are redacted.

### 3. Start Qdrant and initialize the collection

```bash
npm run qdrant:up     # docker compose: qdrant/qdrant on :6333, persistent volume
npm run init:qdrant   # creates/verifies parallax_experiences (384, Cosine) + payload indexes
```

To use **Qdrant Cloud** instead, set `QDRANT_URL=https://<cluster>.cloud.qdrant.io` and `QDRANT_API_KEY` in `server/.env`. The server refuses to use an existing collection whose vector size or distance doesn't match the embedding model.

### 4. Embeddings

There's nothing to configure. On first start, the server downloads the ~90 MB ONNX model from Hugging Face and caches it under `server/node_modules/@huggingface/transformers/.cache`. If you change `EMBEDDING_MODEL`, also change `EMBEDDING_DIMENSION` and use a new `QDRANT_COLLECTION`.

### 5. Run

```bash
npm run dev           # API on :8787, web on :5173
```

Open http://localhost:5173. The sidebar shows live status for Lyzr, Qdrant, Embeddings and Omi.

### 6. Verify

```bash
curl localhost:8787/api/health          # backend, Lyzr config, Qdrant, embedding model, Omi
curl localhost:8787/api/health/qdrant   # Qdrant server + collection details
npm test                                # unit tests (parser, prompt grounding)
npm run test:e2e                        # live end-to-end test, needs the API running
```

The e2e test hits the real services. It seeds a *failed* experience, runs a real task through Lyzr, and asserts that Qdrant retrieved the seeded memory above the relevance threshold. It also checks that success can't be recorded with no completed step, then saves an outcome and confirms Qdrant can list and semantically search it. Records it creates use domain `e2e` and tag `e2e-test`.

## Using it

1. **Command Center**: enter a goal, optional context, and a domain, then click **Forge plan**.
2. **Execution Workspace**: the timeline mirrors real backend events (`pending → running → completed/failed/skipped`). A stage turns green only after its operation succeeds, and on failure it shows the exact failed stage and a **Retry**. Retrieved memories show cosine scores; the ones below `MEMORY_MIN_SCORE` are shown but not sent to the agent. The plan is shown as goal, findings, prioritized steps, risks, checklist, lessons, and sources. The raw Lyzr reply is available too.
3. Mark each step **Done / Failed / Pending** with a note as you actually execute it.
4. **Outcome verification**: choose *Verified success*, *Partial*, *Failed* or *Unverified*, add verification notes, then click **Save experience to memory**.
5. **Experience Memory**: semantic search plus domain and outcome filters, a detail drawer, and a manual **Add experience** form, which is useful for seeding memory with past incidents.
6. **Task History**: every run with its real end state.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/tasks` | `{goal, description?, domain?, useOmi?}` → 202 + task. Runs the full pipeline asynchronously |
| `GET` | `/api/tasks` | Task summaries |
| `GET` | `/api/tasks/:id` | Full task: stages, memories, plan, raw response, outcome |
| `POST` | `/api/tasks/:id/retry` | Re-run a task that failed before producing a plan |
| `PATCH` | `/api/tasks/:id/steps/:stepId` | `{status: pending\|completed\|failed, note?}` |
| `POST` | `/api/tasks/:id/outcome` | `{outcome_status, verification_notes, lessons[], tags[], confidence, saveToOmi}` → embeds + upserts to Qdrant |
| `GET` | `/api/memories` | `?q=` semantic search, or list; filters `domain`, `outcome_status`, `limit` |
| `GET` | `/api/memories/stats` | Counts by outcome |
| `POST` | `/api/memories` | Save an experience manually (validated) |
| `GET` | `/api/health` | Backend, Lyzr config, Qdrant, embeddings, Omi |
| `GET` | `/api/health/qdrant` | Qdrant server and collection |

### Qdrant point payload

`task_id, problem, domain, solution, outcome_status (success|partial|failed|unverified), source_urls[], tags[], confidence (0-1), created_at, verification_notes, lessons[]`. It has keyword indexes on `domain`, `outcome_status`, `task_id` and `tags`.

## Honesty and safety guarantees

- **Recommendation ≠ outcome.** Plans are stored only when you record an outcome. `unverified` is the default and is labeled as a hypothesis in future prompts. *Success* requires verification notes and at least one completed step.
- **Failures are preserved** and injected as "do not repeat without addressing why it failed."
- **Memory isn't authoritative.** Hits below the relevance threshold aren't used, and each memory's status and score are given to the agent.
- **No fabricated citations.** The agent cannot browse; any URL it cites that wasn't in retrieved evidence is dropped, and you're told.
- **Plans only.** Nothing is executed. Steps that are external, irreversible, financial or touch production are flagged **Requires approval**. Writing a lesson to Omi is off by default and needs an explicit checkbox.
- If an embedding, Qdrant, Lyzr or Omi call fails, the stage fails visibly. Nothing is skipped silently or replaced with a mock.

## Project layout

```
server/
  src/config.ts               env validation
  src/services/embeddings.ts  local MiniLM embeddings
  src/services/qdrant.ts      collection checks, search, upsert, scroll, stats
  src/services/lyzr.ts        Lyzr agent client
  src/services/omi.ts         Omi MCP client (search context, optional write)
  src/services/prompt.ts      grounded prompt builder
  src/services/parser.ts      JSON plan extraction + validation
  src/services/orchestrator.ts  stage-by-stage pipeline
  src/services/taskStore.ts   task history (server/data/tasks.json)
  src/routes/*                tasks, memories, health
  scripts/initQdrant.ts, scripts/e2e.ts
client/src/
  pages/        CommandCenter, Workspace, ExperienceMemory, TaskHistory
  components/   Sidebar, Timeline, MemoryCard, PlanView, OutcomeForm, ui
docker-compose.yml            local Qdrant
```
