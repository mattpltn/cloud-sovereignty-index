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

The control profile drives the layered risk register on the result page: only risks relevant to your posture are surfaced, and procurement bridge clauses are filtered per layer **and per profile** — each clause's `applies_when` narrows it within its risk's trigger, so the right remedy is shown. For example, the L1 facility-exit risk fires for both colocation and hyperscaler, but a **colocation** client (owns hardware on site) gets a physical-access/removal clause while a **hyperscaler** client (owns nothing on site — facility controls sit between the CSP and the data-centre operator) instead gets an **audit/transparency + exit-cooperation** clause.

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
- Questions filtered by your scoping profile: each question is tagged to **archetypes** (`JURISDICTION`, `PHYSICAL_CUSTODY`, `DATA_RESIDENCY_SERVICE`, `THIRD_PARTY_OPERATION`, `REVERSIBILITY`, `SUPPORT_CONTINUITY`, `SELF_SUFFICIENCY`) that fire on a facet deviation from the sovereign baseline. `show_when` predicates are **generated** from those tags (`scripts/gen-relevance.ts`), and coverage is measured (`scripts/coverage.ts`) — see [`RELEVANCE_ENGINE_COOKBOOK.md`](RELEVANCE_ENGINE_COOKBOOK.md). The key rule: ownership/operation/location questions vanish when you control that facet, but reversibility questions follow the software dependency (you can own a platform and still be unable to patch licensed software). A hidden question never hides a risk: if a structural risk it maps to is still live for your profile, it is recorded as a locked read-only **finding** instead of being dropped, consolidated into a single "Structural findings from your scope" summary on the review page — one entry per risk, even across objectives (guarded by `tests/no-silent-risk.test.ts`). The result page also plots an eight-axis **domain maturity radar** over SOV-1…SOV-8.
- Profile-determined questions are **auto-answered**: questions whose answer your control profile fully fixes (provider jurisdiction, data residency, operator location) are derived from the profile via `shared/src/structural-answers.ts`, **count in the score** like typed answers (merged authoritatively in the worker, manual overrides win), and are listed with their reasons in an editable "Answers set by your declared infrastructure" panel on the review page — so a foreign provider can't inflate by not being asked, and an in-country deployment is credited for the residency it has. This applies across **every framework** (a foreign provider is foreign whether scored against CSI, EU-CSF, C3A, or CADA), so these in-country facts are never put to the user as "nonsense" questions. Only pure facts are derived; provider offerings/processes (resisting compelled access, escrow, exit drills) stay asked.
- **Every recommendation is tagged by who must act.** A shared classifier `actionOwnerForQuestion(q, profile)` (`shared/src/action-owner.ts`) splits findings into three tracks: **supplier management** ("Provider / contract" — require it from the provider / negotiate a clause), **internal improvement** ("Internal" — your own organisation builds and operates it), and **residual / inherent** ("Residual / inherent"). A `SELF_SUFFICIENCY` archetype → internal, the other six archetypes → supplier, otherwise the resolved operator at the concern layer (`operatorForLayer`) decides — so the same reversibility gap is an internal engineering action on a self-run OSS stack but a supplier contract ask against a hyperscaler. The **inherent** track catches (a) criteria flagged `foreign_provider_precluded` — things an out-of-country provider structurally cannot satisfy (in-country inference/connectivity/source/ops, submission to national authority, state takeover, resisting its own home jurisdiction) — and (b) the pure jurisdiction/residency/operations **facts** the profile fixes to "no" (`structuralNoIds`: provider domicile, data residence, operating personnel, SOC), so a foreign provider never gets the nonsensical "Add to contract: be under {country} jurisdiction" action. When scoping says the provider is foreign (`providerForeign`: any service layer L3–L5 non-domestic) these are **auto-scored "no" silently, dropped from the questionnaire, and shown in the transparency panel** (`structural-answers.ts`) — the question is suppressed, never the gap, so the score stays honest. Data **residency** facts (SOV-3-01*) and infrastructure-location facts (SOV-4-13-CADA) test **location only** — a foreign vendor *operating* an in-country layer does not move the bytes abroad (that exposure is the jurisdiction/compelled-access criteria), so the model never states the falsehood "data is not resident" about data that physically sits in-country. In the report inherent gaps are framed as a **deliberate, outcome-based tradeoff** (move the layer to an in-country/sovereign provider, or accept & govern it — data-sensitivity scoping, customer-held keys, exit plan), weighed against security maturity and cost, rather than an un-contractable provider ask. When the provider is in-country the same criteria are asked normally. A closure test (`tests/foreign-provider-precluded.test.ts`) asserts every in-country location-mandate criterion is reconciled (structural or flagged) so a new residency/jurisdiction criterion can't silently slip through. The result page leads with a **"What to do next"** three-track summary (`ActionTracks`) — surfacing the contract-clause templates — and every gap/blocker/clause (web + PDF) carries an owner pill.
- **The score is sovereignty, assessed assuming security — and it says so.** Both the result page and the PDF carry a *"How to read this score"* note: this instrument measures sovereignty (control × jurisdiction per layer) and **presupposes a security baseline it does not verify** (BSI C5:2026 or equivalent) — a mature external provider may be *more* secure than an in-house build, so a low sovereignty score is not a safety verdict and must be complemented by a security/risk assessment that can weigh the tradeoff the other way. In-country/in-house is **not** automatically sovereign (SOV-5 supply chain and SOV-7 continuity gate a self-built solution just as hard), and sovereignty is a **deliberate, outcome-based tradeoff** — consistent with the World Bank's June 2026 outcome-based view, blanket localisation carries real cost (OECD: 15–55% higher hosting for SMEs) and accept-and-govern is a first-class outcome, not a failure to fix. Non-EU reports render the adapted (jurisdiction-neutral) wording **and titles** everywhere — questionnaire, result page, PDF, and risk-register export agree (`tests/non-eu-presentation.test.ts` asserts both body text and Generalized titles are EU-free).
- **One source of truth for "does this question apply?"** — `isQuestionApplicable(q, profile, answers)` in `shared/src/relevance.ts` evaluates `relevance.show_when`, `applicability_condition`, and `parent_criterion_id` gating, and is shared by the questionnaire (what to show) and the scorers (what enters the gate / denominator). This is what makes **CADA** score correctly: its cumulative UAL 1–4 gate runs only over questions actually applicable to your profile (and reads tiered answers), so hidden questions can never count as gate failures — answering everything shown as compliant for an in-country provider yields UAL 4, while a foreign hyperscaler fails honestly.
- Every CSI question that re-words its source carries a collapsible **"Original source wording"** revealing the verbatim source sentence, so amendments stay auditable.
- The CSI headline reports a **readiness %** (coverage) and a **maturity tier gated by the weakest sovereignty domain** (`weakest_link_csl` in `scoreCsiComposite`, excluding SOV-8/ESG) — a high % can't read "Strategic Autonomy" while a domain is "Dependent"; the result page lists the **blocking objectives** that gate it. CSI levels are **CSL** (Cloud Sovereignty Level), never SEAL (an EU-CSF concept).
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
