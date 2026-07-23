-- 0013: Close a privilege-escalation hole in signup.
-- The profile-provisioning trigger read the role straight from signup
-- metadata — but clients control their own user_metadata, so anyone could
-- have signed up as 'admin'. Self-service signups may only ever be
-- 'customer' or 'vendor'; admin is granted exclusively by the team via SQL
-- or the (admin-guarded) API.

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, role, full_name, phone, locale)
  VALUES (
    NEW.id,
    CASE
      WHEN NEW.raw_user_meta_data->>'role' IN ('customer', 'vendor')
        THEN (NEW.raw_user_meta_data->>'role')::user_role
      ELSE 'customer'
    END,
    NEW.raw_user_meta_data->>'full_name',
    NEW.phone,
    COALESCE(NEW.raw_user_meta_data->>'locale', 'en')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
