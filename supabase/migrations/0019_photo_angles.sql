-- 0019: Labeled photo slots (onboarding spec §5).
--
-- The spec requires six specific photos per vehicle — front, rear, left,
-- right, dashboard, seats — before a listing may go live. `photos` stays the
-- ordered gallery every screen already renders; `photo_angles` maps each
-- required angle to the URL that fills it ({"front": "https://…", …}).
-- Angle names are validated in the API; the activation gate (all six present
-- before status can become 'active') is enforced there too, where it can
-- return a helpful error naming the missing angles.

alter table vehicles
  add column photo_angles jsonb not null default '{}'::jsonb;

comment on column vehicles.photo_angles is
  'Required-angle slots: {front, rear, left, right, dashboard, seats} -> public photo URL. Subset of photos[].';
