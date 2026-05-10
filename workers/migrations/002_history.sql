CREATE TABLE IF NOT EXISTS assessment_history (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  assessment_id    TEXT NOT NULL,
  submitted_at     TEXT NOT NULL,
  seal_level       INTEGER NOT NULL,
  overall_score    REAL NOT NULL,
  answers_snapshot TEXT NOT NULL,
  computed_score   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_history_assessment ON assessment_history(assessment_id, submitted_at DESC);
