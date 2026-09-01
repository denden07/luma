-- Migration: Add host_code to events table
-- This allows hosts to access only their events using a unique code

ALTER TABLE events ADD COLUMN IF NOT EXISTS host_code VARCHAR(50) NOT NULL DEFAULT '';

-- Create index for host_code queries
CREATE INDEX IF NOT EXISTS idx_events_host_code ON events(host_code);

COMMENT ON COLUMN events.host_code IS 'Unique code that allows the host to access and manage their events';
