BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ NULL;

-- Preserve access for students that were active before email verification existed.
UPDATE users
SET email_verified_at = COALESCE(email_verified_at, created_at)
WHERE role = 'STUDENT' AND status = 'ACTIVE' AND email_verified_at IS NULL;

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS email_verification_tokens_hash_unique
  ON email_verification_tokens(token_hash);
CREATE INDEX IF NOT EXISTS email_verification_tokens_user_active_idx
  ON email_verification_tokens(user_id, expires_at DESC) WHERE used_at IS NULL;
CREATE INDEX IF NOT EXISTS email_verification_tokens_expiry_idx
  ON email_verification_tokens(expires_at) WHERE used_at IS NULL;

COMMIT;
