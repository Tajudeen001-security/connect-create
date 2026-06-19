
CREATE OR REPLACE FUNCTION public.purchase_api_key(_name text, _key_prefix text, _key_hash text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _new_id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  INSERT INTO public.api_keys (user_id, name, key_prefix, key_hash)
  VALUES (_uid, _name, _key_prefix, _key_hash)
  RETURNING id INTO _new_id;

  INSERT INTO public.coin_transactions (user_id, amount, transaction_type, status)
  VALUES (_uid, 0, 'api_key_purchase', 'completed');

  RETURN _new_id;
END $function$;
