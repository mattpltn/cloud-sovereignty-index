# Cloud Sovereignty Index

Assess your cloud provider's sovereignty posture against **EU-CSF**, **BSI C3A**, or **CSI Composite** — three independent, source-faithful frameworks in one tool.

**Live tool → [cloud-sovereignty-index.pages.dev](https://cloud-sovereignty-index.pages.dev)**

---

## What it does

The Cloud Sovereignty Index guides you through a structured self-assessment of a cloud service across 8 sovereignty objectives:

- Strategic · Legal · Data · Operational · Supply Chain · Technology · Security · Sustainability

You choose which framework(s) to assess against and which sovereignty domains to include. Each framework produces a completely independent result — no combined cross-mode score.

| Framework | Source | Output | Scope |
|-----------|--------|--------|-------|
| **EU-CSF** | EU Cloud Sovereignty Framework v1.2.1 (European Commission) | SEAL 0–4 per objective | SOV-1 – SOV-8 |
| **C3A** | BSI Criteria enabling Cloud Computing Autonomy v1.0 | Attainment band (Not Attained / Partially / Substantially / Fully Attained) + AC attainment | SOV-1 – SOV-6 |
| **CSI Composite (EU/EEA)** | CSI editorial framework | SEAL 0–4 (same as EU-CSF) | SOV-1 – SOV-8 |
| **CSI Composite (non-EU)** | CSI editorial framework | Sovereignty Ladder: Dependent → Managed Dependency → Strategic Autonomy → Sovereign | SOV-1 – SOV-8 |

**Scope: cloud sovereignty only.** Security attestation (ISO 27001, SOC 2, BSI C5) is assumed and not assessed. C5 is presupposed by C3A, not a CSI source.

---

## EU-CSF mode

Source-faithful SEAL scoring per EU-CSF §4 (weakest-link gate) and §5 (objective weights). `partial` counts as half points but does not satisfy the SEAL gate.

55 questions covering all EU-CSF v1.2.1 §4 contributing factors. Each question is labelled with its source relationship:

- **Direct** (green) — maps verbatim to a named contributing factor
- **Inferred** (amber) — operationalizes the intent of a CF where EU-CSF states a principle but not a specific question; the derivation rationale is shown inline
- **CSI** (purple) — editorial addition not in EU-CSF, included for completeness

| Level | Label |
|-------|-------|
| 0 | No Sovereignty |
| 1 | Jurisdictional Sovereignty |
| 2 | Data Sovereignty |
| 3 | Digital Resilience |
| 4 | Full Digital Sovereignty |

The SEAL is the highest level L where **all** criteria with contribution ≤ L are answered Yes. Overall SEAL = minimum across objectives.

---

## C3A mode

Binary pass/fail per criterion (C3A §1.3). `partial` counts as not-met. All 49 questions are verbatim from C3A v1.0. Two tiers:

- **Criterion** — base criteria, always in scope
- **Additional Criterion (AC)** — customer-selected before the assessment (C3A §1.4). Only selected ACs enter the denominator.

No SEAL, no partial credit, no SOV-7/8.

---

## CSI Composite mode

Editorial blend of EU-CSF and C3A, adapted for global organisations.

**EU/EEA variant:** Same SEAL 0–4 levels and weakest-link gate as EU-CSF. `partial` = half points, `planned` = 0 points.

**Non-EU (Generalized) variant:** Sovereignty Ladder — no weakest-link gate. Score is a weighted percentage mapped to four named tiers:

| Tier | % Threshold | Meaning |
|------|-------------|---------|
| Dependent | 0–40% | Initial controls. Significant gaps. |
| Managed Dependency | 41–70% | Core controls operational. |
| Strategic Autonomy | 71–90% | Comprehensive controls demonstrated. |
| Sovereign | 91–100% | Full posture. Tested continuity. |

Answer values in Generalized mode: `yes` = 100%, `partial` = 50%, `planned` = 25% (roadmap commitment with timeline), `no` = 0%, `n/a` = excluded.

Five fallback questions provide partial credit for providers unable to meet strict criteria. They are **only shown when the parent criterion is answered No**:

- **SOV-4-01-FB** — security-cleared local residents (alternative to EU-citizen-only staffing)
- **SOV-4-03-FB** — multi-homed BGP routing (alternative to independent-ISP connectivity)
- **SOV-4-09-FB** — documented disconnect plan with annual tabletop exercise
- **SOV-6-01-FB1** — local build-from-source capability
- **SOV-6-01-FB2** — documented exit plan with tested data export

---

## Scoping flow

Before the questionnaire, a scoping wizard builds your **control profile** — who owns, operates, and supports each infrastructure layer:

1. **Scenario picker** — choose from: Global cloud provider, Local/regional CSP, Colocation, Own datacenter, Managed service, or Mixed
2. **Refine table** — review and adjust pre-filled ownership/operation/dependency/location per layer (L1–L6)
3. **Readback** — confirm the profile before the questionnaire starts

The control profile drives the layered risk register on the result page: only risks relevant to your posture are surfaced, and procurement bridge clauses are filtered per layer.

Layers follow established frameworks (NIST SP 500-292, EU Data Act Art. 23/30, C3A §2.4). See [Methodology §6](https://cloud-sovereignty-index.pages.dev/methodology) for the full layer alignment table.

---

## Domain selector

At setup, you can restrict the assessment to specific sovereignty domains (e.g. Data only, or Operational + Supply Chain). Unselected domains are excluded from the questionnaire and scoring. Default is all 8 domains.

---

## Variants

| Variant | Frameworks | Who it's for |
|---------|-----------|-------------|
| **EU / EEA** | EU-CSF · C3A · CSI Composite | EU/EEA organisations. Includes a national tier for country-specific criteria. |
| **Global** | CSI Composite | Any country. Country substituted for geographic references. No second (EU bloc) tier. |

---

## Questionnaire design

- Questions are written to be **simple and directly answerable** — editorial rewrites of framework legalese, not verbatim clause text
- Every question shows a **source reference** (framework name + clause identifier) linking it to the original control — traceable but readable
- Questions filtered by your scoping profile: each question is tagged to **archetypes** (`JURISDICTION`, `PHYSICAL_CUSTODY`, `DATA_RESIDENCY_SERVICE`, `THIRD_PARTY_OPERATION`, `REVERSIBILITY`, `SUPPORT_CONTINUITY`, `SELF_SUFFICIENCY`) that fire on a facet deviation from the sovereign baseline. `show_when` predicates are **generated** from those tags (`scripts/gen-relevance.ts`), and coverage is measured (`scripts/coverage.ts`) — see [`RELEVANCE_ENGINE_COOKBOOK.md`](RELEVANCE_ENGINE_COOKBOOK.md). The key rule: ownership/operation/location questions vanish when you control that facet, but reversibility questions follow the software dependency (you can own a platform and still be unable to patch licensed software). A hidden question never hides a risk: if a structural risk it maps to is still live for your profile, it is surfaced inline as a locked read-only **finding** instead of being dropped (guarded by `tests/no-silent-risk.test.ts`)
- EU-specific questions (e.g. GDPR references, Gaia-X) are suppressed for non-EU/EEA assessments; re-aimed variants (both question text and card title) shown instead
- SEAL badge appears only for EU-CSF and C3A modes — CSI Composite uses its own maturity tiers

---

## Offline workflow

Download a blank **XLSX template** at `/assess/template.xlsx`, fill it in, then upload it on the setup page.

- **Setup sheet** — country, company name, framework checkboxes (EU-CSF / C3A / CSI Composite)
- **Assessment sheet** — questions with answer, evidence, and source reference columns
- **Sources sheet** — full source register (framework citations travel with the workbook)
- **Privacy sheet** — what data is and isn't stored

The template is generated from `criteria.json` and is always in sync with the online questionnaire.

---

## Not affiliated with BSI or the European Commission

This tool is community-built and **not affiliated with or endorsed by the German Federal Office for Information Security (BSI) or the European Commission**. It is a self-assessment tool, not a certification. Official EU-CSF and C3A audits require licensed auditors.

---

## Privacy

- No accounts, no cookies, no tracking
- Assessments stored under a random ID — the URL is the access control
- Company name stored only if you provide it
- Assessments inactive for 12 months are deleted

---

## Architecture

```
Browser → Cloudflare Pages (Astro 5 SSR)
            ↓ /api/* (Pages Function proxy)
          Cloudflare Workers (Hono API)
            ↓ D1 binding
          Cloudflare D1 (SQLite)
```

**Monorepo layout:**

```
src/        Astro 5 SSR frontend (@astrojs/cloudflare)
workers/    Hono API on Cloudflare Workers
shared/     Scoring engine and types (used by both)
data/       criteria.json, countries.json, decisions-register.json
functions/  Cloudflare Pages Function (/api/* proxy)
```

---

## Local development

```bash
pnpm install

# Terminal 1 — Workers API (port 8787)
pnpm --filter workers dev

# Terminal 2 — Astro frontend (port 4321)
pnpm --filter src dev
```

Open [localhost:4321](http://localhost:4321). The Vite dev server proxies `/api/*` to port 8787.

---

## Running tests

```bash
pnpm test
```

51 unit tests cover the scoring engine (EU-CSF, C3A, CSI Composite, multi-mode), tier resolution, and schema validation.

---

## Deployment

Deployed automatically on push to `main`:

- **Cloudflare Pages** — Astro frontend (build command: `pnpm --filter src build`, output: `src/dist`)
- **Cloudflare Workers** — API via GitHub Actions using `CLOUDFLARE_API_TOKEN` secret

---

## License

[MIT](LICENSE)

---

## Based on

- [EU Cloud Sovereignty Framework v1.2.1](https://digital-strategy.ec.europa.eu/en/policies/cloud-sovereignty)
- [BSI C3A — Criteria enabling Cloud Computing Autonomy v1.0](https://www.bsi.bund.de/SharedDocs/Downloads/EN/BSI/CloudComputing/C3A/BSI-C3A-v1.0.pdf)
