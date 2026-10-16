# System architecture

How the new-customer POC is put together. The backend runs the agent and owns all state; the
browser talks to it over HTTP; all data lives in CSV files.

## Components and data flow

```mermaid
flowchart LR
    subgraph Browser["User's browser (front_end, port 3001)"]
        List["Customers list<br/>AI rating per customer"]
        Detail["Customer page<br/>KPIs · info · products · next steps · decision"]
        Login["Sign in<br/>name + team, X-Session-Id"]
    end

    subgraph Api["FastAPI backend (port 8000)"]
        Routes["REST routes<br/>health · sessions · leads · runs<br/>recommendations · approvals"]
        Runner["Background runner<br/>queue · claims · retries · recovery"]
        Graph["LangGraph agent<br/>prospect → risk → scoring → product → engagement → finalize"]
        Rules["Hard rules<br/>consent · data quality · underwriting<br/>eligibility · cross-line · fairness"]
        LLM["Bounded LLM decisions<br/>risk · lead score · product fit"]
        HITL["Approvals<br/>role · version · staleness"]
        Store["CSV store<br/>load at start · write back after every change"]
    end

    CSV[("backend/data_csv/<br/>leads · products · customers<br/>system/*.csv · results/ai_results.csv")]
    Provider["Domo AI or Anthropic<br/>(fake provider in tests)"]

    List & Detail & Login <-->|JSON| Routes
    Routes --> Runner --> Graph
    Graph --> Rules
    Graph --> LLM <--> Provider
    Routes --> HITL
    Store <--> CSV
```

## One run, step by step

```mermaid
sequenceDiagram
    actor Staff
    participant UI as front_end
    participant API as FastAPI
    participant W as Runner
    participant G as Agent (rules + LLM)
    participant F as CSV files

    Staff->>UI: Check with AI
    UI->>API: POST /leads/{id}/runs
    API-->>UI: 202 + run id (queued)
    W->>G: claim the run, execute the graph
    G->>G: consent, data quality, underwriting, screening (rules)
    G->>G: risk, buying interest, product fit (LLM, validated)
    G-->>API: recommendation (pending approval)
    API->>F: write CSVs back (≈1 s)
    UI->>API: poll lead / GET /recommendations/{id}
    Staff->>UI: Approve / change action / reject
    UI->>API: POST /approvals/{id}/... (X-Session-Id, expected_version)
    API->>F: write CSVs back
```

## Boundaries

- **Front end** (`front_end/`): Next.js App Router + TanStack Query. `NEXT_PUBLIC_API_URL`
  points at the backend; its origin must be in the backend's `CORS_ORIGINS`.
- **Backend** (`backend/src/insurance_poc/`): `main.py` builds the app, opens the CSV store and starts
  the runner. Every trigger is asynchronous (202 + run id); the UI polls.
- **Storage** (`db/csv_store.py`): CSV files are the only data on disk. At start-up they are
  validated and loaded into a throwaway SQLite working copy in the OS temp folder (it keeps
  the queue's atomic claims and the approvals' first-decision-wins check safe); every write is
  saved back within about a second via temp file + rename, and the copy is deleted on shutdown.
- **Decision safety**: rules gate everything and the LLM only ranks or rates inside them;
  every LLM output is schema- and grounding-checked; a human approves every recommendation.
- **Integrations**: CRM and product catalogue are protocols (`integrations/base.py`) with mock
  implementations over the working copy.
- **Tests** (`tests/`): offline, with a fake LLM and a fixed copy of the demo CSVs
  (`tests/fixtures/demo_csv/`).
