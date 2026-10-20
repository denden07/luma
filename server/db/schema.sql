-- madetogether Local Development Database Schema
-- This schema mirrors the future Supabase production schema

-- Events table
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  date TIMESTAMP WITH TIME ZONE NOT NULL,
  guest_limit INTEGER NOT NULL DEFAULT 30 CHECK (guest_limit BETWEEN 1 AND 30),
  photo_limit INTEGER NOT NULL DEFAULT 20 CHECK (photo_limit BETWEEN 1 AND 20),
  start_time TIMESTAMP WITH TIME ZONE,
  end_time TIMESTAMP WITH TIME ZONE,
  cover_photo_path VARCHAR(500),
  enabled_filters JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  price_php INTEGER NOT NULL DEFAULT 0 CHECK (price_php >= 0),
  payment_status VARCHAR(10) NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'partial', 'paid')),
  rsvp_plus_limit INTEGER NOT NULL DEFAULT 0 CHECK (rsvp_plus_limit >= 0),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Keep local databases created by earlier versions compatible with this schema.
ALTER TABLE events ADD COLUMN IF NOT EXISTS photo_limit INTEGER NOT NULL DEFAULT 20;
ALTER TABLE events ADD COLUMN IF NOT EXISTS start_time TIMESTAMP WITH TIME ZONE;
ALTER TABLE events ADD COLUMN IF NOT EXISTS end_time TIMESTAMP WITH TIME ZONE;
ALTER TABLE events ADD COLUMN IF NOT EXISTS cover_photo_path VARCHAR(500);
ALTER TABLE events ADD COLUMN IF NOT EXISTS enabled_filters JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE events ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE events ADD COLUMN IF NOT EXISTS price_php INTEGER NOT NULL DEFAULT 0 CHECK (price_php >= 0);
ALTER TABLE events ADD COLUMN IF NOT EXISTS payment_status VARCHAR(10) NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'partial', 'paid'));
ALTER TABLE events ADD COLUMN IF NOT EXISTS rsvp_plus_limit INTEGER NOT NULL DEFAULT 0 CHECK (rsvp_plus_limit >= 0);
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_rsvp_plus_limit_check;
ALTER TABLE events ADD CONSTRAINT events_rsvp_plus_limit_check CHECK (rsvp_plus_limit >= 0);
ALTER TABLE events ALTER COLUMN guest_limit SET DEFAULT 30;

-- Invitation website content is separate from camera event data. Draft and published
-- documents remain independent so unpublished host edits never reach guests.
CREATE TABLE IF NOT EXISTS event_websites (
  event_id UUID PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  draft_document JSONB NOT NULL,
  published_document JSONB,
  public_slug VARCHAR(120) UNIQUE,
  draft_version INTEGER NOT NULL DEFAULT 1 CHECK (draft_version >= 1),
  published_version INTEGER CHECK (published_version IS NULL OR published_version >= 1),
  published_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE event_websites ADD COLUMN IF NOT EXISTS draft_document JSONB;
ALTER TABLE event_websites ADD COLUMN IF NOT EXISTS published_document JSONB;
ALTER TABLE event_websites ADD COLUMN IF NOT EXISTS public_slug VARCHAR(120);
ALTER TABLE event_websites ADD COLUMN IF NOT EXISTS draft_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE event_websites ADD COLUMN IF NOT EXISTS published_version INTEGER;
ALTER TABLE event_websites ADD COLUMN IF NOT EXISTS published_at TIMESTAMP WITH TIME ZONE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_event_websites_public_slug ON event_websites(public_slug) WHERE public_slug IS NOT NULL;

CREATE TABLE IF NOT EXISTS event_website_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  storage_path VARCHAR(500) NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_event_website_assets_event_id ON event_website_assets(event_id, created_at DESC);

-- Invitation guest management is intentionally separate from camera participants.
CREATE TABLE IF NOT EXISTS guest_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  contact_number VARCHAR(40),
  invited_party_size INTEGER NOT NULL DEFAULT 1 CHECK (invited_party_size BETWEEN 1 AND 20),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS guests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  group_id UUID REFERENCES guest_groups(id) ON DELETE SET NULL,
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(40),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE guest_groups ADD COLUMN IF NOT EXISTS contact_number VARCHAR(40);
ALTER TABLE guests ADD COLUMN IF NOT EXISTS phone VARCHAR(40);

CREATE TABLE IF NOT EXISTS seating_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  capacity INTEGER NOT NULL CHECK (capacity > 0),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE guests ADD COLUMN IF NOT EXISTS table_id UUID REFERENCES seating_tables(id) ON DELETE SET NULL;
ALTER TABLE guests ADD COLUMN IF NOT EXISTS companion_label VARCHAR(255);
ALTER TABLE guests ADD COLUMN IF NOT EXISTS is_rsvp_companion BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE guests ADD COLUMN IF NOT EXISTS rsvp_response_id UUID;
ALTER TABLE guests ADD COLUMN IF NOT EXISTS rsvp_ordinal INTEGER;
CREATE INDEX IF NOT EXISTS idx_seating_tables_event ON seating_tables(event_id);
CREATE INDEX IF NOT EXISTS idx_guests_table ON guests(table_id);

CREATE INDEX IF NOT EXISTS idx_guest_groups_event_id ON guest_groups(event_id, created_at);
CREATE INDEX IF NOT EXISTS idx_guests_event_id ON guests(event_id, full_name);
CREATE INDEX IF NOT EXISTS idx_guests_group_id ON guests(group_id);

CREATE TABLE IF NOT EXISTS rsvp_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  guest_id UUID REFERENCES guests(id) ON DELETE SET NULL,
  group_id UUID REFERENCES guest_groups(id) ON DELETE SET NULL,
  status VARCHAR(12) NOT NULL CHECK (status IN ('attending', 'declined', 'undecided')),
  party_count INTEGER NOT NULL DEFAULT 0 CHECK (party_count BETWEEN 0 AND 20),
  plus_one_count INTEGER NOT NULL DEFAULT 0 CHECK (plus_one_count BETWEEN 0 AND 20),
  contact_email VARCHAR(255),
  contact_phone VARCHAR(40),
  dietary_notes TEXT,
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CHECK (guest_id IS NOT NULL OR group_id IS NOT NULL)
);

ALTER TABLE rsvp_responses ADD COLUMN IF NOT EXISTS plus_one_count INTEGER NOT NULL DEFAULT 0 CHECK (plus_one_count BETWEEN 0 AND 20);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rsvp_responses_guest_id ON rsvp_responses(guest_id) WHERE guest_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_rsvp_responses_group_id ON rsvp_responses(group_id) WHERE group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rsvp_responses_event_status ON rsvp_responses(event_id, status);
-- Added after responses exist so the same schema works on existing installations.
ALTER TABLE guests DROP CONSTRAINT IF EXISTS guests_rsvp_response_id_fkey;
ALTER TABLE guests ADD CONSTRAINT guests_rsvp_response_id_fkey
  FOREIGN KEY (rsvp_response_id) REFERENCES rsvp_responses(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_guests_rsvp_slot ON guests(rsvp_response_id, rsvp_ordinal)
  WHERE rsvp_response_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS rsvp_attendees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id UUID NOT NULL REFERENCES rsvp_responses(id) ON DELETE CASCADE,
  full_name VARCHAR(255) NOT NULL,
  dietary_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE rsvp_attendees ADD COLUMN IF NOT EXISTS ordinal INTEGER;

CREATE TABLE IF NOT EXISTS rsvp_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  guest_id UUID REFERENCES guests(id) ON DELETE CASCADE,
  group_id UUID REFERENCES guest_groups(id) ON DELETE CASCADE,
  token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CHECK ((guest_id IS NOT NULL AND group_id IS NULL) OR (guest_id IS NULL AND group_id IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rsvp_links_guest_id ON rsvp_links(guest_id) WHERE guest_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_rsvp_links_group_id ON rsvp_links(group_id) WHERE group_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS rsvp_verification_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  submitted_name VARCHAR(255) NOT NULL,
  guest_id UUID REFERENCES guests(id) ON DELETE SET NULL,
  status_response VARCHAR(12) CHECK (status_response IN ('attending', 'declined', 'undecided')),
  party_count INTEGER NOT NULL DEFAULT 0 CHECK (party_count BETWEEN 0 AND 20),
  contact_email VARCHAR(255),
  contact_phone VARCHAR(40),
  dietary_notes TEXT,
  plus_one_count INTEGER NOT NULL DEFAULT 0 CHECK (plus_one_count BETWEEN 0 AND 20),
  status VARCHAR(12) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE rsvp_verification_requests ADD COLUMN IF NOT EXISTS status_response VARCHAR(12) CHECK (status_response IN ('attending', 'declined', 'undecided'));
ALTER TABLE rsvp_verification_requests ADD COLUMN IF NOT EXISTS party_count INTEGER NOT NULL DEFAULT 0 CHECK (party_count BETWEEN 0 AND 20);
ALTER TABLE rsvp_verification_requests ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255);
ALTER TABLE rsvp_verification_requests ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(40);
ALTER TABLE rsvp_verification_requests ADD COLUMN IF NOT EXISTS dietary_notes TEXT;
ALTER TABLE rsvp_verification_requests ADD COLUMN IF NOT EXISTS plus_one_count INTEGER NOT NULL DEFAULT 0 CHECK (plus_one_count BETWEEN 0 AND 20);

CREATE INDEX IF NOT EXISTS idx_rsvp_verification_requests_event_status ON rsvp_verification_requests(event_id, status, requested_at DESC);

-- Host login codes
CREATE TABLE IF NOT EXISTS hosts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(6) NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE hosts ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- Privileged administrator accounts and revocable sessions.
CREATE TABLE IF NOT EXISTS admin_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES admin_accounts(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  csrf_token_hash CHAR(64) NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash CHAR(64) NOT NULL,
  attempted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Participants table
CREATE TABLE IF NOT EXISTS participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Photos table (stores metadata only, not the actual image blob)
CREATE TABLE IF NOT EXISTS photos (
  id UUID PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  storage_path VARCHAR(500) NOT NULL,
  filtered_storage_path VARCHAR(500),
  thumbnail_path VARCHAR(500),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE photos ADD COLUMN IF NOT EXISTS filtered_storage_path VARCHAR(500);

-- Messages table (if needed)
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  participant_id UUID REFERENCES participants(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_participants_event_id ON participants(event_id);
CREATE INDEX IF NOT EXISTS idx_photos_event_id ON photos(event_id);
CREATE INDEX IF NOT EXISTS idx_photos_participant_id ON photos(participant_id);
CREATE INDEX IF NOT EXISTS idx_messages_event_id ON messages(event_id);
CREATE INDEX IF NOT EXISTS idx_events_date_active ON events(date, is_active);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_token_hash ON admin_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expiry ON admin_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_admin_login_attempts_ip_time ON admin_login_attempts(ip_hash, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_hosts_active ON hosts(is_active);
CREATE INDEX IF NOT EXISTS idx_event_websites_published_slug ON event_websites(public_slug) WHERE published_at IS NOT NULL;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for events table
DROP TRIGGER IF EXISTS update_events_updated_at ON events;
CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON events
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_event_websites_updated_at ON event_websites;
CREATE TRIGGER update_event_websites_updated_at BEFORE UPDATE ON event_websites
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_guest_groups_updated_at ON guest_groups;
CREATE TRIGGER update_guest_groups_updated_at BEFORE UPDATE ON guest_groups
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_guests_updated_at ON guests;
CREATE TRIGGER update_guests_updated_at BEFORE UPDATE ON guests
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_rsvp_responses_updated_at ON rsvp_responses;
CREATE TRIGGER update_rsvp_responses_updated_at BEFORE UPDATE ON rsvp_responses
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_admin_accounts_updated_at ON admin_accounts;
CREATE TRIGGER update_admin_accounts_updated_at BEFORE UPDATE ON admin_accounts
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
