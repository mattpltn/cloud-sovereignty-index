import { z } from 'zod';

// ── Source reference ──────────────────────────────────────────────────────────

export const SourceRefSchema = z.object({
  doc: z.string(),
  clause: z.string(),
});

// ── Criteria ──────────────────────────────────────────────────────────────────

const TierSchema = z.object({
  text: z.string(),
  text_c3a: z.string().optional(),
  text_generalized: z.string().optional(),
  seal_contribution: z.number().int().min(0).max(4),
  points: z.number().positive(),
  source: SourceRefSchema,
  decision_refs: z.array(z.string()).optional(),
});

const C3aTierSchema = z.enum(['base', 'additional', 'not_applicable']);

const LmicAnchorSchema = z.object({
  framework: z.string(),
  ref: z.string(),
  note: z.string().optional(),
});

const QuestionBaseSchema = z.object({
  id: z.string().regex(/^SOV-\d+(-[A-Z\d]+)+$/),
  title: z.string(),
  title_generalized: z.string().optional(),
  supplementary_info: z.string().optional(),
  applies_to_eu_csf: z.boolean(),
  applies_to_c3a: z.boolean(),
  applies_to_csi_composite: z.boolean(),
  c3a_tier: C3aTierSchema,
  parent_criterion_id: z.string().optional(),
  review_status: z.string().optional(),
  c3a_source_id: z.string().optional(),
  eu_csf_source_factor: z.string().optional(),
  seal_contribution_eu_csf: z.number().int().min(0).max(4).optional(),
  seal_contribution_csi: z.number().int().min(0).max(4).optional(),
  eu_csf_fidelity: z.enum(['direct', 'inferred', 'csi']).optional(),
  eu_csf_fidelity_rationale: z.string().optional(),
  c3a_fidelity: z.enum(['direct', 'inferred', 'csi']).optional(),
  c3a_fidelity_rationale: z.string().optional(),
  applies_to_cada: z.boolean().optional(),
  cada_assurance_level: z.array(z.number().int().min(1).max(4)).optional(),
  cada_annex_ref: z.string().optional(),
  cada_fidelity: z.enum(['direct', 'inferred', 'csi']).optional(),
  cada_fidelity_rationale: z.string().optional(),
  cada_applicability_note: z.string().optional(),
  applicability_condition: z.object({
    depends_on: z.string(),
    value: z.enum(['yes', 'no']),
    when_unmet: z.literal('exclude'),
  }).optional(),
  // LMIC mode fields
  applies_to_lmic: z.boolean().optional(),
  lmic_pillar: z.enum(['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8']).optional(),
  lmic_sourcing: z.enum(['reuse', 'port', 'adapt', 'grounded-new', 'editorial']).optional(),
  lmic_anchors: z.array(LmicAnchorSchema).optional(),
  lmic_rationale: z.string().optional(),
  lmic_axis: z.enum(['autonomy', 'assurance', 'both', 'none']).optional(),
  evidence_status_required: z.enum(['demonstrated', 'documented', 'any']).optional(),
  // Relevance layer (CSI/LMIC mode only — controls show/hide per control profile)
  relevance: z.object({
    layer: z.enum(['L1', 'L2', 'L3', 'L4', 'L5', 'L6']).optional(),
    pattern: z.enum(['vanish', 're-aim', 'sharpen', 'agnostic']),
    show_when: z.string().optional(),
    // Archetype tags (Cookbook §4). show_when is GENERATED from these via
    // scripts/gen-relevance.ts — do not hand-edit show_when on tagged questions.
    archetypes: z.array(z.object({
      archetype: z.enum([
        'JURISDICTION', 'PHYSICAL_CUSTODY', 'DATA_RESIDENCY_SERVICE',
        'THIRD_PARTY_OPERATION', 'REVERSIBILITY', 'SUPPORT_CONTINUITY', 'SELF_SUFFICIENCY',
      ]),
      layer: z.enum(['L1', 'L2', 'L3', 'L4', 'L5', 'L6']),
    })).optional(),
  }).optional(),
  // Presentation layer (CSI/LMIC mode only — EU-CSF/C3A/CADA modes ignore this field)
  csi_presentation: z.object({
    title: z.string(),
    variants: z.object({
      non_eu: z.object({
        text: z.string(),
        shown: z.boolean(),
        exclude_reason: z.string().optional(),
      }),
      eu: z.object({
        text: z.string(),
        shown: z.boolean(),
      }),
    }),
    treatment: z.enum(['clean_adapt', 're_aim', 'exclude_non_eu', 'correctly_eu']),
  }).optional(),
});

const SingleQuestionSchema = QuestionBaseSchema.extend({
  type: z.literal('single'),
  text: z.string(),
  text_c3a: z.string().optional(),
  text_generalized: z.string().optional(),
  seal_contribution: z.number().int().min(0).max(4),
  points: z.number().positive(),
  source: SourceRefSchema,
  decision_refs: z.array(z.string()).optional(),
});

const TieredQuestionSchema = QuestionBaseSchema.extend({
  type: z.literal('tiered'),
  tiers: z.object({
    bloc: TierSchema,
    national: TierSchema.optional(),
  }),
});

const LadderRungSchema = z.object({
  tier: z.string(),
  label: z.string(),
  points: z.number(),
  gate_requires: z.array(z.string()).optional(),
});

const TieredLadderQuestionSchema = QuestionBaseSchema.extend({
  type: z.literal('tiered_ladder'),
  text: z.string(),
  ladder: z.array(LadderRungSchema).min(2),
  seal_contribution: z.number().int().min(0).max(4).optional(),
  source: SourceRefSchema.optional(),
  tiers_note: z.string().optional(),
});

export const QuestionSchema = z.discriminatedUnion('type', [
  SingleQuestionSchema,
  TieredQuestionSchema,
  TieredLadderQuestionSchema,
]);

export const ObjectiveSchema = z.object({
  id: z.string().regex(/^SOV-\d+$/),
  title: z.string(),
  description: z.string(),
  weight: z.number().nonnegative().max(1),
  layer: z.enum(['sovereignty', 'resilience', 'operational_viability', 'lmic_only']).optional(),
  questions: z.array(QuestionSchema).min(1),
});

export const SourceDocSchema = z.object({
  id: z.string(),
  version: z.string(),
  date: z.string(),
  publisher: z.string(),
  title: z.string(),
});

export const SealLevelInCriteriaSchema = z.object({
  level: z.number().int().min(0).max(4),
  name: z.string(),
  description: z.string(),
  description_generalized: z.string().optional(),
});

export const CriteriaFileSchema = z.object({
  instrument_version: z.string(),
  source_documents: z.array(SourceDocSchema),
  weights: z.record(z.string(), z.number()),
  seal_levels: z.array(SealLevelInCriteriaSchema),
  objectives: z.array(ObjectiveSchema),
}).superRefine((data, ctx) => {
  for (const obj of data.objectives) {
    for (const q of obj.questions) {
      if (q.applies_to_lmic) {
        if (!q.lmic_pillar) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${q.id}: applies_to_lmic requires lmic_pillar` });
        }
        if (!q.lmic_rationale) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${q.id}: applies_to_lmic requires lmic_rationale` });
        }
      }
      if (q.lmic_sourcing === 'grounded-new' && (!q.lmic_anchors || q.lmic_anchors.length === 0)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${q.id}: lmic_sourcing grounded-new requires lmic_anchors` });
      }
      if (q.csi_presentation) {
        const { treatment, variants } = q.csi_presentation;
        if (treatment === 'exclude_non_eu') {
          if (variants.non_eu.shown !== false) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${q.id}: exclude_non_eu requires non_eu.shown === false` });
          }
          if (!variants.non_eu.exclude_reason) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${q.id}: exclude_non_eu requires non_eu.exclude_reason` });
          }
        }
        if (treatment === 'clean_adapt' || treatment === 're_aim') {
          if (variants.non_eu.shown !== true) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${q.id}: ${treatment} requires non_eu.shown === true` });
          }
        }
      }
    }
  }
});

// ── Decisions Register ────────────────────────────────────────────────────────

export const DecisionEntrySchema = z.object({
  id: z.string().regex(/^DR-[A-Z]\d+$/),
  category: z.enum(['substitution', 'adaptation', 'derivation', 'exclusion', 'extension', 'evidence']),
  rationale: z.string(),
  authority: z.string(),
  alternatives_considered: z.union([z.string(), z.array(z.string())]),
  review_status: z.enum(['stable', 'under-review', 'deprecated', 'endorsed-by-source', 'pending-external-review', 'superseded']),
}).passthrough();

export const DecisionsRegisterFileSchema = z.object({
  instrument_version: z.string(),
  register_version: z.string(),
  last_updated: z.string(),
  entries: z.array(DecisionEntrySchema),
});

export const DecisionsRegisterSchema = z.array(DecisionEntrySchema);

// ── Countries ─────────────────────────────────────────────────────────────────

export const CountrySchema = z.object({
  code: z.string().length(2),
  name: z.string(),
  adj: z.string(),
  national_admin_label: z.string(),
  emergency_regime: z.string(),
  national_extensions: z.array(z.string()).optional(),
  is_source_verbatim: z.boolean().optional(),
});

export const CountriesFileSchema = z.object({
  EU: z.array(CountrySchema),
  EEA_non_EU: z.array(CountrySchema),
  non_EU: z.array(CountrySchema),
});

// ── API payloads ──────────────────────────────────────────────────────────────

export const VariantSchema = z.enum(['EU-CSF', 'Generalized']);

export const ScopeSchema = z.enum(['IaaS', 'PaaS', 'SaaS', 'FaaS', 'CaaS', 'STaaS']);

export const RoleSchema = z.enum(['customer', 'provider', 'auditor']);

export const FrameworkModeSchema = z.enum(['eu_csf', 'c3a', 'csi_composite', 'cada', 'lmic']);

export const AssessmentSetupSchema = z.object({
  variant: VariantSchema,
  country_code: z.string().length(2).optional(),
  scope_ids: z.array(ScopeSchema).min(1),
  role: RoleSchema,
  turnstile_token: z.string(),
  selected_frameworks: z.array(FrameworkModeSchema).min(1).optional(),
  customer_selected_ac_ids: z.array(z.string()).optional(),
});

export const AnswerValueSchema = z.enum(['yes', 'no', 'partial', 'planned', 'n/a']);

export const AnswerSchema = z.object({
  question_id: z.string(),
  tier: z.enum(['bloc', 'national', 'single', 'ladder']),
  value: AnswerValueSchema,
  evidence_url: z.string().url().optional(),
  note: z.string().max(500).optional(),
  evidence_status: z.enum(['demonstrated', 'documented', 'vendor_claim', 'unverified']).optional(),
  tier_claimed: z.string().optional(),
});

export const AnswerPatchSchema = z.object({
  answers: z.array(AnswerSchema).min(1),
});

export const SubmitBodySchema = z.object({
  corpus_opt_in: z.boolean(),
});

// ── Control-profile model (posture-first layered assessment) ─────────────────

export const LayerOwnershipSchema = z.enum(['client', 'commercial_lessor', 'provider', 'mixed', 'na']);
export const LayerOperationSchema = z.enum(['client_staff', 'local_si', 'foreign_vendor', 'provider', 'na']);
export const LayerDependencySchema = z.enum(['self_supported_oss', 'licensed_supported', 'licensed_no_support', 'proprietary_inaccessible', 'na']);
export const LayerLocationSchema = z.enum(['in_country', 'regional_treaty', 'trusted_third', 'foreign', 'unknown']);

export const LayerControlSchema = z.object({
  ownership:  LayerOwnershipSchema,
  operation:  LayerOperationSchema,
  dependency: LayerDependencySchema,
  location:   LayerLocationSchema,
});

export const ControlProfileSchema = z.object({
  L1: LayerControlSchema,
  L2: LayerControlSchema,
  L3: LayerControlSchema,
  L4: LayerControlSchema,
  L5: LayerControlSchema,
  L6: LayerControlSchema,
});

export type LayerControl = z.infer<typeof LayerControlSchema>;
export type ControlProfile = z.infer<typeof ControlProfileSchema>;

// ── Types derived from schemas ────────────────────────────────────────────────

export type SourceRef = z.infer<typeof SourceRefSchema>;
export type Question = z.infer<typeof QuestionSchema>;
export type Objective = z.infer<typeof ObjectiveSchema>;
export type CriteriaFile = z.infer<typeof CriteriaFileSchema>;
export type DecisionEntry = z.infer<typeof DecisionEntrySchema>;
export type Country = z.infer<typeof CountrySchema>;
export type CountriesFile = z.infer<typeof CountriesFileSchema>;
export type Variant = z.infer<typeof VariantSchema>;
export type Scope = z.infer<typeof ScopeSchema>;
export type Role = z.infer<typeof RoleSchema>;
export type AssessmentSetup = z.infer<typeof AssessmentSetupSchema>;
export type AnswerValue = z.infer<typeof AnswerValueSchema>;
export type Answer = z.infer<typeof AnswerSchema>;
export type AnswerPatch = z.infer<typeof AnswerPatchSchema>;
export type SubmitBody = z.infer<typeof SubmitBodySchema>;
export type FrameworkMode = z.infer<typeof FrameworkModeSchema>;
export type C3aTier = z.infer<typeof C3aTierSchema>;
export type LmicAnchor = z.infer<typeof LmicAnchorSchema>;
export type LadderRung = z.infer<typeof LadderRungSchema>;
