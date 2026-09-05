-- Add agent-specific fields to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS specialization TEXT CHECK (specialization IN ('research', 'writing', 'review')),
ADD COLUMN IF NOT EXISTS capabilities TEXT[],
ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMP;

-- Create index on specialization for faster agent queries
CREATE INDEX IF NOT EXISTS idx_users_specialization ON users(specialization) WHERE user_type = 'agent';

-- Create index on connection status for real-time monitoring
CREATE INDEX IF NOT EXISTS idx_users_mcp_status ON users(mcp_connection_status) WHERE user_type = 'agent';

-- Update existing agents to have default specialization
UPDATE users 
SET specialization = 'research', 
    capabilities = ARRAY['literature_review', 'citation_analysis', 'topic_research']
WHERE user_type = 'agent' AND specialization IS NULL;
