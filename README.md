# Cloud Sovereignty Index

Assess your cloud provider's sovereignty posture against **EU-CSF**, **BSI C3A**, or **CSI Composite** — three independent, source-faithful frameworks in one tool.

**Live tool → [cloud-sovereignty-index.pages.dev](https://cloud-sovereignty-index.pages.dev)**

---

## What it does

The Cloud Sovereignty Index guides you through a structured self-assessment of a cloud service across 8 sovereignty objectives:

- Strategic · Legal · Data · Operational · Supply Chain · Technology · Security · Sustainability

You choose which framework(s) to assess against. Each produces a completely independent result — no combined cross-mode score.

| Framework | Source | Output | Scope |
|-----------|--------|--------|-------|
| **EU-CSF** | EU Cloud Sovereignty Framework v1.2.1 (European Commission) | SEAL 0–4 per objective | SOV-1 – SOV-8 |
| **C3A** | BSI Criteria enabling Cloud Computing Autonomy v1.0 | % Criterion met + % AC met | SOV-1 – SOV-6 |
| **CSI Composite (EU/EEA)** | CSI editorial framework | SEAL 0–4 (same as EU-CSF) | SOV-1 – SOV-8 |
| **CSI Composite (non-EU)** | CSI editorial framework | Maturity tier: Foundational → Developing → Advanced → Pioneering | SOV-1 – SOV-8 |

**Scope: cloud sovereignty only.** Security attestation (ISO 27001, SOC 2, BSI C5:2026) is assumed and not assessed. C5 is presupposed, not a CSI source.

---

## EU-CSF mode

Source-faithful SEAL scoring per EU-CSF §4 (weakest-link gate) and §5 (objective weights). `partial` counts as half points but does not satisfy the SEAL gate.

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

Binary pass/fail per criterion (C3A §1.3). `partial` counts as not-met. Two tiers:

- **Criterion** — base criteria, always in scope
- **Additional Criterion (AC)** — customer-selected before the assessment (C3A §1.4). Only selected ACs enter the denominator.

No SEAL, no partial credit, no SOV-7/8.

---

## CSI Composite mode

Editorial blend of EU-CSF and C3A, adapted for global organisations.

**EU/EEA variant:** Same SEAL 0–4 levels and weakest-link gate as EU-CSF. `partial` = half points, `planned` = 0 points.

**Non-EU (Generalized) variant:** Progressive Sovereignty Maturity model — no weakest-link gate. Score is a weighted percentage mapped to four named tiers:

| Tier | % Threshold | Meaning |
|------|-------------|---------|
| Foundational | 0–40% | Initial controls. Significant gaps. |
| Developing | 41–70% | Core controls operational. |
| Advanced | 71–90% | Comprehensive controls demonstrated. |
| Pioneering | 91–100% | Full posture. Tested continuity. |

Answer values in Generalized mode: `yes` = 100%, `partial` = 50%, `planned` = 25% (roadmap commitment with timeline), `no` = 0%, `n/a` = excluded.

Two fallback questions provide partial credit for providers unable to meet strict EU criteria. They are **only shown when the parent criterion is answered No** — they remain hidden otherwise:
- **SOV-4-01-FB** — security-cleared local residents as alternative to EU-citizen-only staffing
- **SOV-4-09-FB** — documented disconnect plan with annual tabletop exercise

Each question in the web questionnaire includes a **"Show guidance"** toggle that explains the question context, relevant standards (e.g. BSI C5:2026), and what good evidence looks like.

The tool shows "To reach [next tier]: X% more needed" alongside the top gap questions on the results page and in the PDF report.

---

## Variants

| Variant | Frameworks | Who it's for |
|---------|-----------|-------------|
| **EU / EEA** | EU-CSF · C3A · CSI Composite | EU/EEA organisations. Includes a national tier for country-specific criteria. |
| **Global** | CSI Composite | Any country. Country substituted for geographic references. No second (EU bloc) tier. |

---

## Offline workflow

Download a blank **XLSX template** at `/assess/template.xlsx`, fill it in, then upload it on the setup page.

- **Setup sheet** — country, company name, framework checkboxes (EU-CSF / C3A / CSI Composite)
- **Assessment sheet** — all questions with evidence and answer columns
- **Privacy sheet** — what data is and isn't stored

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

48 unit tests cover the scoring engine (EU-CSF, C3A, CSI Composite, multi-mode), tier resolution, and schema validation.

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
