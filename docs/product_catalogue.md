# Product catalogue

Generated from `backend/data_csv/products.csv` (15 products) by `backend/scripts/catalogue_doc.py`. Edit the CSV, not this page. Amounts are whole currency units.

## Motor

- **Sold through:** broker, direct
- **Facts needed before the AI can assess:** vehicle year, driving years
- **Application documents:** national id, driving licence, vehicle registration

| Product | What it covers | Age | Cover | Base premium | Rules | Active |
|---|---|---|---|---|---|---|
| **Motor Third-Party Liability** (`MOTOR_TPL`) | Legal liability to third parties for injury and property damage. | 18–80 | 10k – 150k | 900 / annual | car ≤ 20 yrs | true |
| **Motor Comprehensive** (`MOTOR_COMPREHENSIVE`) | Own damage, theft, fire and third-party cover with agency repair option. | 21–75 | 20k – 600k | 2.8k / annual | car ≤ 10 yrs; ≥ 2 yrs driving | true |

## Medical

- **Sold through:** broker, direct
- **Facts needed before the AI can assess:** smoker
- **Application documents:** national id, medical declaration

| Product | What it covers | Age | Cover | Base premium | Rules | Active |
|---|---|---|---|---|---|---|
| **Individual Medical Essential** (`MEDICAL_ESSENTIAL`) | In-patient and essential out-patient cover within a local network. | 18–65 | 150k – 1M | 4.5k / annual | — | true |
| **Family Medical Plus** (`MEDICAL_FAMILY`) | Family cover with a wider network, out-patient and dental benefits. | 18–60 | 500k – 5M | 14k / annual | ≥ 1 dependent(s) | true |

## Home

- **Sold through:** broker, direct
- **Facts needed before the AI can assess:** property year, rebuild value
- **Application documents:** national id, title deed or tenancy

| Product | What it covers | Age | Cover | Base premium | Rules | Active |
|---|---|---|---|---|---|---|
| **Home Contents** (`HOME_CONTENTS`) | Contents and personal belongings for tenants and owners. | 18–85 | 50k – 750k | 600 / annual | — | true |
| **Home Buildings & Contents** (`HOME_BUILDINGS_CONTENTS`) | Buildings and contents with accidental damage for owner-occupiers. | 25–85 | 500k – 8M | 2.2k / annual | property ≤ 80 yrs | true |

## Personal accident

- **Sold through:** broker, direct
- **Facts needed before the AI can assess:** occupation risk
- **Application documents:** national id

| Product | What it covers | Age | Cover | Base premium | Rules | Active |
|---|---|---|---|---|---|---|
| **Personal Accident Cover** (`PA_INDIVIDUAL`) | Lump sum for accidental death or disability, worldwide, 24/7. | 18–70 | 100k – 2M | 350 / annual | — | true |

## Life & protection

- **Sold through:** adviser
- **Facts needed before the AI can assess:** smoker, term years, annual income
- **Application documents:** national id, proof of income, medical questionnaire

| Product | What it covers | Age | Cover | Base premium | Rules | Active |
|---|---|---|---|---|---|---|
| **Term Life Protection** (`LIFE_TERM`) | Level cover for a fixed term; pays a lump sum on death or terminal illness. | 18–60 | 250k – 10M | 1.5k / monthly | term ends by age 75; cover ≤ 20× income | true |
| **Critical Illness Protection** (`LIFE_CRITICAL_ILLNESS`) | Lump sum on diagnosis of a listed critical illness. | 18–55 | 100k – 3M | 2k / monthly | term ends by age 70; cover ≤ 10× income | true |
| **Whole-of-Life Unit-Linked Plan** (`LIFE_WHOLE_OF_LIFE`) | Lifelong cover with an investment component linked to a fund range. | 18–65 | 500k – 20M | 12k / monthly | cover ≤ 25× income | true |

## Savings & wealth

- **Sold through:** adviser
- **Facts needed before the AI can assess:** term years, annual income, savings goal
- **Application documents:** national id, proof of income, source of funds

| Product | What it covers | Age | Cover | Base premium | Rules | Active |
|---|---|---|---|---|---|---|
| **Education Savings Plan** (`SAVINGS_EDUCATION`) | Regular savings towards a child's education with life cover built in. | 18–55 | 50k – 2M | 6k / monthly | ≥ 1 dependent(s); term ends by age 70; term ≥ 5 yrs | true |
| **Regular Savings Plan** (`SAVINGS_REGULAR`) | Flexible monthly savings into a choice of funds. | 18–60 | 50k – 5M | 6k / monthly | term ends by age 75; term ≥ 5 yrs | true |
| **Single-Premium Wealth Plan** (`SAVINGS_SINGLE_PREMIUM`) | One-off investment into a managed fund range with a death benefit. | 18–75 | 100k – 20M | 100k / single | term ≥ 5 yrs | true |

## Employee benefits

- **Sold through:** broker, employer
- **Facts needed before the AI can assess:** employee count
- **Application documents:** trade licence, employee census

| Product | What it covers | Age | Cover | Base premium | Rules | Active |
|---|---|---|---|---|---|---|
| **Group Medical Scheme** (`GROUP_MEDICAL`) | Employer medical scheme for staff and dependants. | n/a | 150k – 5M | 60k / annual | ≥ 5 employees; company applicant | true |
| **Group Life Scheme** (`GROUP_LIFE`) | Employer-paid death-in-service cover as a multiple of salary. | n/a | 100k – 10M | 25k / annual | ≥ 10 employees; company applicant | true |

## How the agent uses this

- A product is offered only if the applicant's age, requested cover and the product's rules pass, and it is sold through the customer's relationship owner.
- The AI ranks only those products, and may add up to two products from other lines the rules also allow (see business_rules.md, section 5).
