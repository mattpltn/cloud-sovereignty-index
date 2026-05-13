# Cloud Sovereignty Index

Assess your cloud provider's sovereignty posture against the **EU Cloud Sovereignty Framework v1.2.1**, powered by BSI C5:2026 criteria.

**Live tool → [cloud-sovereignty-index.pages.dev](https://cloud-sovereignty-index.pages.dev)**

---

## What it does

The Cloud Sovereignty Index guides you through a structured assessment of a cloud service across 8 sovereignty objectives:

- Strategic · Legal · Data · Operational · Supply Chain · Technology · Security · Sustainability

Each question maps to a BSI C5:2026 control. Answers produce a weighted **0–100% score** and a **sovereignty level** (0–4).

The level is displayed as **SEAL** (Sovereignty Evaluation and Assurance Level) for EU/EEA assessments and **CSL** (Cloud Sovereignty Level) for non-EU assessments. Both use identical methodology — only the label differs.

| Level | Label |
|-------|-------|
| 0 | No Sovereignty |
| 1 | Minimal Sovereignty |
| 2 | Partial Sovereignty |
| 3 | Substantial Sovereignty |
| 4 | Full Digital Sovereignty |

The % score awards partial credit across all criteria. The SEAL/CSL level uses a stricter pass/fail gate per objective — a single unanswered foundational criterion caps the level regardless of overall score.

---

## Variants

| Variant | Metric | Who it's for |
|---------|--------|-------------|
| **EU / EEA** | SEAL | Organisations in EU or EEA member states. Includes an optional national tier with country-specific criteria (e.g. ANSSI for France, BSI for Germany). |
| **Global** | CSL | Any country outside the EU. Same criteria, with your country substituted for geographic references. No second (EU bloc) tier. |

The framework was originally designed around Germany and the BSI. The EU and global variants are simulations of how the same principles apply elsewhere — not official certifications. "CSL" is used instead of "SEAL" for non-EU assessments to avoid implying EU procurement compliance.

---

## Offline workflow

Don't want to answer questions in the browser? Download a blank **XLSX template** at `/assess/template.xlsx`, fill it in (or send it to your cloud provider), then upload it on the setup page to generate your score. The template has:

- **Setup sheet** — country dropdown, optional company name
- **EU Assessment sheet** — all questions with answer dropdowns
- **Global Assessment sheet** — same, without national tier
- **Privacy sheet** — what data is and isn't stored

---

## Not affiliated with BSI

This tool is community-built and **not affiliated with or endorsed by the German Federal Office for Information Security (BSI)**. It is a recommendation tool, not a certification. Official C5 attestations require a licensed auditor.

---

## Privacy

- No accounts, no cookies, no tracking
- Assessments stored under a random ID — the URL is the access control
- Company name stored only if you provide it
- Assessments inactive for 12 months are deleted

Full policy: [cloud-sovereignty-index.pages.dev/privacy](https://cloud-sovereignty-index.pages.dev/privacy)

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

36 unit tests cover the scoring engine and tier resolution logic.

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

- [EU Cloud Sovereignty Framework v1.2.1](https://digitaleurope.org/resources/cloud-sovereignty/)
- [BSI C5:2026](https://www.bsi.bund.de/EN/Themen/Unternehmen-und-Organisationen/Informationen-und-Empfehlungen/Empfehlungen-nach-Angriffszielen/Cloud-Computing/Kriterienkatalog-C5/kriterienkatalog-c5_node.html)
