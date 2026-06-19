
CREATE OR REPLACE FUNCTION public.auto_verify_early_users()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  profile_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO profile_count FROM public.profiles;
  IF profile_count <= 6 THEN
    NEW.is_verified := true;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER auto_verify_first_six
BEFORE INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.auto_verify_early_users();
