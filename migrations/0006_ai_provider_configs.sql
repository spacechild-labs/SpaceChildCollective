-- Encrypted global AI provider configuration. Plaintext API keys are never stored.
CREATE TABLE IF NOT EXISTS ai_provider_configs (
  id VARCHAR PRIMARY KEY,
  name TEXT NOT NULL,
  encrypted_api_key TEXT NOT NULL,
  base_url TEXT,
  models TEXT[] NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  rate_limit JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  last_used TIMESTAMP NOT NULL DEFAULT now(),
  usage_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ai_provider_configs_active_idx ON ai_provider_configs(is_active);