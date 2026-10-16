# Insurance AI Agent POC: new customers (use case 4)

AI agents find the right customers, check their risk, match them to the right product and tell sales teams who to call first, with reasons. Hard rules run first, the AI decides only inside them, and a person approves every recommendation. All data lives in CSV files.

- Requirements: [docs/prd_poc.md](docs/prd_poc.md)
- Rules, thresholds and limits: [docs/business_rules.md](docs/business_rules.md)
- Products: [docs/product_catalogue.md](docs/product_catalogue.md) (generated from `backend/data_csv/products.csv`)
- How it fits together: [docs/architecture.md](docs/architecture.md)

## The five agents

| Use case | Agent | Module (`backend/src/insurance_poc/agents/`) | AI? |
|---|---|---|---|
| Find the right prospects (approved data, consent) | Prospect | `prospect_agent.py` | no, rules |
| Summarise the risk, flag underwriter review | Risk | `risk_agent.py` | rules, then AI risk band |
| Rank the leads | Scoring | `scoring_agent.py` | AI: hot / warm / cold |
| Match the right product | Product | `product_agent.py` | AI inside eligibility rules |
| Plan the next step, for staff approval | Engagement | `engagement_agent.py` | no, rules |

They run as one LangGraph (`agents/graph.py`):

```
router -> prospect -> risk -> scoring -> product -> engagement -> finalize -> person approves
          (stop: no consent / data)  (stop: knock-out -> underwriter)
```

Every recommendation carries its reasons and the signals it was based on. The AI never declines, never prices, never contacts anyone and never goes around a broker; protected attributes never reach it.

## Layout

```
.env, .env.example   settings (AI provider and key, runner, CORS), read by the backend
requirements.txt     Python packages for the backend (+ the backend itself, editable)
.venv/               Python virtual environment (created by you, not committed)
backend/             FastAPI + LangGraph agents, CSV data, tests
front_end/           Next.js UI (see front_end/README.md)
docs/                requirements, business rules, catalogue, architecture
```

## Run it

From the project root (Python 3.12 or 3.13):

```bash
python -m venv .venv
.venv\Scripts\activate                             # Git Bash: source .venv/Scripts/activate
pip install -r requirements.txt
cp .env.example .env                               # set the Domo (or Anthropic) key
cd backend
uvicorn insurance_poc.main:app --reload            # API on :8000, docs at /docs
```

In a second terminal:

```bash
cd front_end
npm install
npm run dev                                        # http://localhost:3001
```

Open **Prospects**, click **Run AI on unchecked customers**, open a customer, sign in (a name and a team) and approve, change or reject the suggestion.

## The data: `backend/data_csv/`

| File | Who writes it | What |
|---|---|---|
| `leads.csv` | you (the app keeps `status`, `created_at`) | One row per prospect: one column per fact, money in whole units, lists separated by `;` (`none` = empty), `true` / `false`, blank = not known. Extra columns you add are kept as text. |
| `products.csv` | you | The catalogue: limits, price, channels, one `rule_*` column per eligibility rule, `active` |
| `customers.csv` | you | Existing customers a lead can link to (`existing_customer_id`) |
| `system/*.csv` | the app | Runs, AI decisions, approvals, audit trail, every LLM call, users, sessions |
| `results/ai_results.csv` | the app | One row per lead: verdict, scores, best product, also suits, not suitable, next steps |

Edit the input files **while the backend is stopped**. On start-up every file is validated (a bad cell stops it with file, row and column); every change is saved back within about a second. `python backend/scripts/reset_db.py` forgets the recorded AI work and sets every lead back to `new`.

## API

| Endpoint | Purpose |
|---|---|
| `GET /health` | Status, AI provider, data folder (`?deep=true` also pings the AI) |
| `POST /sessions`, `GET /sessions/me`, `DELETE /sessions/current` | Sign in as a name + team (sales, adviser, underwriter, admin); no password |
| `GET /leads`, `GET /leads/{id}` | Customers, each with its latest AI rating |
| `POST /leads`, `POST /leads/bulk` | Add prospects (queued for the AI). `declared` facts use the `leads.csv` column names, money in minor units |
| `POST /leads/{id}/runs`, `POST /leads/runs?scope=unchecked` | Run the AI on one / all unchecked |
| `GET /runs/{id}`, `POST /runs/{id}/retry`, `GET /batches/{id}` | Progress and retry |
| `GET /recommendations`, `GET /recommendations/{id}` | Approval queue; full case (products, reasons, screening, next steps, audit, LLM calls) |
| `POST /approvals/{id}/approve` · `/edit` · `/reject` | The human decision (send `X-Session-Id`) |

Errors always look like `{"error": {"code", "message", "details"}}`.

## Code map

```
backend/src/insurance_poc/
  main.py              app: opens the CSV store, starts the runner, mounts routes
  config.py            settings from the root .env
  rulebook.py          thresholds as data: lines, sources, underwriting rules, approval matrix
  csv_data.py          read / write the CSV formats, results summary
  agents/
    graph.py           the workflow: router -> 5 agents -> finalize
    prospect_agent.py  risk_agent.py  scoring_agent.py  product_agent.py  engagement_agent.py
    router.py          finalize.py    base.py (node decorator)   state.py
  services/
    rules/             consent, data_quality, application, underwriting, eligibility,
                       cross_sell, screening, routing, fairness (pure rules)
    decisions/         lead_score, risk, product_fit (+ features: what the AI may see)
    llm/               provider client (Domo, Anthropic, fake), retries, rate limit
    runner.py          background workers        intake.py      queue runs
    approvals.py       human decisions           next_steps.py  team to-do list
    justification.py   plain-English "why"       guardrails.py  never-do checks
  api/                 routes/ + schemas/
  db/                  models.py, csv_store.py (CSV <-> working copy), repositories/
  integrations/        CRM and catalogue protocols + mocks
backend/scripts/       reset_db.py, run_acquisition_demo.py, catalogue_doc.py, export_openapi.py
backend/tests/         unit/ + integration/, fake LLM, fixed demo CSVs in fixtures/demo_csv/
```

## Tests

With `.venv` active:

```bash
cd backend && pytest && ruff check src tests scripts
cd front_end && npm run typecheck && npm run lint && npm run build
```
