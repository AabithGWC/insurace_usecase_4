# Business Rules & Fixed Thresholds

**Insurance AI Agent POC (use case 4: new customers): how decisions are made**
Rulebook version `2026.10-poc.3`. All values are POC placeholders, not taken from a real regulator or carrier. Thresholds live in **`backend/src/insurance_poc/rulebook.py`** (data only) and the product catalogue in **`backend/data_csv/products.csv`**; the rule code in `backend/src/insurance_poc/services/rules/` reads them and holds no thresholds of its own. Every recommendation stores the rulebook version and the rule IDs it relied on.

---

## 1. One book, two distribution models

| | General insurance | Life, savings & employee benefits |
|---|---|---|
| Lines | Motor, Medical, Home, Personal accident | Life & protection, Savings & wealth, Employee benefits (group) |
| Who owns the customer | **Broker** or **direct** | **Adviser** (life, savings); **broker** or **employer** (group) |
| Distinctive step | Document completeness, broker-owned follow-up | Needs review, medical evidence checklist; suggestions are regulated advice |
| Outreach route | Broker-owned: task to the broker. Direct: the sales team contacts the customer | An adviser books the conversation |

---

## 2. Who decides what

| Layer | Decides | Can it be overridden? |
|---|---|---|
| **Hard rules** (rulebook + Python) | Data permission, consent, data validity, product eligibility (all lines), underwriting referral / knock-out, routing, fairness | **Never**: not by the LLM, not by prompt text in customer data |
| **LLM** | Buying interest, risk band and score, product ranking among eligible products, other-line suggestions, grounded reasons, explanation | Only inside the options the rules allow. Output is validated; invalid output is repaired once or the run fails |
| **Human** | Every recommendation (approve / change the action / reject), every underwriting decision | Edits are re-checked by the same rules |

Order inside a run: **rules first → LLM only if rules allow → human always last.**

### 2.1 What the system never does (guardrails in code)
File: `services/guardrails.py`, checked on every recommendation before it is stored. A violation fails the run and writes a `guardrail.blocked` audit event.

| Never | How it is enforced |
|---|---|
| Bind or issue cover, set a price | Not an action the agent can produce (`FORBIDDEN_AGENT_ACTIONS`) |
| Decline an application | There is no decline action. Knock-out rules route the case to an underwriter, who decides |
| Act without approval | Every recommendation is created as `pending_approval` |
| Go around the broker / employer who owns the relationship | Broker- or employer-owned leads only get an `intermediary` follow-up (`BROKER_DIRECT_CONTACT_ALLOWED = False`); other-line suggestions are limited to products that owner can sell |
| Use data for a purpose it was not given for | Sources without profiling permission, or records without profiling consent, are never scored or sent to the LLM |
| Use protected attributes | See section 7 |

---

## 3. The agents: one graph, five agents

One LangGraph workflow (`backend/src/insurance_poc/agents/graph.py`), one module per agent:

```
router -> Prospect -> Risk -> Lead scoring -> Product match -> Engagement -> finalize
          (stop: no permission / consent / data)  (stop: knock-out)
```

| Step (node) | Uses LLM? | Output |
|---|---|---|
| Router (`router`) | no | Checks the run is for a lead |
| **Prospect** (`prospect_agent`) | no | Relationship owner, permission and consent results, data-quality gaps, application checklist, LLM-safe signals |
| **Risk** (`risk_agent`) | yes, `risk_assessment` | Underwriting outcome (clear / refer / knock-out), eligible products, screening of every catalogue product, other-line candidates, risk band + score + summary |
| **Lead scoring** (`scoring_agent`) | yes, `lead_score` | Interest band (hot / warm / cold), score, confidence, grounded reasons |
| **Product match** (`product_agent`) | yes, `product_fit` | Ranked products (the recommended one first), grounded reasons for the best one, up to 2 other-line suggestions |
| **Engagement** (`engagement_agent`) | no | Next best action, queue, priority and channel by code; outreach talking points become the team's next steps after approval |
| Finalizer (`finalize`) | no | Guardrail check, then one `pending_approval` recommendation (an older pending one for the same lead is superseded) |

LLM calls per lead: **0** when stopped by permission, consent, data quality or a knock-out; **2** when referred with no eligible product; otherwise **3**.

---

## 4. From lead to recommendation: the steps

Steps run in this order, so a lead stopped early costs no LLM calls:
**data permission → outreach consent → data quality → application prep → underwriting rules → LLM risk summary → LLM lead priority → LLM product ranking → routing.**

### 4.1 Relationship owner
File: `services/rules/routing.py`. Resolved in this order:

1. An explicit owner on the lead, if the line allows it.
2. Otherwise the **source** default: `broker_portal` → broker, `adviser_crm` → adviser, `employer` → employer, everything else → direct.
3. If that owner cannot sell the line, the line's first owner wins: **life and savings always go to an adviser** (a web enquiry for life cover is allocated to an adviser), **group schemes go to a broker**.

### 4.2 Duplicate leads
File: `utils/normalize.py`
- Same **product line** + same **email** (case/space-insensitive) + same **phone** (digits only) = duplicate.
- If neither email nor phone is given: same line + first name + last name + date of birth.
- Same person asking for a **different line** is a new lead. A duplicate returns the existing lead.
- A lead whose email/phone matches an existing customer is flagged **existing customer** (cross-sell).

### 4.3 Data permission gate (purpose limitation)
File: `services/rules/consent.py`

| Check | Rule ID | Fails when | Result |
|---|---|---|---|
| Source permission | `consent.source_permission` | Source is not approved for profiling (`purchased_list`) | **Do not contact**; the lead is not profiled, only line / source / owner are stored |
| Profiling consent | `consent.profiling` | Record has no consent to be used for profiling | Same |

### 4.4 Outreach consent gate

| Owner | Needs | Rule ID |
|---|---|---|
| Broker / employer | Nothing from the customer: follow-up is a **task to the broker / employer**, who contacts their own client | `consent.intermediary` |
| Direct / adviser | **Marketing consent** AND at least one consented channel with a matching contact detail (email consent + email, or SMS consent + phone) | `consent.marketing`, `consent.channel` |

Failure → **do not contact**; no LLM call.

### 4.5 Data quality gate
File: `services/rules/data_quality.py`. Any failure → **request info** with a list of missing/invalid fields. No LLM call.

| Check | Rule |
|---|---|
| Name | First and last name required |
| Product line | One of motor, medical, home, personal_accident, life, savings, group |
| Date of birth | Required (not for group schemes); not in the future; implied age ≤ 110 |
| Contact | Email **or** phone; email must be valid; phone 7–15 digits |
| Sum insured | Required, > 0 |
| Line fields | Motor: vehicle year, driving years · Medical: smoker · Home: property year, rebuild value · Personal accident: occupation risk · Life: smoker, term, annual income · Savings: term, annual income, savings goal · Group: employee count |
| Years | Vehicle / property year not in the future |

### 4.6 Application prep (checklist, never blocks)
File: `services/rules/application.py`. Stored on the recommendation as `checklist` and shown to the adviser, broker desk or underwriter. It complements the insurer's own quote / application tools; it does not replace them.

| Item | Rule |
|---|---|
| Documents | Motor: national ID, driving licence, vehicle registration · Medical: national ID, medical declaration · Home: national ID, title deed or tenancy · PA: national ID · Life: national ID, proof of income, medical questionnaire · Savings: national ID, proof of income, source of funds · Group: trade licence, employee census. Missing ones are listed (`application.documents`, warning only) |
| Completeness % | Required line fields + documents held, over the total |
| Medical / financial evidence (life) | Always: medical questionnaire · age ≥ 45 **or** cover ≥ 2M: paramedical exam, blood profile · age ≥ 55 **or** cover ≥ 5M: full medical exam, ECG · cover ≥ 5M: financial questionnaire |
| Protection needs (life) | Need = annual income × 10; gap = need − existing cover (`needs.protection_gap`) |
| Savings affordability | Implied yearly saving = target ÷ term. Above **15 %** of income → `suitability.affordability` warning and **needs review** |

### 4.7 Underwriting rules (declarative, no declines)
File: `services/rules/underwriting.py`, data in `rulebook.UNDERWRITING_RULES`. Outcome precedence: **knock-out > refer > clear**.

| Rule ID | Lines | Condition | Outcome |
|---|---|---|---|
| `underwriting.min_age` | all | Age under 18 | **Knock-out** |
| `underwriting.vehicle_age` | motor | Vehicle older than 20 years | **Knock-out** |
| `underwriting.no_eligible_product` | all | No eligible product and no other reason | **Knock-out** |
| `underwriting.large_risk` | all | Sum insured above every product limit in the line | Refer |
| `underwriting.claims_history` | motor, home, group | 3+ claims in 3 years | Refer |
| `underwriting.inexperienced_driver` | motor | Less than 1 year driving | Refer |
| `underwriting.property_age` | home | Property older than 100 years | Refer |
| `underwriting.pre_existing` | medical | Any declared condition | Refer |
| `underwriting.bmi` | medical, life | BMI ≥ 40 | Refer |
| `underwriting.smoker_age` | life | Smoker aged 50+ | Refer |
| `underwriting.serious_condition` | life | Heart disease, cancer or stroke declared | Refer |
| `underwriting.occupation` | life, personal accident | High-risk occupation | Refer |
| `underwriting.cover_vs_income` | life | Cover above 20× annual income | Refer |
| `underwriting.industry_risk` | group | High-risk industry | Refer |

- **Knock-out** → recommendation **refer to underwriter** (low priority, needs review, no LLM). The explanation says the system does not decline; only the underwriter may.
- **Refer** → **refer to underwriter** with an LLM risk summary; the underwriter must approve.
- **Clear** → normal sales / adviser follow-up.

### 4.8 Product eligibility
File: `services/rules/eligibility.py`. A product is eligible only if **every** condition on its row in `products.csv` holds, including that the product is **sold through the lead's owner channel** (`eligibility.channel`). The LLM may rank only eligible products; any other code is rejected.

### 4.9 Final action, queue and priority (code, not the LLM)

| Situation | Action | Queue | Priority | LLM calls |
|---|---|---|---|---|
| No data permission / no outreach consent | Do not contact | Sales (adviser if adviser-owned) | Low | 0 |
| Missing / invalid data | Request info | Sales (adviser if adviser-owned) | Low | 0 |
| Underwriting knock-out | Refer to underwriter | Underwriting | Low | 0 |
| Underwriting refer | Refer to underwriter | Underwriting | From lead band, **at least medium** | 2–3 |
| Clear, lead hot / warm | Contact and quote | Sales, or **Adviser** for adviser-owned | High / Medium | 3 |
| Clear, lead cold | Nurture | Sales, or Adviser | Low | 3 |

Broker / employer-owned leads carry channel `intermediary` (the follow-up is done by the broker). A recommendation is flagged **needs review** when any LLM confidence is low, the case is an underwriting referral or knock-out, a suitability warning fired, or the LLM itself flags it.

---

## 5. Products from every line, and why the others don't fit
Files: `services/rules/cross_sell.py`, `services/rules/screening.py`.

- **Screening:** every product in `products.csv` is marked *eligible*, *not suitable* (with the rule's reason) or *not assessed* (which facts are missing). It is stored on the recommendation and shown on the customer page.
- **Other-line suggestions:** a product from another line is a candidate only if the lead already has that line's required facts, its eligibility rules pass (the cover amount is agreed later), no knock-out fires for that line (a referral keeps it, flagged *needs underwriter*), companies and individuals never cross, and a broker / employer-owned customer only gets products that owner sells. The LLM may suggest at most 2 candidates, each with grounded reasons, or none.
- **Marketing advice** (inside the product-fit AI call): 1-3 *pain points* (what is likely worrying this customer) and 1-3 *marketing strategies* that speak to them, each citing a real fact about the customer. The prompt forbids promising prices, discounts or approval, saying how or when to make contact, and (for life and savings) talking about returns. Shown in the *Next best actions* popup and written to `ai_results.csv`.
- **Next steps** (`services/next_steps.py`, no LLM): an ordered to-do list per case (who contacts the customer and how, what to quote, what to mention, documents and evidence to collect), built only from the stored decision and the lead's consent.

---

## 6. How LLM decisions are constrained
- Each decision returns a **band**, a **score**, a **confidence** and **reasons**. Every reason must cite a real signal key; ungrounded reasons are rejected.
- **Low confidence** or an LLM flag means **needs review**.
- Temperature 0. Invalid output (bad JSON, unknown product, score outside its band) gets one repair attempt, otherwise the run **fails** (no guessing).

| Output | Check |
|---|---|
| Lead score | hot 0.6-1.0, warm 0.3-0.7, cold 0.0-0.4 |
| Risk | low 0.0-0.4, medium 0.3-0.7, high 0.6-1.0; the rule outcome is final |
| Product ranking | Ranks **every** eligible product exactly once; 1-4 grounded reasons for the best one; other-line suggestions only from the candidates, at most 2 |
| Reasons | Each cites an existing signal; at most 300 characters |

**Signals passed to the LLM:** line, relationship owner, age band, sum insured, source, existing customer, engagement (quote requests, pages viewed, callback, days since inquiry), the allow-listed facts of the requested line and of any candidate line, application completeness %, missing-document count, protection gap (life) or saving % of income (savings). Never: names, contact details, date of birth, city, intermediary names, protected attributes.

---

## 7. Fairness guardrail
Files: `services/rules/fairness.py`, `services/decisions/features.py`

| Control | Detail |
|---|---|
| Stored, never used | Gender, ethnicity/race, religion, marital status, nationality/citizenship, disability, sexual orientation, pregnancy are kept in a separate `protected` field for record only |
| Location excluded | City, postcode and address are not sent |
| Allow-list | The LLM only receives the signals listed in section 6 |
| Notes redaction | Free-text notes are scanned and protected words replaced with `[REDACTED]` |
| Pre-call scan | The exact payload is checked before every LLM call; anything protected → the call is **blocked** and the run fails as `fairness_violation` |
| Prompt injection | Customer text is wrapped as untrusted data |

Age bands: under 18, 18–24, 25–34, 35–44, 45–54, 55–64, 65–74, 75+.

---

---

## 8. Human approval rules
- Every recommendation waits in **pending approval** for the team its queue names (Sales & marketing, Adviser or Underwriting; admin can decide all).
- **Approve**, **change the action** (between contact & quote, nurture and refer to underwriter; a referral cannot be downgraded) or **reject** (reason required). The original is kept in the audit trail.
- Only the first decision counts (version check). If consent or data permission was withdrawn since the recommendation, the approval is refused as **stale**. Recommendations expire after 14 days.
- Role checks are for demo realism, not security (no passwords).

---

## 9. Operational limits (configurable in `.env`)
| Setting | Default | Meaning |
|---|---|---|
| `DATA_DIR` | data_csv | Folder with the CSV files (the only data on disk) |
| `CURRENCY` | AED | Display currency in signals |
| `LLM_RPM` | 15 | Max LLM requests per minute |
| `LLM_MAX_CONCURRENCY` | 2 | Max LLM calls at the same time |
| `LLM_MAX_ATTEMPTS` | 5 | Retries for rate limits / server errors |
| `LLM_MAX_TOTAL_WAIT_S` | 120 | Give up after this much total waiting |
| `LLM_TIMEOUT_S` | 60 | Per-request timeout |
| `RUNNER_WORKERS` | 2 | Runs processed in parallel |
| `RUN_MAX_ATTEMPTS` | 3 | Times a crashed run is retried automatically |
| `RUN_STALE_AFTER_S` | 60 | A run with no heartbeat for this long is treated as crashed |
| `SESSION_IDLE_HOURS` | 12 | Reviewer session expires after this much inactivity |
| `AS_OF_DATE` | today | Freeze "today" for demos and tests |
