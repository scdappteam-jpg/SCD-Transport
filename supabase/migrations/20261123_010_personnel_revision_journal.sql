-- Private recovery history: not in the public PostgREST schema. No transport
-- records are rewritten. Run as the database owner after taking a backup.
BEGIN;
CREATE SCHEMA IF NOT EXISTS scd_recovery_private;
CREATE TABLE IF NOT EXISTS scd_recovery_private.personnel_revisions (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    state_id text NOT NULL,
    source_updated_at timestamptz NOT NULL,
    captured_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    phase text NOT NULL,
    payload jsonb NOT NULL
);
ALTER TABLE scd_recovery_private.personnel_revisions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS personnel_revisions_source
    ON scd_recovery_private.personnel_revisions(state_id, captured_at DESC);

CREATE OR REPLACE FUNCTION scd_recovery_private.capture_personnel_revision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, scd_recovery_private AS $function$
DECLARE
    old_profiles jsonb;
    new_profiles jsonb;
BEGIN
    IF OLD.id <> 'scd-transport' THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
    END IF;
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'SCD source-of-truth deletion refused; use reviewed database maintenance';
    END IF;
    IF OLD.data#>'{stateChunks,keys}' IS NOT NULL
       AND NEW.data#>'{stateChunks,keys}' IS NULL THEN
        RAISE EXCEPTION 'SCD chunk manifest downgrade refused: restart outdated workers';
    END IF;
    old_profiles := coalesce(OLD.data#>'{hr,employeeProfiles}', '{}'::jsonb);
    new_profiles := coalesce(NEW.data#>'{hr,employeeProfiles}', '{}'::jsonb);
    IF (jsonb_array_length(coalesce(OLD.data->'users','[]'::jsonb)) > 50
        AND jsonb_array_length(coalesce(NEW.data->'users','[]'::jsonb)) < jsonb_array_length(OLD.data->'users') / 2)
       OR ((SELECT count(*) FROM jsonb_each(old_profiles)) > 20
        AND (SELECT count(*) FROM jsonb_each(new_profiles)) < (SELECT count(*) FROM jsonb_each(old_profiles)) / 2) THEN
        RAISE EXCEPTION 'SCD bulk personnel loss refused: incoming snapshot is incomplete';
    END IF;
    IF OLD.data->'users' IS DISTINCT FROM NEW.data->'users'
       OR old_profiles IS DISTINCT FROM new_profiles
       OR OLD.data#>'{hr,auditLogs}' IS DISTINCT FROM NEW.data#>'{hr,auditLogs}' THEN
        INSERT INTO scd_recovery_private.personnel_revisions(state_id,source_updated_at,phase,payload)
        VALUES
          (OLD.id, OLD.updated_at, 'before', jsonb_build_object('users',OLD.data->'users','employeeProfiles',old_profiles,'auditLogs',OLD.data#>'{hr,auditLogs}')),
          (NEW.id, NEW.updated_at, 'after', jsonb_build_object('users',NEW.data->'users','employeeProfiles',new_profiles,'auditLogs',NEW.data#>'{hr,auditLogs}'));
    END IF;
    RETURN NEW;
END;
$function$;

-- Idempotent installation without dropping an existing protection trigger.
DO $install$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.app_state'::regclass AND tgname='scd_personnel_revision_guard') THEN
        CREATE TRIGGER scd_personnel_revision_guard BEFORE UPDATE OR DELETE ON public.app_state
        FOR EACH ROW EXECUTE FUNCTION scd_recovery_private.capture_personnel_revision();
    END IF;
END;
$install$;
INSERT INTO scd_recovery_private.personnel_revisions(state_id,source_updated_at,phase,payload)
SELECT id,updated_at,'recovered-baseline',jsonb_build_object('users',data->'users','employeeProfiles',data#>'{hr,employeeProfiles}','auditLogs',data#>'{hr,auditLogs}')
FROM public.app_state s WHERE id='scd-transport'
AND NOT EXISTS (SELECT 1 FROM scd_recovery_private.personnel_revisions r WHERE r.state_id=s.id AND r.phase='recovered-baseline');
COMMIT;
