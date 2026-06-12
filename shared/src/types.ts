import type { Variant, Scope, Role, AnswerValue, Country, FrameworkMode, ControlProfile } from './schema.js';

export type { Variant, Scope, Role, AnswerValue, Country, FrameworkMode, ControlProfile };

// ── Per-question result (shared across modes) ─────────────────────────────────

export interface QuestionResult {
  question_id: string;
  tier: 'bloc' | 'national' | 'single';
  value: AnswerValue;
  points_earned: number;
  points_possible: number;
  seal_contribution: number;
  counts_toward_seal: boolean;
  flagged_unsupported: boolean;
}

// ── EU-CSF mode results ───────────────────────────────────────────────────────

export interface EuCsfObjectiveResult {
  objective_id: string;
  title: string;
  weight: number;
  seal: number;
  raw_score: number;
  max_score: number;
  pct: number;
  questions: QuestionResult[];
}

export interface EuCsfResult {
  per_objective: Record<string, EuCsfObjectiveResult>;
  global: { seal: number; pct: number };
  gap_report: GapItem[];
}

// ── C3A mode results ──────────────────────────────────────────────────────────

export type C3aAttainmentBand =
  | 'not_attained'
  | 'partially_attained'
  | 'substantially_attained'
  | 'fully_attained';

export interface C3aQuestionResult {
  question_id: string;
  tier: 'single' | 'bloc' | 'national';
  value: AnswerValue;
  passed: boolean;
  is_layer_a: boolean;
  is_additional_criterion: boolean;
}

export interface C3aObjectiveTierResult {
  passed: number;
  applicable: number;
  pct: number;
  attainment: C3aAttainmentBand;
  questions: C3aQuestionResult[];
}

export interface C3aObjectiveResult {
  objective_id: string;
  title: string;
  criterion: C3aObjectiveTierResult;
  additional_criterion: C3aObjectiveTierResult | null;
}

export interface C3aResult {
  criterion: {
    per_objective: Record<string, C3aObjectiveTierResult>;
    global: { passed: number; applicable: number; pct: number; attainment: C3aAttainmentBand };
  };
  additional_criterion: {
    per_objective: Record<string, C3aObjectiveTierResult | null>;
    global: { passed: number; applicable: number; pct: number; attainment: C3aAttainmentBand } | null;
  };
  failed_criteria: Array<{
    question_id: string;
    title: string;
    objective_id: string;
    tier: 'criterion' | 'additional_criterion';
  }>;
  layer_a_blocked: boolean;
}

// ── CSI Composite mode results ────────────────────────────────────────────────

export type CsiMaturityTier =
  | 'dependent'
  | 'managed_dependency'
  | 'strategic_autonomy'
  | 'sovereign';

export interface CsiObjectiveResult {
  objective_id: string;
  title: string;
  weight: number;
  csl: number;
  raw_score: number;
  max_score: number;
  pct: number;
  questions: QuestionResult[];
}

export interface CsiCompositeResult {
  per_objective: Record<string, CsiObjectiveResult>;
  global: { csl: number; pct: number; pct_to_next_tier: number | null; maturity_tier?: CsiMaturityTier };
  gap_report: GapItem[];
}

// ── CADA mode results ─────────────────────────────────────────────────────────

export interface CadaLevelResult {
  level: number;
  label: string;
  gate_passed: boolean;
  criteria_passed: number;
  criteria_total: number;
  failing_criteria: Array<{ question_id: string; title: string; objective_id: string }>;
}

export interface CadaGapItem {
  question_id: string;
  title: string;
  objective_id: string;
  blocks_level: number;
  priority: number;
}

export interface CadaResult {
  highest_level_achieved: number;
  levels: CadaLevelResult[];
  gap_report: CadaGapItem[];
  audit_required: boolean;
}

// ── LMIC mode results ─────────────────────────────────────────────────────────

export interface LmicAxes {
  autonomyPct: number;
  assurancePct: number;
}

export interface LmicPillarResult {
  pillar_id: string;
  raw_autonomy: number;
  max_autonomy: number;
  raw_assurance: number;
  max_assurance: number;
  rungs_locked: boolean;
}

export interface LmicResult {
  axes: LmicAxes;
  per_pillar: Record<string, LmicPillarResult>;
  ladder_tier?: 'A' | 'B' | 'C';
  ladder_tier_capped: boolean;
}

// ── v2.0 AssessmentResult ─────────────────────────────────────────────────────

export interface AssessmentResult {
  assessment_id: string;
  instrument_version: string;
  selected_frameworks: FrameworkMode[];
  variant: Variant;
  country_code?: string;
  scope_ids: Scope[];
  role: Role;
  assessed_at: string;
  eu_csf?: EuCsfResult;
  c3a?: C3aResult;
  csi_composite?: CsiCompositeResult;
  cada?: CadaResult;
  lmic?: LmicResult;
  control_profile?: ControlProfile;
}

// ── v1.x legacy result (stored in D1 for old assessments) ────────────────────

export interface LegacyAssessmentResult {
  assessment_id: string;
  instrument_version: string;
  variant: Variant;
  country_code?: string;
  scope_ids: Scope[];
  role: Role;
  overall_score: number;
  seal_level: number;
  objectives: LegacyObjectiveResult[];
  gap_report: GapItem[];
  assessed_at: string;
}

export interface LegacyObjectiveResult {
  objective_id: string;
  title: string;
  weight: number;
  raw_score: number;
  max_score: number;
  seal_level: number;
  gap: number;
  questions: QuestionResult[];
}

// ── Shared ────────────────────────────────────────────────────────────────────

export interface GapItem {
  objective_id: string;
  question_id: string;
  tier: 'bloc' | 'national' | 'single';
  gap_score: number;
  priority: number;
  seal_contribution: number;
}

export interface AssessmentRecord {
  id: string;
  variant: Variant;
  country_code?: string;
  scope_ids: Scope[];
  role: Role;
  selected_frameworks: FrameworkMode[];
  customer_selected_ac_ids: string[];
  answers: AnswerMap;
  result?: AssessmentResult | LegacyAssessmentResult;
  corpus_opt_in: boolean;
  created_at: string;
  updated_at: string;
  submitted_at?: string;
  expires_at: string;
}

export type EvidenceLevel = 'self_declared' | 'documented' | 'audited' | 'operationally_tested';

export type EvidenceStatus = 'demonstrated' | 'documented' | 'vendor_claim' | 'unverified';

export type AnswerMap = Record<string, {
  tier: string;
  value: AnswerValue;
  evidence_url?: string;
  note?: string;
  evidence_level?: EvidenceLevel;
  evidence_status?: EvidenceStatus;
  tier_claimed?: string;
}>;
