-- RPC para criar primeira organização (contorna RLS de organization_members
-- via SECURITY DEFINER, que de outra forma exigiria o usuário já ser membro).
CREATE OR REPLACE FUNCTION create_organization_with_owner(
  org_name text,
  org_slug text,
  org_plan text DEFAULT 'free',
  org_settings jsonb DEFAULT '{"max_documents": 100, "max_agents": 5, "max_instances": 3}'::jsonb
)
RETURNS organizations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  new_org organizations;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF org_plan NOT IN ('free', 'pro', 'enterprise') THEN
    RAISE EXCEPTION 'Invalid plan: %', org_plan;
  END IF;

  INSERT INTO organizations (name, slug, plan, settings)
  VALUES (org_name, org_slug, org_plan, org_settings)
  RETURNING * INTO new_org;

  INSERT INTO organization_members (organization_id, user_id, role)
  VALUES (new_org.id, uid, 'owner');

  RETURN new_org;
END;
$$;

GRANT EXECUTE ON FUNCTION create_organization_with_owner(text, text, text, jsonb) TO authenticated;
