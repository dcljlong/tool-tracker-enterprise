CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    is_admin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TABLE IF NOT EXISTS equipment (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    asset_id TEXT UNIQUE NOT NULL,
    qr_code_value TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    category TEXT,
    condition TEXT,
    notes TEXT,
    test_tag_done_date DATE,
    test_tag_next_due_date DATE,
    primary_photo_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TABLE IF NOT EXISTS checkouts (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    equipment_id UUID REFERENCES equipment(id) ON DELETE CASCADE NOT NULL,
    checked_out_by UUID REFERENCES auth.users(id),
    checked_out_to TEXT NOT NULL,
    site TEXT NOT NULL,
    expected_return_at TIMESTAMP WITH TIME ZONE NOT NULL,
    returned_at TIMESTAMP WITH TIME ZONE,
    return_condition TEXT,
    pickup_photo_url TEXT,
    return_photo_url TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    action_type TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    before_state JSONB,
    after_state JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX idx_equipment_asset_id ON equipment(asset_id);
CREATE INDEX idx_equipment_qr ON equipment(qr_code_value);
CREATE INDEX idx_checkouts_equipment_id ON checkouts(equipment_id);
CREATE INDEX idx_checkouts_returned_at ON checkouts(returned_at) WHERE returned_at IS NULL;

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Anyone view equipment" ON equipment FOR SELECT TO authenticated USING (true);
CREATE POLICY "Only admins insert equipment" ON equipment FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));
CREATE POLICY "Only admins update equipment" ON equipment FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));
CREATE POLICY "Only admins delete equipment" ON equipment FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));
CREATE POLICY "Anyone view checkouts" ON checkouts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users create checkouts" ON checkouts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users update checkouts" ON checkouts FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Anyone view audit logs" ON audit_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "System insert audit logs" ON audit_log FOR INSERT TO authenticated WITH CHECK (true);

CREATE OR REPLACE FUNCTION log_equipment_changes() RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO audit_log (user_id, action_type, entity_type, entity_id, after_state)
        VALUES (auth.uid(), 'INSERT', 'equipment', NEW.id, to_jsonb(NEW));
        RETURN NEW;
    ELSIF (TG_OP = 'UPDATE') THEN
        INSERT INTO audit_log (user_id, action_type, entity_type, entity_id, before_state, after_state)
        VALUES (auth.uid(), 'UPDATE', 'equipment', NEW.id, to_jsonb(OLD), to_jsonb(NEW));
        RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
        INSERT INTO audit_log (user_id, action_type, entity_type, entity_id, before_state)
        VALUES (auth.uid(), 'DELETE', 'equipment', OLD.id, to_jsonb(OLD));
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER equipment_audit_trigger AFTER INSERT OR UPDATE OR DELETE ON equipment
FOR EACH ROW EXECUTE FUNCTION log_equipment_changes();

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, is_admin) VALUES (NEW.id, false);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
-- =========================================================
-- PHASE 2 ADDITIONS — STATUS + EXPIRY SUPPORT
-- =========================================================

-- Soft delete (safer than hard delete in enterprise systems)
ALTER TABLE IF EXISTS equipment
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_equipment_deleted_at ON equipment(deleted_at);

-- Optional stored status (frontend can still compute, but this helps)
-- Values: available | in_use | return_due | overdue | retired
ALTER TABLE IF EXISTS equipment
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'available';

CREATE INDEX IF NOT EXISTS idx_equipment_status ON equipment(status);

-- Helpful index for test-tag expiry scans
CREATE INDEX IF NOT EXISTS idx_equipment_test_tag_due ON equipment(test_tag_next_due_date);

-- Current open checkout per equipment (latest where returned_at is null)
CREATE OR REPLACE VIEW public.equipment_current_status AS
SELECT
  e.*,
  c.id AS open_checkout_id,
  c.checked_out_to,
  c.site,
  c.expected_return_at,
  c.created_at AS checked_out_at,
  CASE
    WHEN e.deleted_at IS NOT NULL THEN 'retired'
    WHEN c.id IS NULL THEN 'available'
    WHEN c.returned_at IS NULL AND c.expected_return_at > NOW() THEN 'in_use'
    WHEN c.returned_at IS NULL AND c.expected_return_at <= NOW() THEN 'overdue'
    ELSE 'available'
  END AS computed_status,
  CASE
    WHEN e.test_tag_next_due_date IS NULL THEN NULL
    WHEN e.test_tag_next_due_date < CURRENT_DATE THEN 'expired'
    WHEN e.test_tag_next_due_date <= (CURRENT_DATE + INTERVAL '30 days') THEN 'due_soon'
    ELSE 'ok'
  END AS test_tag_state
FROM equipment e
LEFT JOIN LATERAL (
  SELECT *
  FROM checkouts
  WHERE equipment_id = e.id AND returned_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1
) c ON TRUE;

-- RLS: allow authenticated users to read the view (it uses base tables)
GRANT SELECT ON public.equipment_current_status TO authenticated;
