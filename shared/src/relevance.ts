import type { ControlProfile, Question } from './schema.js';
import type { AnswerMap } from './types.js';
import {
  LayerOwnershipSchema,
  LayerOperationSchema,
  LayerDependencySchema,
  LayerLocationSchema,
} from './schema.js';

// ── Facet vocabulary (the data contract, §1) ──────────────────────────────────
// The ONLY values a show_when predicate may reference. Derived from the Zod enums
// so it can never drift from the schema. A predicate that references anything
// outside this is a defect (see lintPredicate / the relevance invariants test).
export const FACET_VOCAB: Record<string, readonly string[]> = {
  ownership: LayerOwnershipSchema.options,
  operation: LayerOperationSchema.options,
  dependency: LayerDependencySchema.options,
  location: LayerLocationSchema.options,
};

/**
 * Validates a predicate against the facet vocabulary. Returns a list of human-readable
 * problems; an empty array means the predicate is well-formed and on-vocabulary.
 * Catches: unparseable strings, unknown facets, and off-vocabulary values.
 */
export function lintPredicate(predicate: string): string[] {
  let tokens: Token[];
  try {
    tokens = tokenize(predicate);
  } catch (e) {
    return [`unparseable: ${(e as Error).message}`];
  }
  const errors: string[] = [];
  for (const tk of tokens) {
    if (tk.type !== 'ATOM') continue;
    const vocab = FACET_VOCAB[tk.facet];
    if (!vocab) {
      errors.push(`unknown facet "${tk.facet}" (allowed: ${Object.keys(FACET_VOCAB).join(', ')})`);
      continue;
    }
    if (!vocab.includes(tk.value)) {
      errors.push(`facet "${tk.facet}": value "${tk.value}" off-vocabulary (allowed: ${vocab.join(' | ')})`);
    }
  }
  return errors;
}

// Grammar: predicates are boolean expressions over ControlProfile fields.
// Atoms: "L3.dependency == 'value'" or "L3.dependency != 'value'"
// Connectives: AND, OR, NOT (uppercase), parentheses.
// No arithmetic, no lookups beyond the profile.

type Token =
  | { type: 'ATOM'; layer: string; facet: string; op: '==' | '!='; value: string }
  | { type: 'AND' }
  | { type: 'OR' }
  | { type: 'NOT' }
  | { type: 'LPAREN' }
  | { type: 'RPAREN' };

function tokenize(predicate: string): Token[] {
  const tokens: Token[] = [];
  const src = predicate.trim();
  let i = 0;

  while (i < src.length) {
    if (/\s/.test(src[i])) { i++; continue; }

    if (src[i] === '(') { tokens.push({ type: 'LPAREN' }); i++; continue; }
    if (src[i] === ')') { tokens.push({ type: 'RPAREN' }); i++; continue; }

    if (src.startsWith('AND', i) && (i + 3 >= src.length || /\W/.test(src[i + 3]))) {
      tokens.push({ type: 'AND' }); i += 3; continue;
    }
    if (src.startsWith('OR', i) && (i + 2 >= src.length || /\W/.test(src[i + 2]))) {
      tokens.push({ type: 'OR' }); i += 2; continue;
    }
    if (src.startsWith('NOT', i) && (i + 3 >= src.length || /\W/.test(src[i + 3]))) {
      tokens.push({ type: 'NOT' }); i += 3; continue;
    }

    // Atom: "L3.dependency == 'value'" or "L3.dependency != 'value'"
    const atomMatch = src.slice(i).match(/^(L[1-6])\.(\w+)\s*(==|!=)\s*'([^']*)'/);
    if (atomMatch) {
      tokens.push({
        type: 'ATOM',
        layer: atomMatch[1],
        facet: atomMatch[2],
        op: atomMatch[3] as '==' | '!=',
        value: atomMatch[4],
      });
      i += atomMatch[0].length;
      continue;
    }

    throw new Error(`Unrecognised token at position ${i}: "${src.slice(i, i + 20)}"`);
  }
  return tokens;
}

// Recursive-descent parser: expr → or
// or   → and ('OR' and)*
// and  → not ('AND' not)*
// not  → 'NOT' not | primary
// primary → '(' expr ')' | ATOM

class Parser {
  private pos = 0;
  constructor(private tokens: Token[]) {}

  private peek(): Token | undefined { return this.tokens[this.pos]; }
  private consume(): Token { return this.tokens[this.pos++]; }

  parseExpr(): (profile: ControlProfile) => boolean {
    return this.parseOr();
  }

  private parseOr(): (profile: ControlProfile) => boolean {
    let left = this.parseAnd();
    while (this.peek()?.type === 'OR') {
      this.consume();
      const right = this.parseAnd();
      const l = left;
      const r = right;
      left = (p) => l(p) || r(p);
    }
    return left;
  }

  private parseAnd(): (profile: ControlProfile) => boolean {
    let left = this.parseNot();
    while (this.peek()?.type === 'AND') {
      this.consume();
      const right = this.parseNot();
      const l = left;
      const r = right;
      left = (p) => l(p) && r(p);
    }
    return left;
  }

  private parseNot(): (profile: ControlProfile) => boolean {
    if (this.peek()?.type === 'NOT') {
      this.consume();
      const inner = this.parseNot();
      return (p) => !inner(p);
    }
    return this.parsePrimary();
  }

  private parsePrimary(): (profile: ControlProfile) => boolean {
    const token = this.peek();
    if (!token) throw new Error('Unexpected end of predicate');

    if (token.type === 'LPAREN') {
      this.consume();
      const expr = this.parseOr();
      if (this.peek()?.type !== 'RPAREN') throw new Error('Missing closing parenthesis');
      this.consume();
      return expr;
    }

    if (token.type === 'ATOM') {
      this.consume();
      const { layer, facet, op, value } = token;
      return (profile: ControlProfile) => {
        const layerObj = profile[layer as keyof ControlProfile] as Record<string, string>;
        const actual = layerObj?.[facet];
        return op === '==' ? actual === value : actual !== value;
      };
    }

    throw new Error(`Expected atom or '(' but got token type "${token.type}"`);
  }
}

function parseToFn(predicate: string): (profile: ControlProfile) => boolean {
  const tokens = tokenize(predicate);
  const parser = new Parser(tokens);
  return parser.parseExpr();
}

export function evaluate(predicate: string, profile: ControlProfile): boolean {
  return parseToFn(predicate)(profile);
}

// ── Applicability (single source of truth for "does this question apply?") ─────
// Shared by the questionnaire UI (which questions to show) and the scorers (which
// questions enter the gate / denominator). It does NOT decide framework membership
// or AC selection — callers filter those first. It answers only the three
// profile/answer-driven concerns:
//   1. relevance.show_when  — the control-profile predicate
//   2. applicability_condition — a dependency on another question's answer
//   3. parent_criterion_id  — fallback questions apply only when the parent is 'no'
// A question whose dependency cannot be satisfied for the profile is NOT applicable,
// so a scorer must never count it as a failure (the bug that pinned CADA at UAL 0).

/** Read an answer regardless of how it was keyed (bare id, or a tiered `:national`/`:bloc`). */
function answerValue(answers: AnswerMap, id: string): string | undefined {
  return (
    answers[id]?.value ??
    answers[`${id}:national`]?.value ??
    answers[`${id}:bloc`]?.value
  );
}

export function isQuestionApplicable(
  q: Question,
  profile: ControlProfile | null | undefined,
  answers: AnswerMap,
): boolean {
  const showWhen: string | undefined = (q as any).relevance?.show_when;
  if (showWhen && profile) {
    if (!evaluate(showWhen, profile)) return false;
  }

  const ac: { depends_on?: string; value?: string; when_unmet?: string } | undefined =
    (q as any).applicability_condition;
  if (ac?.depends_on && ac.when_unmet === 'exclude') {
    const dep = answerValue(answers, ac.depends_on);
    // Include only when the dependency answer matches; exclude when unmet.
    if (dep !== ac.value) return false;
  }

  if (q.parent_criterion_id) {
    return answerValue(answers, q.parent_criterion_id) === 'no';
  }

  return true;
}

// ── Excel formula compiler ────────────────────────────────────────────────────
// sheetRefs maps "L3.dependency" → Excel named range or cell reference, e.g. "L3_dependency"
// Atom "L3.dependency == 'x'" → (L3_dependency="x")
// AND(a, b) → AND(a,b)  OR(a, b) → OR(a,b)  NOT(a) → NOT(a)

class ExcelCompiler {
  private pos = 0;
  constructor(private tokens: Token[], private sheetRefs: Record<string, string>) {}

  private peek(): Token | undefined { return this.tokens[this.pos]; }
  private consume(): Token { return this.tokens[this.pos++]; }

  compileExpr(): string {
    return this.compileOr();
  }

  private compileOr(): string {
    const parts: string[] = [this.compileAnd()];
    while (this.peek()?.type === 'OR') {
      this.consume();
      parts.push(this.compileAnd());
    }
    return parts.length === 1 ? parts[0] : `OR(${parts.join(',')})`;
  }

  private compileAnd(): string {
    const parts: string[] = [this.compileNot()];
    while (this.peek()?.type === 'AND') {
      this.consume();
      parts.push(this.compileNot());
    }
    return parts.length === 1 ? parts[0] : `AND(${parts.join(',')})`;
  }

  private compileNot(): string {
    if (this.peek()?.type === 'NOT') {
      this.consume();
      return `NOT(${this.compileNot()})`;
    }
    return this.compilePrimary();
  }

  private compilePrimary(): string {
    const token = this.peek();
    if (!token) throw new Error('Unexpected end of predicate');

    if (token.type === 'LPAREN') {
      this.consume();
      const inner = this.compileOr();
      if (this.peek()?.type !== 'RPAREN') throw new Error('Missing closing parenthesis');
      this.consume();
      return inner;
    }

    if (token.type === 'ATOM') {
      this.consume();
      const { layer, facet, op, value } = token;
      const ref = this.sheetRefs[`${layer}.${facet}`] ?? `${layer}_${facet}`;
      return op === '==' ? `(${ref}="${value}")` : `(${ref}<>"${value}")`;
    }

    throw new Error(`Expected atom or '(' but got token type "${token.type}"`);
  }
}

export function toExcelFormula(predicate: string, sheetRefs: Record<string, string>): string {
  const tokens = tokenize(predicate);
  const compiler = new ExcelCompiler(tokens, sheetRefs);
  return compiler.compileExpr();
}

// Returns the default named-range map for the Scope sheet.
// Layer.facet → Excel named range (e.g. "L3_dependency").
// The XLSX generator defines these named ranges on the Scope sheet.
export function buildSheetRefs(): Record<string, string> {
  const layers = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6'] as const;
  const facets = ['ownership', 'operation', 'dependency', 'location'] as const;
  const refs: Record<string, string> = {};
  for (const layer of layers) {
    for (const facet of facets) {
      refs[`${layer}.${facet}`] = `${layer}_${facet}`;
    }
  }
  return refs;
}
