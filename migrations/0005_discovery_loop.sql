-- Discovery Loop: study generation → findings → vetting → routing → delivery → feedback.
-- Mirrors shared/schema.ts; `npm run db:push` produces the same result.

CREATE TABLE IF NOT EXISTS study_designs (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  prompt TEXT NOT NULL,
  title TEXT NOT NULL,
  paradigm TEXT NOT NULL,
  constructs TEXT[],
  design JSONB NOT NULL,
  generator TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  preregistration_hash TEXT,
  preregistered_at TIMESTAMP,
  anchor JSONB,
  experiment_id VARCHAR REFERENCES consciousness_experiments(id) ON DELETE SET NULL,
  parent_design_id VARCHAR,
  source_finding_ids TEXT[],
  generation INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS study_designs_status_idx ON study_designs(status);
CREATE INDEX IF NOT EXISTS study_designs_parent_idx ON study_designs(parent_design_id);
CREATE INDEX IF NOT EXISTS study_designs_owner_idx ON study_designs(owner_id);

CREATE TABLE IF NOT EXISTS findings (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  claim TEXT NOT NULL,
  summary TEXT,
  evidence JSONB NOT NULL,
  category TEXT NOT NULL,
  tags TEXT[],
  confidence INTEGER NOT NULL,
  novelty INTEGER,
  simulated BOOLEAN NOT NULL DEFAULT false,
  content_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'candidate',
  source TEXT NOT NULL,
  vetting_summary JSONB,
  paper_id VARCHAR REFERENCES papers(id) ON DELETE SET NULL,
  experiment_id VARCHAR REFERENCES consciousness_experiments(id) ON DELETE SET NULL,
  study_design_id VARCHAR REFERENCES study_designs(id) ON DELETE SET NULL,
  created_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS findings_status_idx ON findings(status);
CREATE INDEX IF NOT EXISTS findings_category_idx ON findings(category);
CREATE INDEX IF NOT EXISTS findings_content_hash_idx ON findings(content_hash);
CREATE INDEX IF NOT EXISTS findings_study_design_idx ON findings(study_design_id);

CREATE TABLE IF NOT EXISTS vetting_reviews (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id VARCHAR NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
  reviewer_type TEXT NOT NULL,
  reviewer_id VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  "check" TEXT NOT NULL,
  verdict TEXT NOT NULL,
  score INTEGER,
  notes TEXT,
  details JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vetting_reviews_finding_idx ON vetting_reviews(finding_id);

CREATE TABLE IF NOT EXISTS distribution_channels (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  config JSONB NOT NULL,
  filters JSONB,
  accepts_simulated BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  last_delivery_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS distribution_channels_owner_idx ON distribution_channels(owner_id);
CREATE INDEX IF NOT EXISTS distribution_channels_kind_idx ON distribution_channels(kind);

CREATE TABLE IF NOT EXISTS deliveries (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id VARCHAR NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
  channel_id VARCHAR NOT NULL REFERENCES distribution_channels(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMP,
  last_error TEXT,
  receipt JSONB,
  idempotency_key TEXT NOT NULL UNIQUE,
  queued_at TIMESTAMP NOT NULL DEFAULT now(),
  sent_at TIMESTAMP,
  acked_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS deliveries_status_idx ON deliveries(status);
CREATE INDEX IF NOT EXISTS deliveries_finding_idx ON deliveries(finding_id);
CREATE INDEX IF NOT EXISTS deliveries_channel_idx ON deliveries(channel_id);

CREATE TABLE IF NOT EXISTS feedback_events (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id VARCHAR NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
  delivery_id VARCHAR REFERENCES deliveries(id) ON DELETE SET NULL,
  channel_id VARCHAR REFERENCES distribution_channels(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  payload JSONB,
  actor_id VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  external_actor TEXT,
  spawned_design_id VARCHAR REFERENCES study_designs(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS feedback_events_finding_idx ON feedback_events(finding_id);
CREATE INDEX IF NOT EXISTS feedback_events_kind_idx ON feedback_events(kind);
