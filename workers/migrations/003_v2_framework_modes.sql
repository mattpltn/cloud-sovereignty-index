-- v2.0: add per-assessment framework selection and C3A AC customer selection
ALTER TABLE assessments ADD COLUMN selected_frameworks TEXT DEFAULT '["csi_composite"]';
ALTER TABLE assessments ADD COLUMN customer_selected_ac_ids TEXT DEFAULT '[]';
