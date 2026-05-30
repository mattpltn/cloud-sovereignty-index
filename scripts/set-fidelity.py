#!/usr/bin/env python3
"""
Populate eu_csf_fidelity / c3a_fidelity fields in data/criteria.json.

Classification rules:
  direct   = question maps to a named contributing factor in EU-CSF v1.2.1 §4,
              or verbatim MUST/SHOULD criterion text in C3A v1.0
  inferred = derived from the spirit / intent of a framework CF or SI,
             but not verbatim
  csi      = CSI editorial addition; not derived from either framework

Run: python3 scripts/set-fidelity.py
"""

import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CRITERIA_PATH = os.path.join(ROOT, "data", "criteria.json")

# ---------------------------------------------------------------------------
# EU-CSF fidelity mapping
# Format: question_id -> (fidelity, rationale_or_None)
# Only set for questions where applies_to_eu_csf = True
# ---------------------------------------------------------------------------
EU_CSF = {
    # SOV-1  ──────────────────────────────────────────────────────────────
    "SOV-1-01": ("direct", None),
    "SOV-1-02": (
        "inferred",
        "Derived from EU-CSF SOV-1 CF: 'Ensuring that bodies having decisive authority over your services are located within EU jurisdiction.' A registered head office is the primary legal indicator of this jurisdictional anchoring under EU company law. EU-CSF names the control objective; registered-office location is the standard evidentiary proxy.",
    ),
    "SOV-1-03": ("direct", None),
    "SOV-1-04": ("direct", None),
    # SOV-2  ──────────────────────────────────────────────────────────────
    "SOV-2-01": ("direct", None),
    "SOV-2-02": (
        "inferred",
        "Derived from EU-CSF SOV-2 CF: 'Existence of legal, contractual, or technical channels through which non-EU authorities could compel access to data or systems.' Audit rights operationalize the customer's ability to verify what access channels exist — the contractual enforcement mechanism for this CF. The EU-CSF framework does not name audit rights explicitly in SOV-2; the closest named CF is in SOV-7.",
    ),
    "SOV-2-03": (
        "inferred",
        "Derived from EU-CSF SOV-2 CF: 'Applicability of international regimes, which may restrict usage or transfer' and SOV-1 CF: 'Ability to sustain secure operations against requests to cease or suspend the service.' The state-of-defense takeover question operationalizes the most extreme legal-regime case. EU-CSF names the principle; C3A defines the specific constitutional trigger (state of defense).",
    ),
    # SOV-3  ──────────────────────────────────────────────────────────────
    "SOV-3-01": ("direct", None),
    "SOV-3-01-C1": (
        "inferred",
        "Derived from EU-CSF SOV-3 CF: 'Strict confinement of storage and processing to European jurisdictions, with no fallback to third countries.' Disclosure of data locations is a prerequisite for verifying confinement — without transparency, the customer cannot confirm this CF is met. Transparency is implied by the confinement standard but not named as a separate CF.",
    ),
    "SOV-3-01-C2": ("direct", None),
    "SOV-3-01-C5": (
        "inferred",
        "Derived from EU-CSF SOV-3 CF: 'Strict confinement of storage and processing to European jurisdictions.' Provider-operational data (configuration, telemetry, resource allocations) is not named explicitly in the CF, but is subject to the same confinement principle. Provider data can contain sovereignty-sensitive operational intelligence about infrastructure and capacity.",
    ),
    "SOV-3-02-C": ("direct", None),
    "SOV-3-02-AC": (
        "inferred",
        "Derived from EU-CSF SOV-3 CF: 'Only the customer has effective control over cryptographic access to their data.' The SaaS extension applies this principle to the SaaS delivery model where key management is architecturally more complex. EU-CSF states the principle without distinguishing by service type; this criterion operationalizes it for SaaS.",
    ),
    "SOV-3-03-C": (
        "csi",
        None,
    ),
    "SOV-3-03-AC1": (
        "inferred",
        "C3A-specific technical implementation requirement. Derived from EU-CSF SOV-3 CF on customer-controlled access. Open, non-proprietary IdP standards prevent vendor lock-in in the authentication layer — a sovereignty concern the CF implies but does not detail.",
    ),
    "SOV-3-03-AC2": (
        "inferred",
        "C3A-specific technical implementation requirement. Derived from EU-CSF SOV-3 CF on customer-controlled access. A stateless authentication model prevents the CSP from creating account dependencies inside its own directory — preserving the customer's control over identity data.",
    ),
    "SOV-3-03-AC3": (
        "inferred",
        "C3A-specific technical implementation requirement. Derived from EU-CSF SOV-3 CF on customer-controlled access. Dynamic claim-based authorization keeps authorization logic inside the customer's authority rather than delegating it to the CSP's directory.",
    ),
    "SOV-3-04-C": ("direct", None),
    "SOV-3-04-AC1": (
        "inferred",
        "Derived from EU-CSF SOV-3 CF: 'Visibility into when, where, and by whom data is accessed.' Real-time open-API log access is the technical mechanism that makes this visibility exercisable in practice. EU-CSF names the principle; C3A specifies the implementation.",
    ),
    "SOV-3-04-AC2": (
        "inferred",
        "Derived from EU-CSF SOV-3 CF: 'Visibility into when, where, and by whom data is accessed.' Granular filtering is the operational control enabling the customer to isolate specific events — a prerequisite for meaningful auditability at scale.",
    ),
    "SOV-3-05-C": ("direct", None),
    "SOV-3-AI-01-AC": (
        "inferred",
        "Derived from EU-CSF SOV-3 CF: 'AI models and data pipelines developed, trained, hosted, and governed under EU control.' Training data jurisdiction disclosure is the prerequisite for verifying EU-controlled training — you cannot substantiate that training occurred under EU control without disclosing where training data was collected and processed. EU-CSF names the control objective; the specific disclosure requirement is a CSI operationalization.",
    ),
    "SOV-3-AI-02-AC": (
        "inferred",
        "Derived from EU-CSF SOV-3 CF: 'AI models and data pipelines hosted and governed under EU control.' Inference is the moment customer data is actively processed through the model — the 'hosted/processed' dimension of the CF. EU-CSF names the principle; this question requires contractual and technical enforcement of in-EU inference location.",
    ),
    "SOV-3-AI-03-AC": (
        "inferred",
        "Derived from EU-CSF SOV-3 CF: 'AI models governed under EU control, minimizing dependency on non-EU technology stacks.' Customer opt-out from training data use is a governance control ensuring the customer retains sovereignty over how their data shapes model behaviour — the CF implies governance control but does not specify this mechanism.",
    ),
    "SOV-3-AI-04-AC": (
        "inferred",
        "Derived from EU-CSF SOV-3 CF: 'Minimizing dependency on non-EU technology stacks.' Knowing the model provider's jurisdiction, ownership, and control chain is the prerequisite for assessing whether a dependency constitutes a non-EU technology stack risk. EU-CSF names the risk category; this question operationalizes the supply-chain disclosure needed to assess it.",
    ),
    # SOV-4  ──────────────────────────────────────────────────────────────
    "SOV-4-01": ("direct", None),
    "SOV-4-01-C3": (
        "inferred",
        "Derived from EU-CSF SOV-4 CF: 'EU-based talent pool with the expertise to operate and sustain the service' and 'Capacity for EU operators to manage, maintain, and support the technology without requiring non-EU vendor involvement.' A standalone European organisation for operating personnel is C3A's strictest operationalization of these CFs. EU-CSF states the principle; C3A defines the structural requirement.",
    ),
    "SOV-4-02": ("direct", None),
    "SOV-4-03": (
        "inferred",
        "Derived from EU-CSF SOV-4 CF: 'Capacity for EU operators to manage, maintain, and support the technology without requiring non-EU vendor involvement.' Redundant independent connectivity is the network infrastructure prerequisite for continuous EU-controlled operations — single-provider failure would collapse operational sovereignty regardless of personnel or process controls. Not named as a contributing factor in EU-CSF SOV-4.",
    ),
    "SOV-4-03-AC": (
        "inferred",
        "Derived from EU-CSF SOV-4 CF on operational independence. Independence of connectivity provider from the CSP corporate structure reduces concentration risk: the CSP cannot simultaneously lose both service and connectivity in a single corporate event (e.g., sanctions, acquisition, liquidation).",
    ),
    "SOV-4-04": (
        "inferred",
        "EU-CSF explicitly places SOC under SOV-7 CF: 'Security Operations Centres and response teams operating exclusively under EU jurisdiction.' This criterion follows C3A §2.4.4 in classifying SOC as an operational sovereignty matter (SOV-4). When used in EU-CSF scoring, the question contributes to SOV-4 but its primary source reference is the SOV-7 contributing factor.",
    ),
    "SOV-4-05": (
        "inferred",
        "Derived from EU-CSF SOV-4 CF: 'Capacity for EU operators to manage without requiring non-EU vendor involvement.' Ingress data control gateways are the network-layer enforcement mechanism for EU-bounded operations — without controlled ingress, external actors can bypass EU operational controls.",
    ),
    "SOV-4-05-AC1": (
        "inferred",
        "C3A-specific implementation requirement (dedicated physical devices for DMZ). Derived from EU-CSF SOV-4 operational independence principle at a level of technical specificity not present in the EU-CSF contributing factors.",
    ),
    "SOV-4-05-AC2": (
        "inferred",
        "C3A-specific regulatory transparency requirement. Derived from EU-CSF SOV-4 accountability principle — 'operational support subject exclusively to EU legal frameworks' implies disclosure obligations to EU cybersecurity authorities.",
    ),
    "SOV-4-06": (
        "inferred",
        "Derived from EU-CSF SOV-4 CF: 'Availability of full technical documentation, source code, and operational know-how enabling long-term autonomy.' Threat-aware update analysis is the operational practice through which this autonomy is maintained against supply-chain attacks on the software update pipeline.",
    ),
    "SOV-4-07": (
        "inferred",
        "Derived from EU-CSF SOV-4 CF: 'Assurance that operational support is delivered from within the EU.' Data exchange monitoring provides runtime verification that EU-bounded operations remain bounded — without monitoring, EU operational sovereignty is an unverifiable claim.",
    ),
    "SOV-4-08": (
        "inferred",
        "Derived from EU-CSF SOV-4 CF: 'Capacity for EU operators to manage without requiring non-EU vendor involvement.' Data exchange gateways are the physical control points ensuring cross-boundary data flows remain under EU authority.",
    ),
    "SOV-4-08-AC": (
        "inferred",
        "C3A-specific regulatory transparency requirement. Derived from EU-CSF SOV-4 accountability principle. Disclosure of Data Flow Diagrams to cybersecurity authorities operationalizes EU oversight but is not named explicitly in EU-CSF.",
    ),
    "SOV-4-09": ("direct", None),
    "SOV-4-09-AC": (
        "inferred",
        "Derived from EU-CSF SOV-4 CF: 'Ease of migrating workloads.' The AC adds a regulatory disclosure obligation for disconnect documentation — not named in EU-CSF but implied by 'subject exclusively to EU legal frameworks.'",
    ),
    "SOV-4-10": ("direct", None),
    # SOV-5  ──────────────────────────────────────────────────────────────
    "SOV-5-01": ("direct", None),
    "SOV-5-01-AC": (
        "inferred",
        "Derived from EU-CSF SOV-5 CF: 'Origin of Software' and 'Visibility into the entire supplier and sub-supplier chain.' The risk-based mitigation process operationalizes the visibility principle as an ongoing organisational governance practice. EU-CSF states the concern; C3A specifies the process requirement.",
    ),
    "SOV-5-02": ("direct", None),
    "SOV-5-02-AC": (
        "inferred",
        "Derived from EU-CSF SOV-5 CF on hardware dependency visibility and audit rights. The risk-based mitigation process for hardware is C3A's operationalization of EU-CSF's supplier visibility principle.",
    ),
    "SOV-5-03": ("direct", None),
    "SOV-5-03-AC": (
        "inferred",
        "Derived from EU-CSF SOV-5 CF: 'Visibility into the entire supplier and sub-supplier chain, including audit rights.' The documented management process for external service dependencies is C3A's operationalization of the EU-CSF visibility and audit-rights principle.",
    ),
    "SOV-5-04": (
        "inferred",
        "Derived from EU-CSF SOV-2 CF: 'Applicability of international regimes, which may restrict usage or transfer.' Export restrictions are supply-chain continuity risks classified under SOV-5 following C3A §2.5.4, where they appear as supply chain risks rather than legal/jurisdictional risks.",
    ),
    "SOV-5-05": (
        "inferred",
        "Derived from EU-CSF SOV-4 CF: 'Capacity for EU operators to manage, maintain, and support the technology.' Capacity management performed within the EU ensures that scaling decisions and resource allocation remain under EU-controlled operations. Placed under SOV-5 following C3A §2.5.5, which classifies it as a supply-chain capacity control.",
    ),
    # SOV-6  ──────────────────────────────────────────────────────────────
    "SOV-6-01": ("direct", None),
    "SOV-6-02": ("direct", None),
    "SOV-6-02-AC": (
        "inferred",
        "Derived from EU-CSF SOV-6 CF: 'Ensuring transparency and adaptability' and SOV-4 CF: 'Availability of full technical documentation, source code, and operational know-how.' The capability to remediate vulnerabilities after supplier disruption extends source code sovereignty into post-disruption operational continuity.",
    ),
    "SOV-6-03": ("direct", None),
    # SOV-7 — all map to named contributing factors  ─────────────────────
    "SOV-7-01": ("direct", None),
    "SOV-7-02": ("direct", None),
    "SOV-7-03": ("direct", None),
    "SOV-7-04": ("direct", None),
    "SOV-7-05": ("direct", None),
    "SOV-7-06": ("direct", None),
    "SOV-7-07": ("direct", None),
    # SOV-8 — all map to named contributing factors  ─────────────────────
    "SOV-8-01": ("direct", None),
    "SOV-8-02": ("direct", None),
    "SOV-8-03": ("direct", None),
    "SOV-8-04": ("direct", None),
    "SOV-8-05": ("direct", None),
    # New gap-fill questions (v2.2+)  ─────────────────────────────────────
    "SOV-1-05": ("direct", None),
    "SOV-1-06": ("direct", None),
    "SOV-1-07": ("direct", None),
    "SOV-2-04": ("direct", None),
    "SOV-6-04": ("direct", None),
    "SOV-3-06": ("direct", None),
}

# ---------------------------------------------------------------------------
# C3A fidelity mapping
# Only set for questions where applies_to_c3a = True.
# All C3A-flagged criteria in the catalog are verbatim MUST/SHOULD
# requirements from C3A v1.0 — all are 'direct'.
# ---------------------------------------------------------------------------
C3A = {
    "SOV-1-01": ("direct", None),
    "SOV-1-02": ("direct", None),
    "SOV-1-03": ("direct", None),
    "SOV-1-04": ("direct", None),
    "SOV-2-01": ("direct", None),
    "SOV-2-02": ("direct", None),
    "SOV-2-03": ("direct", None),
    "SOV-3-01":    ("direct", None),
    "SOV-3-01-C1": ("direct", None),
    "SOV-3-01-C2": ("direct", None),
    "SOV-3-01-C5": ("direct", None),
    "SOV-3-02-C":  ("direct", None),
    "SOV-3-02-AC": ("direct", None),
    "SOV-3-03-C":  ("direct", None),
    "SOV-3-03-AC1":("direct", None),
    "SOV-3-03-AC2":("direct", None),
    "SOV-3-03-AC3":("direct", None),
    "SOV-3-04-C":  ("direct", None),
    "SOV-3-04-AC1":("direct", None),
    "SOV-3-04-AC2":("direct", None),
    "SOV-3-05-C":  ("direct", None),
    "SOV-4-01":    ("direct", None),
    "SOV-4-01-C3": ("direct", None),
    "SOV-4-02":    ("direct", None),
    "SOV-4-03":    ("direct", None),
    "SOV-4-03-AC": ("direct", None),
    "SOV-4-04":    ("direct", None),
    "SOV-4-05":    ("direct", None),
    "SOV-4-05-AC1":("direct", None),
    "SOV-4-05-AC2":("direct", None),
    "SOV-4-06":    ("direct", None),
    "SOV-4-07":    ("direct", None),
    "SOV-4-08":    ("direct", None),
    "SOV-4-08-AC": ("direct", None),
    "SOV-4-09":    ("direct", None),
    "SOV-4-09-AC": ("direct", None),
    "SOV-4-10":    ("direct", None),
    "SOV-5-01":    ("direct", None),
    "SOV-5-01-AC": ("direct", None),
    "SOV-5-02":    ("direct", None),
    "SOV-5-02-AC": ("direct", None),
    "SOV-5-03":    ("direct", None),
    "SOV-5-03-AC": ("direct", None),
    "SOV-5-04":    ("direct", None),
    "SOV-5-05":    ("direct", None),
    "SOV-6-01":    ("direct", None),
    "SOV-6-02":    ("direct", None),
    "SOV-6-02-AC": ("direct", None),
    "SOV-6-03":    ("direct", None),
}

# ---------------------------------------------------------------------------

def apply_fidelity(data: dict) -> dict:
    for obj in data["objectives"]:
        for q in obj["questions"]:
            qid = q["id"]

            # EU-CSF fidelity
            if q.get("applies_to_eu_csf") and qid in EU_CSF:
                fidelity, rationale = EU_CSF[qid]
                q["eu_csf_fidelity"] = fidelity
                if rationale:
                    q["eu_csf_fidelity_rationale"] = rationale
                elif "eu_csf_fidelity_rationale" in q:
                    del q["eu_csf_fidelity_rationale"]
            elif "eu_csf_fidelity" in q:
                del q["eu_csf_fidelity"]
                q.pop("eu_csf_fidelity_rationale", None)

            # C3A fidelity
            if q.get("applies_to_c3a") and qid in C3A:
                fidelity, rationale = C3A[qid]
                q["c3a_fidelity"] = fidelity
                if rationale:
                    q["c3a_fidelity_rationale"] = rationale
                elif "c3a_fidelity_rationale" in q:
                    del q["c3a_fidelity_rationale"]
            elif "c3a_fidelity" in q:
                del q["c3a_fidelity"]
                q.pop("c3a_fidelity_rationale", None)

    return data


def main():
    with open(CRITERIA_PATH, encoding="utf-8") as f:
        data = json.load(f)

    data = apply_fidelity(data)

    with open(CRITERIA_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")

    # Report
    eu_direct = eu_inferred = eu_csi = eu_none = 0
    c3a_direct = c3a_inferred = c3a_none = 0
    for obj in data["objectives"]:
        for q in obj["questions"]:
            f = q.get("eu_csf_fidelity")
            if f == "direct": eu_direct += 1
            elif f == "inferred": eu_inferred += 1
            elif f == "csi": eu_csi += 1
            else: eu_none += 1
            g = q.get("c3a_fidelity")
            if g == "direct": c3a_direct += 1
            elif g == "inferred": c3a_inferred += 1
            else: c3a_none += 1

    print(f"EU-CSF fidelity: {eu_direct} direct, {eu_inferred} inferred, {eu_csi} csi, {eu_none} not applicable")
    print(f"C3A fidelity:    {c3a_direct} direct, {c3a_inferred} inferred, {c3a_none} not applicable")
    print("Done.")


if __name__ == "__main__":
    main()
