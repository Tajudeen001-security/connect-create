
-- Security-definer helpers to avoid RLS recursion on group_members
CREATE OR REPLACE FUNCTION public.is_group_member(_group_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = _group_id AND user_id = _user_id
  )
$$;

CREATE OR REPLACE FUNCTION public.is_group_admin(_group_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = _group_id AND user_id = _user_id AND role = 'admin'
  )
$$;

-- Drop recursive policies
DROP POLICY IF EXISTS "Members can view group members" ON public.group_members;
DROP POLICY IF EXISTS "Admins can remove members" ON public.group_members;
DROP POLICY IF EXISTS "Users can join groups" ON public.group_members;

-- Recreate using helper functions
CREATE POLICY "Members can view group members"
ON public.group_members FOR SELECT
TO authenticated
USING (public.is_group_member(group_id, auth.uid()));

CREATE POLICY "Users can join groups"
ON public.group_members FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  OR public.is_group_admin(group_id, auth.uid())
);

CREATE POLICY "Admins or self can remove members"
ON public.group_members FOR DELETE
TO authenticated
USING (
  auth.uid() = user_id
  OR public.is_group_admin(group_id, auth.uid())
);

-- Cap group size at 50 via trigger (CHECK can't do this)
CREATE OR REPLACE FUNCTION public.enforce_group_member_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  member_count integer;
BEGIN
  SELECT COUNT(*) INTO member_count FROM public.group_members WHERE group_id = NEW.group_id;
  IF member_count >= 50 THEN
    RAISE EXCEPTION 'This group has reached the 50-member limit';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_group_member_limit_trigger ON public.group_members;
CREATE TRIGGER enforce_group_member_limit_trigger
BEFORE INSERT ON public.group_members
FOR EACH ROW EXECUTE FUNCTION public.enforce_group_member_limit();
