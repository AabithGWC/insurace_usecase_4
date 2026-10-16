# Product Requirements Document (PRD)

## Insurance AI Agents POC

| | |
|---|---|
| **Version** | 1.3 |
| **Date** | 13 October 2026 |
| **Status** | Locked for implementation |
| **Audience** | Internal team |

### Change log
| Version | Change |
|---|---|
| 1.1 | Initial locked backend PRD (Jev System One decision layer, frontend later). |
| 1.3 | Scope reduced to Use Case 4 (new customers). Use Case 5 (renewals) removed. All data in CSV files (data_csv/). Product matching across all lines with grounded reasons, product screening and next steps. Single Next.js UI (front_end/). |
| 1.2 | Jev System One removed; probabilistic decisions now made by LLM calls with schema-validated structured output. Provider-agnostic LLM layer (OpenRouter, NVIDIA NIM, Anthropic). All flow triggers asynchronous (run queue). Edit = approve with changes. Generic multi-line domain. Small default dataset. Fairness guardrail and band-based decisions added. Lightweight persisted identity (users + sessions in SQLite). Next.js frontend moved into scope as Phase 8. |

---

## 1. Overview
This POC demonstrates a multi-agent AI system for two core insurance use cases:

- **Customer Acquisition / AI Underwriting & Risk Check**

Specialised AI agents collaborate under controlled orchestration, apply hard business rules, use an LLM for bounded reasoning and classification, generate explanations, and route every recommendation through a simple human-in-the-loop (HITL) approval process.

### Primary goals
- Prove that agents can collaborate safely and transparently.
- Demonstrate clear separation of hard rules (deterministic) vs LLM judgments (probabilistic).
- Show full auditability of every recommendation, including every LLM request/response.
- Deliver a working backend plus a minimal Next.js frontend.
- Keep the implementation lightweight, local-first, and easy to run in VS Code with `uv`.

## 2. In-Scope Use Cases

### Use Case 4 – AI Underwriting, Risk Check & Customer Acquisition
1. Ingest lead / prospect data.
2. Apply consent, data-quality and fairness gates.
3. Classify lead priority (LLM → band + confidence + grounded reasons).
4. Apply hard eligibility and underwriting rules (accept / refer / decline).
5. Assess risk and product fit (LLM ranks only rule-eligible products).
6. Produce ranked recommendation with explanation.
7. Route to human approval (Sales / Underwriter).
8. Record outcome and full audit trail.

### Domain
Generic multi-line personal insurance: **motor, home, health, life**. Neutral currency stored as integer minor units. No specific regulator; rules modelled on common industry practice.

## 3. Technology Stack (Locked)

| Layer | Technology | Notes |
|---|---|---|
| Runtime / packages | Python 3.12 + uv | Local development in VS Code |
| API | FastAPI | Open endpoints; lightweight identity only (no passwords) |
| Agent orchestration | LangGraph (single unified graph) | Shared state, explicit routing, no checkpointer |
| Hard business rules | Pure Python functions / decision tables | Eligibility, consent, data quality, underwriting, fairness |
| LLM | Provider-agnostic: OpenRouter, NVIDIA NIM, Anthropic | Decisions (structured output) + explanations + draft messages. Selected via `LLM_PROVIDER` |
| Database | SQLite + SQLAlchemy 2 (async, aiosqlite) | Domain data, runs, recommendations, approvals, sessions, audit |
| Execution | DB-backed run queue + in-process async workers | Every trigger is asynchronous |
| Frontend | Next.js (App Router) + TypeScript + Tailwind + shadcn/ui | Worklists, approval screens, run progress |
| Integrations | Mock services | CRM, product catalogue |
| Observability | Structured logging (structlog) | Agent steps, LLM calls, approvals, correlated by run_id |

## 4. High-Level Architecture
```
Next.js frontend
    │
FastAPI
    │
    ├── Routes (health, sessions, leads, runs, recommendations, approvals)
    │
    ├── Run queue + async workers (rate-limited LLM access)
    │
    ├── Single Unified LangGraph
    │     ├── Router (use_case discriminator)
    │     ├── Prospect / Scoring / Risk / Product nodes
    │     └── Finalize (writes recommendation → pending_approval)
    │
    ├── Services
    │     ├── Hard Rules (Python, incl. fairness guardrail)
    │     ├── Decision services (LLM structured output + validation)
    │     ├── LLM client (OpenRouter | NIM | Anthropic)
    │
    ├── Integrations (mocks)
    │
    └── SQLite
          ├── Domain records
          ├── Runs / batches
          ├── Recommendations / approvals
          ├── Users / sessions
          └── Audit trail + every LLM call
```

## 5. Execution Model
- Every trigger (lead ingestion, lead re-run, run all) returns `202 Accepted` with a `run_id` (or `batch_id`).
- Runs are persisted in SQLite (`queued → running → succeeded | failed | skipped`) and claimed atomically by in-process workers.
- A global rate limiter and concurrency cap protect free-tier LLM quotas.
- Crash recovery: stale `running` runs are requeued or failed on startup.
- Clients poll `GET /runs/{id}` / `GET /batches/{id}`.

## 6. Human-in-the-Loop (HITL) – Locked
Simple approve / reject / edit API (not LangGraph interrupt/resume).

- Graph runs to completion and produces a recommendation with status `pending_approval`.
- Human calls:
  - `POST /approvals/{id}/approve`
  - `POST /approvals/{id}/reject` (reason required)
  - `POST /approvals/{id}/edit` – **approve with changes**: edited fields are re-validated by hard rules, status becomes `approved_with_edits`, side-effect fires. The original recommendation is preserved.
- Concurrency-safe: optimistic versioning; only the first decision wins, others receive `409`.
- Stale or expired recommendations (consent or data permission withdrawn, or past the 14-day expiry) are rejected with `409`.
- The acting user is taken from the server-side session, never from the request body.

## 7. Decision Layer Design (Hybrid, Locked)

### Hard rules (pure Python)
Absolute gates: consent, mandatory fields, product eligibility, underwriting knock-outs, discount caps, fairness. **Never overridden by the LLM.**

### LLM decisions
Bounded probabilistic judgments via structured output:
- Lead priority (hot / warm / cold)
- Risk band
- Intervention choice (from a rule-computed allowed set)
- Product ranking (only among rule-eligible products)
- Needs-review classification

Design rules:
- Python computes measurable **signals**; the LLM receives only an allow-listed feature set.
- LLM returns a **band + confidence + reasons**, each reason citing an existing signal. Numeric scores are secondary.
- Output is validated (schema, enums, ranges, allowed codes, grounded reasons); one repair attempt, then the run fails.
- Low confidence or ungrounded reasons force `needs_review`.
- Temperature 0 for decision calls.
- Retries with exponential backoff and `Retry-After` handling on 429; fail fast on 4xx auth/billing errors. If the LLM is unavailable the run fails (no silent heuristic fallback) and can be retried.

### Fairness guardrail
Protected attributes (gender, ethnicity, religion, marital status, nationality, disability, sexual orientation) are never sent to the LLM or used by underwriting rules. Outbound LLM payloads are checked before each call; free-text notes are redacted. Each recommendation records its fairness check result.

### LLM text generation
Natural-language explanations and draft customer messages. Draft messages are post-checked (offer figures match, no unresolved placeholders, consent-permitted channel).

Every LLM call is fully audited (provider, model, prompt, raw response, parsed output, latency, tokens, attempt, error).

## 8. Identity (Lightweight, Not Security)
- Users pick a name and role (sales, adviser, underwriter, admin); stored with a session token.
- Sessions survive browser reloads and backend restarts; kept alive by a frontend heartbeat (idle timeout configurable).
- Soft role-to-queue checks for workflow realism (e.g. underwriting queue requires underwriter/admin).

## 9. Functional Requirements

### Core
- Trigger acquisition flow with lead data.
- Run unified LangGraph for both use cases.
- Produce transparent recommendations (bands, confidence, reasons, rule results, missing info, next action).
- Support approve / reject / edit (approve with changes).
- Maintain complete audit trail of every step and decision.
- Demo data: 18 hand-made leads covering the edge cases, 15 products and 2 existing customers, as CSV files.

### API surface (minimum)
- Health check
- Sessions (create, me, heartbeat, end) and active users
- Lead ingestion + worklist + re-run
- Run / batch status + retry
- Recommendation list + detail
- Approve / Reject / Edit
- Audit query
- Dashboard stats

### Agents (nodes in single graph)
Router · Prospect · Risk · Scoring · Product · Finalize

### Frontend
Customers list with the AI rating, and a customer page with KPIs, customer details, matching products with reasons, why other products don't fit, next steps and the approval decision.

## 10. Non-Functional Requirements
- Fully local runnable with a Python venv (`requirements.txt`) and `npm run dev`.
- Zero external infrastructure beyond the chosen LLM provider.
- Clear folder structure and typed interfaces; frontend types generated from the OpenAPI schema.
- Structured logging of all agent and decision steps.
- Easy to reset and re-seed the database.
- Designed so Postgres, real auth, Temporal, and real integrations can be added later without major rewrite.

## 11. Out of Scope
- Real authentication / RBAC / passwords
- LangGraph interrupt/resume
- Classical ML model training (XGBoost, etc.)
- Kafka / event streaming
- Temporal / Camunda
- Production-grade security & monitoring
- Real CRM / product catalogue integrations; Use Case 5 (renewals and retention)
- Formal regulatory model validation

## 12. Success Criteria
1. Both use cases can be triggered end-to-end via API and UI.
2. Hard rules + LLM decisions produce transparent, auditable recommendations.
3. A human can approve / reject / edit any recommendation; concurrent decisions are handled safely.
4. Full audit trail exists for every run, including LLM inputs/outputs.
5. No protected attribute reaches the LLM.
6. Synthetic data creates realistic worklists, including edge cases.
7. Entire system runs locally with uv, npm, and a single SQLite file.

## 13. Delivery Phases
| Phase | Scope |
|---|---|
| 0 | PRD v1.2 |
| 1 | Foundation: scaffolding, config, logging, SQLite models, repositories, reset + seed scripts |
| 2 | Hard rules + fairness + feature allow-list |
| 3 | LLM layer: providers, retry/rate limiting, structured output + repair, call audit |
| 4 | Graph: state, nodes, unified LangGraph |
| 5 | Run queue + trigger API |
| 6 | HITL approvals, sessions |
| 7 | Demo readiness: demo scripts, stats, README, live provider runs |
| 8 | Next.js frontend |

## 14. Key Design Decisions Log
| Decision | Choice | Rationale |
|---|---|---|
| Decision model | LLM structured output (Jev removed) | No dependency on an unverified model; typed, validated, provider-agnostic |
| LLM providers | OpenRouter, NVIDIA NIM, Anthropic | Free tiers for development, swap without code changes |
| LLM failure | Retry then fail run | Honest behaviour; no silent heuristic substitution |
| Scores | Bands + confidence + grounded reasons | LLM numbers are not calibrated probabilities |
| Fairness | Allow-list features + pre-call scan | Protected attributes must not influence decisions |
| Orchestration | Single unified LangGraph | Simpler for POC, shared services |
| Execution | Async run queue in SQLite | LLM latency and rate limits; crash recovery |
| HITL | Approve / reject / edit (= approve with changes) API | Speed, simplicity, long-running human decisions |
| Identity | Name + role sessions in SQLite | Attributable audit without real auth |
| Hard constraints | Pure Python rules | Auditability & regulatory clarity |
| Database | SQLite | Zero-ops for POC |
| Frontend | Next.js App Router | Minimal worklists + approvals |
| Package management | uv | Fast, modern Python workflow |
