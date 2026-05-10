import type { Variant, Scope, Role, AnswerValue, Country } from './schema.js';

export type { Variant, Scope, Role, AnswerValue, Country };

export interface ObjectiveResult {
  objective_id: string;
  title: string;
  weight: number;
  raw_score: number;
  max_score: number;
  seal_level: number;
  gap: number;
  questions: QuestionResult[];
}

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

export interface AssessmentResult {
  assessment_id: string;
  variant: Variant;
  country_code?: string;
  scope_ids: Scope[];
  role: Role;
  overall_score: number;
  seal_level: number;
  objectives: ObjectiveResult[];
  gap_report: GapItem[];
  instrument_version: string;
  assessed_at: string;
}

export interface GapItem {
  objective_id: string;
  question_id: string;
  tier: 'bloc' | 'national' | 'single';
  gap_score: number;
  priority: number;
}

export interface AssessmentRecord {
  id: string;
  variant: Variant;
  country_code?: string;
  scope_ids: Scope[];
  role: Role;
  answers: AnswerMap;
  result?: AssessmentResult;
  corpus_opt_in: boolean;
  created_at: string;
  updated_at: string;
  submitted_at?: string;
  expires_at: string;
}

export type AnswerMap = Record<string, { tier: string; value: AnswerValue; evidence_url?: string; note?: string }>;
