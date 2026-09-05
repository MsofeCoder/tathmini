-- ⚠ SUPERSEDED AND WRONG — DO NOT RUN THIS AGAIN.
--
-- This migration wrote real addresses into users.email. That column is the
-- SIGN-IN IDENTIFIER: it mirrors auth.users.email, which usernameToEmail()
-- builds and signInWithPassword() authenticates against. Real addresses belong
-- in users.contact_email (0017_users_contact_email.sql), which was added in a
-- parallel session for exactly this purpose while this file was being written.
--
-- It has already been applied to azlwxriyhdshfhklonrx, and
-- 0027_restore_users_email_identity.sql undoes it: it restores the synthetic
-- identity to users.email and moves each address to contact_email. Run 0027.
-- Kept, not deleted, because the address list below is the data 0021 reuses.
--
-- Sign-in never broke: only the public.users mirror was touched, never
-- auth.users.

-- Replaces the placeholder login identities on 18 assessor accounts with the
-- real mailboxes the College collected ("Tutor Email Collection", 2026-09-05),
-- plus the two the College named directly.
--
-- DRAFT — NOT APPLIED. Shown for review first (AGENTS.md: stop and ask on
-- migrations).
--
-- Why it matters: the result e-mail decided on 2026-09-05 puts the assessor in
-- Cc for a TP result and in **To** for an IPT one. The roster imports
-- (0007/0008) had to put something in users.email — it is NOT NULL — so every
-- seeded account carries `<identity>@tathmini.internal`, a domain that does
-- not resolve. Sending there bounces, and a stream of bounces is what gets a
-- consumer Gmail sending account rate-limited or suspended. Until this runs,
-- apps/web/src/lib/notifications/recipients.ts treats a @tathmini.internal
-- address as "no address on file": a TP result still reaches its trainee with
-- an empty Cc, and an IPT result cannot be sent at all.
--
-- Matched on the placeholder login identity, NOT on `name`. `name` is not
-- unique: Aron Franco holds two accounts — `aron.franco` (super_admin) and
-- `aron.franco.supervisor` — so a name match would try to write one address to
-- both rows and fail on the UNIQUE constraint on users.email. That duplicate
-- is almost certainly why he appears twice in the collection sheet.
--
-- The WHERE clause also requires the row to still be on the placeholder
-- domain, so re-running this cannot overwrite an address a Super Admin has
-- since set by hand.

update users u set email = v.email
from (values
  -- TP roster (migration 0008)
  ('yohana.yona@tathmini.internal',            'johnyona32@gmail.com'),
  ('benson.chibwi@tathmini.internal',          'gamba1922@gmail.com'),
  ('francis.makori@tathmini.internal',         'chefmakori@gmail.com'),
  ('ramadhani.msidada@tathmini.internal',      'ramadhanimsidada1@gmail.com'),
  ('bakari.ulende@tathmini.internal',          'bally6079@gmail.com'),
  ('anicia.osward@tathmini.internal',          'oswardanny@gmail.com'),
  ('aloyce.nyoni@tathmini.internal',           'aloycenyoni1@gmail.com'),
  ('laurent.mwaisanila@tathmini.internal',     'mwaisanilalaurent89@gmail.com'),
  ('nehemia.david@tathmini.internal',          'nehedward123@gmail.com'),
  ('fayson.mwakaseka@tathmini.internal',       'faysonmwakaseka@gmail.com'),
  ('frank.urio@tathmini.internal',             'uriofrank16@gmail.com'),
  ('denis.michael@tathmini.internal',          'chanaidm83@gmail.com'),
  -- IPT roster (migration 0007)
  ('gladness.mdoe@tathmini.internal',          'gladnessmdoe@gmail.com'),
  ('coletha.ndelwa@tathmini.internal',         'georgecolletha97@gmail.com'),
  ('lilian.makwinya@tathmini.internal',        'lilianimakwinya19@gmail.com'),
  ('evodius.kadason@tathmini.internal',        'evordiusw87@gmail.com'),
  -- Named directly by the College, 2026-09-05. Aron Franco's address goes to
  -- his SUPERVISOR account: that is the one that files IPT reports, and under
  -- the IPT rule the assessor is the To address. His super_admin account
  -- (`aron.franco`) stays on its placeholder — see note 1.
  ('aron.franco.supervisor@tathmini.internal', 'aronfranco2000@gmail.com'),
  ('adam.msofe.supervisor@tathmini.internal',  'msofedesigner@gmail.com')
) as v(identity, email)
where u.email = v.identity;

-- ── NOTE 1: the sheet's second Aron Franco address is unused ───────────
-- `arongpt1@gmail.com` is not assigned here. It most likely belongs to his
-- super_admin account (`aron.franco`), which the sheet would explain — two
-- accounts, two submissions. Left out because a super_admin files no
-- assessments, so it changes nothing about delivery, and guessing at a second
-- identity is not worth it. Add a line if the College confirms.

-- ── NOTE 2: ten assessor accounts keep their placeholder ───────────────
-- Deliberately NOT given invented addresses. The College asked for
-- "placeholder e-mails to edit later" — these rows already have exactly that,
-- and @tathmini.internal is the safe form of it: the domain does not resolve,
-- and recipients.ts already recognises it as "no address on file". Inventing
-- something that looks real would be strictly worse — it would either bounce
-- (endangering the sending account) or, if the domain happens to be owned by
-- someone, deliver a trainee's marks to a stranger. A Super Admin replaces
-- these in place whenever the addresses arrive; no further migration needed.
--
--   TP  — Enelisa Mbwile, Lucia Daniel, Mkama Maugo, Ramadhani Ngare,
--         Rodgers Amin          (their TP results still send; only Cc is lost)
--   IPT — Daud Mafige, Fausta Makweta, Holly Kaje, Misyao Nunda,
--         Nickson Kinyamagoha   (their IPT results CANNOT send — they are To)
--
-- Not listed because they never assess: `msofe.coder` and `aron.franco`, both
-- super_admin.
