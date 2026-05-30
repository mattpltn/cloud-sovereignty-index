#!/usr/bin/env python3
"""
Apply EU-CSF faithfulness gap fixes to data/criteria.json:
  1. SOV-5-05 bloc tier: add text_generalized (removes C5:2026 exposure in non-C3A modes)
  2. Insert 5 new EU-CSF questions: SOV-1-05, SOV-1-06, SOV-1-07, SOV-2-04, SOV-6-04
  3. Bump instrument_version to 2.2
"""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PATH = os.path.join(ROOT, "data", "criteria.json")

with open(PATH, encoding="utf-8") as f:
    data = json.load(f)

# ── 1. SOV-5-05 bloc tier text_generalized ─────────────────────────────────────
for obj in data["objectives"]:
    for q in obj["questions"]:
        if q["id"] == "SOV-5-05":
            q["tiers"]["bloc"]["text_generalized"] = (
                "Capacity management covering resource planning, usage monitoring, "
                "and capacity control MUST be performed within {{BLOC}}."
            )
            print("Fixed SOV-5-05 bloc text_generalized")

# ── 2. New questions ───────────────────────────────────────────────────────────

NEW_QUESTIONS = {
    "SOV-1": [
        {
            "id": "SOV-1-05",
            "title": "EU Financing & Investment Anchoring",
            "type": "single",
            "applies_to_eu_csf": True,
            "applies_to_c3a": False,
            "applies_to_csi_composite": True,
            "c3a_tier": "not_applicable",
            "text": (
                "Does the cloud service provider rely predominantly on EU-sourced financing "
                "(EU-domiciled institutional investors, EU public funding, EU capital markets), "
                "and can it demonstrate material investment in EU infrastructure, EU-based jobs, "
                "and EU value creation as part of its core operating model?"
            ),
            "text_generalized": (
                "Does the cloud service provider rely predominantly on domestically-sourced or "
                "regionally-sourced financing, and can it demonstrate material investment in local "
                "infrastructure, local jobs, and local value creation as part of its core operating model?"
            ),
            "supplementary_info": (
                "\"EU-sourced financing\" covers investors incorporated and tax-resident in EU member states, "
                "EIB/EIF instruments, and EU structural funds. Non-EU minority shareholders or bond-holders "
                "do not automatically disqualify, but a majority-non-EU investor base is material evidence "
                "against this criterion."
            ),
            "seal_contribution": 2,
            "points": 4,
            "source": {"doc": "EU-CSF", "clause": "§4 SOV-1 contributing factor: EU-sourced financing and EU investment"},
            "seal_contribution_eu_csf": 2,
            "seal_contribution_csi": 2,
        },
        {
            "id": "SOV-1-06",
            "title": "EU Strategic Initiative Alignment",
            "type": "single",
            "applies_to_eu_csf": True,
            "applies_to_c3a": False,
            "applies_to_csi_composite": True,
            "c3a_tier": "not_applicable",
            "text": (
                "Does the cloud service provider actively participate in EU-level digital sovereignty "
                "initiatives (e.g., Gaia-X, EUCS, IPCEI-CIS, EU Sovereign Cloud Label) and demonstrate "
                "consistency with the EU's digital, green, and industrial sovereignty objectives?"
            ),
            "text_generalized": (
                "Does the cloud service provider actively participate in nationally- or regionally-endorsed "
                "cloud sovereignty or digital independence initiatives, and demonstrate consistency with the "
                "country's stated digital strategy objectives?"
            ),
            "supplementary_info": (
                "Participation is evidenced by formal membership, published contributions, or certified "
                "compliance with initiative requirements — not self-declaration of alignment. Certification "
                "under EUCS (ENISA EU Cloud Services scheme) is the strongest evidence."
            ),
            "seal_contribution": 3,
            "points": 4,
            "source": {"doc": "EU-CSF", "clause": "§4 SOV-1 contributing factor: involvement in EU initiatives and digital sovereignty objectives"},
            "seal_contribution_eu_csf": 3,
            "seal_contribution_csi": 3,
        },
        {
            "id": "SOV-1-07",
            "title": "Operational Resilience Against Coercion",
            "type": "single",
            "applies_to_eu_csf": True,
            "applies_to_c3a": False,
            "applies_to_csi_composite": True,
            "c3a_tier": "not_applicable",
            "text": (
                "Does the cloud service provider have documented legal, operational, and technical measures "
                "enabling it to continue providing the contracted service even if subject to a foreign "
                "government request to cease or suspend operations, or if a key upstream vendor withdraws support?"
            ),
            "supplementary_info": (
                "Evidence includes: legal opinion on the provider's obligations under competing jurisdictions, "
                "vendor-independent operational runbooks covering the top-3 upstream dependencies, and at least "
                "one documented contingency drill in the past 12 months."
            ),
            "seal_contribution": 3,
            "points": 5,
            "source": {"doc": "EU-CSF", "clause": "§4 SOV-1 contributing factor: sustain operations against suspension requests or vendor disruption"},
            "seal_contribution_eu_csf": 3,
            "seal_contribution_csi": 3,
        },
    ],
    "SOV-2": [
        {
            "id": "SOV-2-04",
            "title": "IP Jurisdiction",
            "type": "single",
            "applies_to_eu_csf": True,
            "applies_to_c3a": False,
            "applies_to_csi_composite": True,
            "c3a_tier": "not_applicable",
            "text": (
                "Is the intellectual property underlying the cloud service created, registered, and primarily "
                "developed within the EU, subject to EU intellectual property law, with no encumbering foreign "
                "IP claims that could restrict the customer's access to or use of the service under EU law?"
            ),
            "text_generalized": (
                "Is the intellectual property underlying the cloud service created, registered, and primarily "
                "developed within {{COUNTRY}} or {{BLOC}}, subject to national intellectual property law, "
                "with no encumbering foreign IP claims that could restrict the customer's access to or use "
                "of the service under national law?"
            ),
            "supplementary_info": (
                "IP domicile is assessed at the level of the core platform IP (not third-party libraries). "
                "Foreign subsidiary IP held by an EU parent is acceptable if it remains subject to EU law via "
                "contractual and corporate structure. Foreign IP held by a non-EU parent and licensed back "
                "creates material risk of access restriction."
            ),
            "seal_contribution": 2,
            "points": 4,
            "source": {"doc": "EU-CSF", "clause": "§4 SOV-2 contributing factor: location of IP creation, registration, and development"},
            "seal_contribution_eu_csf": 2,
            "seal_contribution_csi": 2,
        },
    ],
    "SOV-6": [
        {
            "id": "SOV-6-04",
            "title": "EU HPC Independence",
            "type": "single",
            "applies_to_eu_csf": True,
            "applies_to_c3a": False,
            "applies_to_csi_composite": True,
            "c3a_tier": "not_applicable",
            "text": (
                "For compute-intensive workloads (AI/ML inference, data analytics, simulation), can the cloud "
                "service provider demonstrate that its high-performance computing capability — including the "
                "processors, accelerators (GPUs/TPUs), and software ecosystems used — is sourced from "
                "EU-controlled or EU-accessible supply chains, with no critical dependency on a single non-EU "
                "semiconductor vendor whose withdrawal would materially impair the service?"
            ),
            "text_generalized": (
                "For compute-intensive workloads (AI/ML inference, data analytics, simulation), can the cloud "
                "service provider demonstrate that its high-performance computing capability has supply chain "
                "diversification sufficient to continue operations if access to any single non-{{BLOC}} "
                "semiconductor or accelerator vendor is disrupted?"
            ),
            "supplementary_info": (
                "\"EU-accessible\" means the processor/accelerator is obtainable under normal trade terms "
                "without export licence restrictions. Concentration risk: if >75% of HPC capacity depends on "
                "a single non-EU accelerator family (e.g., NVIDIA H-series), this criterion is not met at "
                "the strictest level."
            ),
            "seal_contribution": 3,
            "points": 4,
            "source": {"doc": "EU-CSF", "clause": "§4 SOV-6 contributing factor: EU independence in high-performance computing capabilities"},
            "seal_contribution_eu_csf": 3,
            "seal_contribution_csi": 3,
        },
    ],
}

# Insert new questions into their respective objectives, after the last existing question
existing_ids = {q["id"] for obj in data["objectives"] for q in obj["questions"]}
for obj in data["objectives"]:
    obj_id = obj["id"]
    if obj_id in NEW_QUESTIONS:
        for new_q in NEW_QUESTIONS[obj_id]:
            if new_q["id"] not in existing_ids:
                obj["questions"].append(new_q)
                print(f"Inserted {new_q['id']}: {new_q['title']}")
            else:
                print(f"Skipped {new_q['id']} (already exists)")

# ── 3. Bump version ────────────────────────────────────────────────────────────
data["instrument_version"] = "2.2"

with open(PATH, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write("\n")

print("Done — instrument_version bumped to 2.2")
