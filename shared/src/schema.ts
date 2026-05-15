import { z } from 'zod';

// ── Source reference ──────────────────────────────────────────────────────────

export const SourceRefSchema = z.object({
  doc: z.string(),
  clause: z.string(),
});

// ── Criteria ──────────────────────────────────────────────────────────────────

const TierSchema = z.object({
  text: z.string(),
  seal_contribution: z.number().int().min(0).max(4),
  points: z.number().positive(),
  source: SourceRefSchema,
  decision_refs: z.array(z.string()).optional(),
});

const C3aTierSchema = z.enum(['base', 'additional', 'not_applicable']);

const QuestionBaseSchema = z.object({
  id: z.string().regex(/^SOV-\d+-\d+(-[A-Z]+\d*)?$/),
  title: z.string(),
  title_generalized: z.string().optional(),
  supplementary_info: z.string().optional(),
  applies_to_eu_csf: z.boolean(),
  applies_to_c3a: z.boolean(),
  applies_to_csi_composite: z.boolean(),
  c3a_tier: C3aTierSchema,
  parent_criterion_id: z.string().optional(),
  review_status: z.string().optional(),
});

const SingleQuestionSchema = QuestionBaseSchema.extend({
  type: z.literal('single'),
  text: z.string(),
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

export const QuestionSchema = z.discriminatedUnion('type', [
  SingleQuestionSchema,
  TieredQuestionSchema,
]);

export const ObjectiveSchema = z.object({
  id: z.string().regex(/^SOV-\d+$/),
  title: z.string(),
  description: z.string(),
  weight: z.number().positive().max(1),
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

export const FrameworkModeSchema = z.enum(['eu_csf', 'c3a', 'csi_composite']);

export const AssessmentSetupSchema = z.object({
  variant: VariantSchema,
  country_code: z.string().length(2).optional(),
  scope_ids: z.array(ScopeSchema).min(1),
  role: RoleSchema,
  turnstile_token: z.string(),
  selected_frameworks: z.array(FrameworkModeSchema).min(1).optional(),
  customer_selected_ac_ids: z.array(z.string()).optional(),
});

export const AnswerValueSchema = z.enum(['yes', 'no', 'partial', 'n/a']);

export const AnswerSchema = z.object({
  question_id: z.string(),
  tier: z.enum(['bloc', 'national', 'single']),
  value: AnswerValueSchema,
  evidence_url: z.string().url().optional(),
  note: z.string().max(500).optional(),
});

export const AnswerPatchSchema = z.object({
  answers: z.array(AnswerSchema).min(1),
});

export const SubmitBodySchema = z.object({
  corpus_opt_in: z.boolean(),
});

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
