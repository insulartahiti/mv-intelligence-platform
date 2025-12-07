
-- Create legal_config table for global legal analysis rules
CREATE TABLE IF NOT EXISTS legal_config (
  key TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id)
);

-- RLS
ALTER TABLE legal_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read access to all users" ON legal_config;
CREATE POLICY "Allow read access to all users" ON legal_config FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow update access to authenticated users" ON legal_config;
CREATE POLICY "Allow update access to authenticated users" ON legal_config FOR UPDATE USING (auth.role() = 'authenticated');

-- Initial Seed (using placeholders for large text to keep migration readable, 
-- in production we would upsert the actual values or rely on the UI to populate default if missing)
-- Ideally we insert the defaults here so the system works out of the box with the DB.

INSERT INTO legal_config (key, description, content) VALUES
('semantic_normalization', 'Maps diverse legal terms to standard concepts', '
SEMANTIC NORMALISATION (Map different labels to the same concepts):

PROTECTIVE PROVISIONS / VETO / RESERVED MATTERS:
- US: "Protective Provisions", "Investor Protective Provisions", "Preferred Stock Protective Provisions"
- UK/EU: "Reserved Matters", "Investors'' Consent Matters", "Veto rights"
- Sometimes: "Negative covenants" (especially in CLAs/notes)
→ Map to: protective_provisions in CONTROL section

PRIMARY PRE-EMPTION / PRO RATA RIGHTS:
- Labels: "Pre-emptive rights on new securities", "Right of first offer on new securities", "Pre-emption rights on issue", "Pro rata rights", "Participation rights"
→ Map to: pre_emption in INVESTOR_RIGHTS section

TRANSFER PRE-EMPTION / ROFR:
- Labels: "Right of first refusal", "ROFR", "Pre-emption on transfer", "Share transfer restrictions", "Right of first offer on transfers"
→ Map to: rofr in INVESTOR_RIGHTS section

DRAG-ALONG:
- Labels: "Drag-along rights", "Compulsory transfer on Exit", "Drag provisions"
→ Map to: drag_along in CONTROL section

TAG-ALONG / CO-SALE:
- Labels: "Tag-along rights", "Co-sale rights", "Right to participate in Founder sale"
→ Map to: tag_along in CONTROL section

LIQUIDATION PREFERENCE:
- Labels: "Liquidation preference", "Preference on a return of capital", "Distribution waterfall on a Liquidation Event", "Preference shares", "Preferred return"
→ Map to: liquidation_preference in ECONOMICS section

ANTI-DILUTION:
- Labels: "Anti-dilution protection", "Down-round protection", "Price-based anti-dilution", "Full ratchet", "Weighted average anti-dilution"
→ Map to: anti_dilution in ECONOMICS section

GOOD / BAD LEAVER:
- Labels: "Good Leaver", "Bad Leaver", "Leaver provisions", "Compulsory transfers on cessation of employment"
→ Map to: founder_vesting in OWNERSHIP section
')
ON CONFLICT (key) DO NOTHING;

