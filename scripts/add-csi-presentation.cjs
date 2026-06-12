'use strict';
const fs = require('fs');
const path = require('path');

const criteriaPath = path.resolve(__dirname, '../data/criteria.json');
const criteria = JSON.parse(fs.readFileSync(criteriaPath, 'utf-8'));

// csi_presentation blocks per flagged question (from csi-presentation-layer-spec.md)
const blocks = {
  'SOV-3-01-C2': {
    title: 'Residency of Derived & Account Data',
    treatment: 'clean_adapt',
    variants: {
      non_eu: {
        shown: true,
        text: 'Does the provider offer a service option where derived data (telemetry, metadata, logs) and account data are stored and processed exclusively within {country}, or within {trusted_jurisdiction} where in-country is not available?',
      },
      eu: {
        shown: true,
        text: 'Does the provider offer a service option where cloud service derived data and account data are exclusively stored and processed within the Union?',
      },
    },
  },

  'SOV-2-05': {
    title: 'Protection Against Foreign Compelled Access',
    treatment: 'clean_adapt',
    variants: {
      non_eu: {
        shown: true,
        text: "Has the provider implemented and demonstrated legal, technical, and organisational measures that prevent authorities outside {country}'s jurisdiction from compelling access to customer data or systems through any channel — with such requests rejected and customers notified of any attempt?",
      },
      eu: {
        shown: true,
        text: 'Has the provider implemented and demonstrated measures that prevent non-EU authorities from compelling access to customer data or systems through any channel — with such requests rejected and customers notified?',
      },
    },
  },

  'SOV-4-13-CADA': {
    title: 'Infrastructure & Assets Location',
    treatment: 'clean_adapt',
    variants: {
      non_eu: {
        shown: true,
        text: 'Are all infrastructure and assets used to provide the service — including those of subcontractors directly involved in delivery — physically located within {country} or {trusted_jurisdiction}, with no routing of operations through data centres outside agreed jurisdictions?',
      },
      eu: {
        shown: true,
        text: 'Are all infrastructure and assets used to provide the service, including subcontractors directly involved in delivery, physically located within the Union, with no routing through non-EU infrastructure?',
      },
    },
  },

  'SOV-7-08': {
    title: 'Incident Disclosure & National CSIRT Cooperation',
    treatment: 'clean_adapt',
    variants: {
      non_eu: {
        shown: true,
        text: "Does the provider have a documented, operational incident-disclosure process with defined timelines, contractual readiness to support investigations by {country}'s authorities, and the capability to cooperate with {national_csirt}?",
      },
      eu: {
        shown: true,
        text: 'Does the provider have a documented incident-disclosure process aligned with GDPR/NIS2 timelines, with readiness to support EU-directed investigations and CSIRT cooperation?',
      },
    },
  },

  'SOV-1-09-CADA': {
    title: 'Foreign Affiliate Legal Separation',
    treatment: 'clean_adapt',
    variants: {
      non_eu: {
        shown: true,
        text: 'Where the provider has subsidiaries or affiliates in foreign jurisdictions, does it maintain documented and enforced legal, technical, and organisational separation ensuring that {country} operations, customer data, and service continuity cannot be directed, accessed, or disrupted by a foreign parent, sibling, or affiliate entity?',
      },
      eu: {
        shown: true,
        text: 'Where the provider has third-country subsidiaries or affiliates, does it maintain enforced legal, technical, and organisational separation ensuring EU operations, EU customer data, and EU service continuity cannot be directed, accessed, or disrupted by third-country entities?',
      },
    },
  },

  'SOV-1-08': {
    title: 'Customer Influence Over Provider Roadmap',
    treatment: 're_aim',
    variants: {
      non_eu: {
        shown: true,
        text: "Can {country}'s government or its public-sector customers exercise documented, meaningful influence over the provider's technology roadmap and service evolution — through governance bodies, customer councils, or binding contractual commitments — for matters affecting their workloads?",
      },
      eu: {
        shown: true,
        text: "Do EU stakeholders participate in formal governance bodies that provide meaningful, documented influence over the provider's technology roadmap and service evolution?",
      },
    },
  },

  'SOV-1-05': {
    title: 'Domestic Financing Anchoring',
    treatment: 'exclude_non_eu',
    variants: {
      non_eu: {
        shown: false,
        exclude_reason: 'EU-sourced financing is an EU-industrial-policy criterion with no sovereignty-meaningful analog for a non-EU buyer; local financing of a CSP does not by itself increase the buyer\'s sovereignty. Excluded from non-EU mode.',
        text: '',
      },
      eu: {
        shown: true,
        text: 'Does the provider rely predominantly on EU-sourced financing and demonstrate material EU investment, EU-based jobs, and EU value creation?',
      },
    },
  },

  'SOV-1-06': {
    title: 'Strategic Initiative Alignment',
    treatment: 'exclude_non_eu',
    variants: {
      non_eu: {
        shown: false,
        exclude_reason: 'Gaia-X and IPCEI participation are EU-specific industrial-policy programmes with no equivalent in non-EU jurisdictions. Alignment with these initiatives carries no sovereignty signal for a non-EU buyer. Excluded from non-EU mode.',
        text: '',
      },
      eu: {
        shown: true,
        text: 'Does the provider participate in or align with EU strategic cloud initiatives such as Gaia-X or IPCEI-CIS, demonstrating commitment to European digital sovereignty objectives?',
      },
    },
  },

  'SOV-2-04': {
    title: 'Intellectual Property Jurisdiction',
    treatment: 're_aim',
    variants: {
      non_eu: {
        shown: true,
        text: "Is the intellectual property underpinning the cloud service governed under a legal regime that does not allow a foreign jurisdiction to restrict, revoke, or compel transfer of {country}'s access to it — through licensing terms, export controls, or government orders on the IP holder?",
      },
      eu: {
        shown: true,
        text: 'Is the intellectual property underpinning the cloud service created, registered, and governed under EU jurisdiction, free from non-EU legal claims that could restrict or revoke EU access?',
      },
    },
  },

  'SOV-2-05-CADA': {
    title: 'Vulnerability Disclosure — Foreign Jurisdiction Prohibition',
    treatment: 'clean_adapt',
    variants: {
      non_eu: {
        shown: true,
        text: 'Does the provider contractually commit that it will not be required — by any foreign jurisdiction — to withhold, delay, or modify vulnerability disclosures to {country} customers, and that any such foreign legal requirement would be disclosed immediately?',
      },
      eu: {
        shown: true,
        text: 'Does the provider contractually commit that it will not be required by any third-country jurisdiction to withhold or modify vulnerability disclosures to EU customers, with immediate disclosure of any such demand?',
      },
    },
  },

  'SOV-4-01-C3': {
    title: 'Operating Organisation — In-Country Legal Establishment',
    treatment: 'clean_adapt',
    variants: {
      non_eu: {
        shown: true,
        text: 'Is the entity operating and supporting the cloud service for this customer established as a standalone organisation in {country} or {trusted_jurisdiction}, without operational dependence on a foreign parent entity for day-to-day service delivery?',
      },
      eu: {
        shown: true,
        text: 'Is the cloud service operated by a standalone organisation established within the Union, without operational dependence on non-EU entities for day-to-day service delivery?',
      },
    },
  },

  'SOV-4-15-CADA': {
    title: 'Migration Plan — Provider Failure or Foreign Jurisdiction Risk',
    treatment: 'clean_adapt',
    variants: {
      non_eu: {
        shown: true,
        text: 'Does the provider maintain and annually test a documented migration plan covering scenarios where the provider becomes insolvent, is acquired by a foreign entity, or is subject to a foreign jurisdiction action that would impair service delivery to {country} customers?',
      },
      eu: {
        shown: true,
        text: 'Does the provider maintain and annually test a documented migration plan covering scenarios of provider insolvency, foreign acquisition, or third-country government action that would impair service delivery to EU customers?',
      },
    },
  },

  'SOV-5-06-CADA': {
    title: 'Subcontractor Transparency & Due Diligence',
    treatment: 'clean_adapt',
    variants: {
      non_eu: {
        shown: true,
        text: 'Does the provider maintain a complete, current list of all subcontractors with access to customer data or the service delivery infrastructure, and conduct documented sovereignty due diligence — covering jurisdiction of incorporation, beneficial ownership, and foreign-law exposure — on each?',
      },
      eu: {
        shown: true,
        text: 'Does the provider maintain a complete, current subcontractor list with access to customer data or service infrastructure, and conduct documented sovereignty due diligence covering jurisdiction, beneficial ownership, and non-EU law exposure on each?',
      },
    },
  },

  'SOV-6-04': {
    title: 'Independence from Foreign HPC Supply Chain',
    treatment: 're_aim',
    variants: {
      non_eu: {
        shown: true,
        text: 'Does the provider demonstrate that its high-performance computing capacity — or its critical path dependency on HPC for the services delivered — is not concentrated in a single foreign supply chain that could unilaterally restrict access through export controls, sanctions, or commercial terms?',
      },
      eu: {
        shown: true,
        text: 'Does the provider demonstrate independence from non-EU high-performance computing supply chains, with EU-sovereign HPC capacity available as an alternative for workloads where HPC is critical?',
      },
    },
  },

  'SOV-7-07': {
    title: 'Independent Audit Capacity',
    treatment: 'clean_adapt',
    variants: {
      non_eu: {
        shown: true,
        text: "Does the provider enable and cooperate with audits by an auditor acceptable to {country}'s contracting authority — independent of the provider's foreign affiliates — covering all systems and data within scope of this contract?",
      },
      eu: {
        shown: true,
        text: 'Does the provider enable and cooperate with audits by a {{BLOC}}-based auditor, independent of the provider and its non-EU affiliates, covering all systems and data within scope?',
      },
    },
  },

  'SOV-5-08-LMIC': {
    title: 'Support Substitutability Ladder',
    treatment: 'clean_adapt',
    variants: {
      non_eu: {
        shown: true,
        text: 'What is the highest tier of support substitutability the provider can demonstrate for the cloud service — from same-stack operational takeover (Tier A), through rebuild from open standards with a documented and exercised runbook (Tier B), to re-platforming required (Tier C)?',
      },
      eu: {
        shown: true,
        text: 'What is the highest tier of support substitutability the provider can demonstrate, covering operational takeover, standards-based rebuild, and portability under foreign-jurisdiction exit scenarios?',
      },
    },
  },
};

let changed = 0;
for (const obj of criteria.objectives) {
  for (const q of obj.questions) {
    if (blocks[q.id]) {
      q.csi_presentation = blocks[q.id];
      changed++;
    }
  }
}

fs.writeFileSync(criteriaPath, JSON.stringify(criteria, null, 2) + '\n');
console.log(`Added csi_presentation to ${changed} questions (expected 16).`);
