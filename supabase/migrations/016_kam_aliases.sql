-- 016: KAM name aliases. An MX issue whose kam_name matches a KAM's display name or alias
-- is visible to that KAM, and the KAM can give feedback on it (lib/roles.js isNamedKam).
-- Links approved by the user on 18 Nov 2026. Safe to re-run.
ALTER TABLE public.users_roles ADD COLUMN IF NOT EXISTS kam_aliases text[] NOT NULL DEFAULT '{}';

UPDATE public.users_roles SET kam_aliases = CASE email
  WHEN 'sazzad.haider@carrybee.com'      THEN ARRAY['Mohammad Sazzad Haider']
  WHEN 'ibrahim.emu@carrybee.com'        THEN ARRAY['Md. Ibrahim Emu']
  WHEN 'sohel.rana@carrybee.com'         THEN ARRAY['MD Sohel Rana']
  WHEN 'ibrahim.mojumder@carrybee.com'   THEN ARRAY['Md. Ibrahim Mo Jumder']
  WHEN 'rakib.c@carrybee.com'            THEN ARRAY['Rakib']
  WHEN 'mahmud.hasan@carrybee.com'       THEN ARRAY['Mahmud Hasan']
  WHEN 'mahmudul.hasan@carrybee.com'     THEN ARRAY['Md .Mahmudul Hasan', 'Mahmudul (Inbound)']
  WHEN 'jaber.aunto@carrybee.com'        THEN ARRAY['Jaber Aunto']
  ELSE kam_aliases END
WHERE email IN (
  'sazzad.haider@carrybee.com','ibrahim.emu@carrybee.com','sohel.rana@carrybee.com',
  'ibrahim.mojumder@carrybee.com','rakib.c@carrybee.com','mahmud.hasan@carrybee.com',
  'mahmudul.hasan@carrybee.com','jaber.aunto@carrybee.com');
