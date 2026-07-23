-- 0014: Fix "Database error saving new user" on signup.
-- handle_new_user runs as a trigger on auth.users, i.e. under GoTrue's role
-- (supabase_auth_admin) whose search_path does not include public — so the
-- unqualified ::user_role cast failed and every self-service signup 500'd.
-- Pin the search_path and schema-qualify the enum.

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, role, full_name, phone, locale)
  VALUES (
    NEW.id,
    CASE
      WHEN NEW.raw_user_meta_data->>'role' IN ('customer', 'vendor')
        THEN (NEW.raw_user_meta_data->>'role')::public.user_role
      ELSE 'customer'::public.user_role
    END,
    NEW.raw_user_meta_data->>'full_name',
    NEW.phone,
    COALESCE(NEW.raw_user_meta_data->>'locale', 'en')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
