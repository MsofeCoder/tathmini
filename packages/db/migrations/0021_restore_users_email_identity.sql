-- Undoes the damage migration 0016 did to users.email, and puts the real
-- addresses where they belong.
--
-- 0016 overwrote users.email with each supervisor's real Gmail address. That
-- column is the SIGN-IN IDENTIFIER: it mirrors auth.users.email, which is what
-- usernameToEmail() builds and signInWithPassword() authenticates against
-- (apps/web/src/app/login/actions.ts). Real addresses belong in
-- users.contact_email, added for exactly this purpose by
-- 0017_users_contact_email.sql.
--
-- Sign-in did NOT break: 0016 touched only the public.users mirror, never
-- auth.users, so every supervisor can still sign in with their
-- <firstname>.<lastname> username. What broke is the invariant that the mirror
-- matches auth — and users.email is UNIQUE, so leaving real addresses there
-- would collide the next time accounts are created or synced.
--
-- This migration is written to be safe in either direction: it restores the
-- identity only where a real address is currently sitting in users.email, and
-- fills contact_email from the same pair. Re-running it changes nothing.
--
-- REQUIRES 0017_users_contact_email.sql to have run first.

with identity_map as (
  select * from (values
  ('yohana.yona@tathmini.internal', 'johnyona32@gmail.com'),
  ('benson.chibwi@tathmini.internal', 'gamba1922@gmail.com'),
  ('francis.makori@tathmini.internal', 'chefmakori@gmail.com'),
  ('ramadhani.msidada@tathmini.internal', 'ramadhanimsidada1@gmail.com'),
  ('bakari.ulende@tathmini.internal', 'bally6079@gmail.com'),
  ('anicia.osward@tathmini.internal', 'oswardanny@gmail.com'),
  ('aloyce.nyoni@tathmini.internal', 'aloycenyoni1@gmail.com'),
  ('laurent.mwaisanila@tathmini.internal', 'mwaisanilalaurent89@gmail.com'),
  ('nehemia.david@tathmini.internal', 'nehedward123@gmail.com'),
  ('fayson.mwakaseka@tathmini.internal', 'faysonmwakaseka@gmail.com'),
  ('frank.urio@tathmini.internal', 'uriofrank16@gmail.com'),
  ('denis.michael@tathmini.internal', 'chanaidm83@gmail.com'),
  ('gladness.mdoe@tathmini.internal', 'gladnessmdoe@gmail.com'),
  ('coletha.ndelwa@tathmini.internal', 'georgecolletha97@gmail.com'),
  ('lilian.makwinya@tathmini.internal', 'lilianimakwinya19@gmail.com'),
  ('evodius.kadason@tathmini.internal', 'evordiusw87@gmail.com'),
  ('aron.franco.supervisor@tathmini.internal', 'aronfranco2000@gmail.com'),
  ('adam.msofe.supervisor@tathmini.internal', 'msofedesigner@gmail.com')
  ) as v(identity, contact)
)
update users u set
  email         = m.identity,
  contact_email = coalesce(u.contact_email, m.contact)
from identity_map m
where u.email = m.contact
   or (u.email = m.identity and u.contact_email is distinct from m.contact);

-- Afterwards both of these must hold:
--   select count(*) from users where email not like '%@tathmini.internal';  -- 0
--   select count(*) from users where contact_email is not null;             -- 18
