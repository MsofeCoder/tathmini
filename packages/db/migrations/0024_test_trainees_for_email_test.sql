-- Synthetic test trainees for the end-to-end result e-mail test the College
-- asked for on 2026-09-05: THREE on every live route, one per test address,
-- so each route exercises all three inboxes. 42 rows across 14 routes.
--
-- DRAFT - NOT APPLIED. Read the two warnings below before running it: this
-- migration puts test rows on REAL routes, and that is visible to real
-- supervisors and sends real e-mail to them.
--
-- Obviously fake and trivially removable. Every row is named 'TEST TRAINEE
-- <track><route><A|B|C>' and carries a 'TEST-' registration number, so no row
-- can be mistaken for a real trainee in a route list or on a report. Same
-- convention as migration 0011's 'TEST TRAINEE 1'..'5'.
--
-- REMOVE WHEN THE TEST IS DONE:
--   delete from trainees where registration_number like 'TEST-%';
-- (assignments cascade with the trainee, per schema.ts. Do this BEFORE any
-- real marking starts on these routes -- once a test row carries a submitted
-- mark, deleting it deletes that mark too.)
--
-- ── WARNING 1: real supervisors will see these ─────────────────────────
-- Three test trainees on TP ROUTE 1 appear in Mkama Maugo's and Yohana Yona's
-- route list, and move their progress counter by three ("2 of 8 assessed"
-- becomes "2 of 11"). All 14 real supervisor pairs are affected. If they are
-- in the field before these rows are deleted, they will see them.
--
-- ── WARNING 2: the test will e-mail real supervisors ───────────────────
-- Under the recipient rules settled on 2026-09-05:
--   TP  - To the test trainee's own inbox, Cc THE REAL ASSESSOR, Bcc the
--         Coordinator. So a TP test mails the route's real supervisor.
--   IPT - To THE REAL ASSESSOR, Cc the Coordinator. The trainee is never
--         e-mailed on IPT, so an IPT test does not reach the addresses below
--         at all; it lands in the supervisor's inbox instead. To receive one,
--         sign in as Aron Franco's or Adam Msofe's supervisor account -
--         migration 0022 points both at these same test addresses.
-- The e-mail column on the IPT rows is therefore deliberately unused by the
-- send path. It is set anyway so the rows are uniform and so a regression that
-- wrongly e-mailed an IPT trainee would be caught by a message arriving where
-- none should.
--
-- Volume: 42 reports x 2-3 recipients is roughly 110 recipients if every test
-- row is submitted, well inside a Gmail account's daily allowance - but it is
-- a real fraction of it, so do not run the full set twice in one day.

with test_trainee_seed as (
  select * from (values
    ('TP ROUTE 1', 'TEST TRAINEE TP1A', 'TEST-TP-R1A', 'TP', 'msofedesigner@gmail.com', '0700000001'),
    ('TP ROUTE 1', 'TEST TRAINEE TP1B', 'TEST-TP-R1B', 'TP', 'msofecoder@gmail.com', '0700000002'),
    ('TP ROUTE 1', 'TEST TRAINEE TP1C', 'TEST-TP-R1C', 'TP', 'aronfranco2000@gmail.com', '0700000003'),
    ('TP ROUTE 2', 'TEST TRAINEE TP2A', 'TEST-TP-R2A', 'TP', 'msofedesigner@gmail.com', '0700000004'),
    ('TP ROUTE 2', 'TEST TRAINEE TP2B', 'TEST-TP-R2B', 'TP', 'msofecoder@gmail.com', '0700000005'),
    ('TP ROUTE 2', 'TEST TRAINEE TP2C', 'TEST-TP-R2C', 'TP', 'aronfranco2000@gmail.com', '0700000006'),
    ('TP ROUTE 3', 'TEST TRAINEE TP3A', 'TEST-TP-R3A', 'TP', 'msofedesigner@gmail.com', '0700000007'),
    ('TP ROUTE 3', 'TEST TRAINEE TP3B', 'TEST-TP-R3B', 'TP', 'msofecoder@gmail.com', '0700000008'),
    ('TP ROUTE 3', 'TEST TRAINEE TP3C', 'TEST-TP-R3C', 'TP', 'aronfranco2000@gmail.com', '0700000009'),
    ('TP ROUTE 4', 'TEST TRAINEE TP4A', 'TEST-TP-R4A', 'TP', 'msofedesigner@gmail.com', '0700000010'),
    ('TP ROUTE 4', 'TEST TRAINEE TP4B', 'TEST-TP-R4B', 'TP', 'msofecoder@gmail.com', '0700000011'),
    ('TP ROUTE 4', 'TEST TRAINEE TP4C', 'TEST-TP-R4C', 'TP', 'aronfranco2000@gmail.com', '0700000012'),
    ('TP ROUTE 5', 'TEST TRAINEE TP5A', 'TEST-TP-R5A', 'TP', 'msofedesigner@gmail.com', '0700000013'),
    ('TP ROUTE 5', 'TEST TRAINEE TP5B', 'TEST-TP-R5B', 'TP', 'msofecoder@gmail.com', '0700000014'),
    ('TP ROUTE 5', 'TEST TRAINEE TP5C', 'TEST-TP-R5C', 'TP', 'aronfranco2000@gmail.com', '0700000015'),
    ('TP ROUTE 6', 'TEST TRAINEE TP6A', 'TEST-TP-R6A', 'TP', 'msofedesigner@gmail.com', '0700000016'),
    ('TP ROUTE 6', 'TEST TRAINEE TP6B', 'TEST-TP-R6B', 'TP', 'msofecoder@gmail.com', '0700000017'),
    ('TP ROUTE 6', 'TEST TRAINEE TP6C', 'TEST-TP-R6C', 'TP', 'aronfranco2000@gmail.com', '0700000018'),
    ('TP ROUTE 7', 'TEST TRAINEE TP7A', 'TEST-TP-R7A', 'TP', 'msofedesigner@gmail.com', '0700000019'),
    ('TP ROUTE 7', 'TEST TRAINEE TP7B', 'TEST-TP-R7B', 'TP', 'msofecoder@gmail.com', '0700000020'),
    ('TP ROUTE 7', 'TEST TRAINEE TP7C', 'TEST-TP-R7C', 'TP', 'aronfranco2000@gmail.com', '0700000021'),
    ('TP ROUTE 8', 'TEST TRAINEE TP8A', 'TEST-TP-R8A', 'TP', 'msofedesigner@gmail.com', '0700000022'),
    ('TP ROUTE 8', 'TEST TRAINEE TP8B', 'TEST-TP-R8B', 'TP', 'msofecoder@gmail.com', '0700000023'),
    ('TP ROUTE 8', 'TEST TRAINEE TP8C', 'TEST-TP-R8C', 'TP', 'aronfranco2000@gmail.com', '0700000024'),
    ('TP ROUTE 9', 'TEST TRAINEE TP9A', 'TEST-TP-R9A', 'TP', 'msofedesigner@gmail.com', '0700000025'),
    ('TP ROUTE 9', 'TEST TRAINEE TP9B', 'TEST-TP-R9B', 'TP', 'msofecoder@gmail.com', '0700000026'),
    ('TP ROUTE 9', 'TEST TRAINEE TP9C', 'TEST-TP-R9C', 'TP', 'aronfranco2000@gmail.com', '0700000027'),
    ('IPT ROUTE 1', 'TEST TRAINEE IPT1A', 'TEST-IPT-R1A', 'IPT', 'msofedesigner@gmail.com', '0700000028'),
    ('IPT ROUTE 1', 'TEST TRAINEE IPT1B', 'TEST-IPT-R1B', 'IPT', 'msofecoder@gmail.com', '0700000029'),
    ('IPT ROUTE 1', 'TEST TRAINEE IPT1C', 'TEST-IPT-R1C', 'IPT', 'aronfranco2000@gmail.com', '0700000030'),
    ('IPT ROUTE 2', 'TEST TRAINEE IPT2A', 'TEST-IPT-R2A', 'IPT', 'msofedesigner@gmail.com', '0700000031'),
    ('IPT ROUTE 2', 'TEST TRAINEE IPT2B', 'TEST-IPT-R2B', 'IPT', 'msofecoder@gmail.com', '0700000032'),
    ('IPT ROUTE 2', 'TEST TRAINEE IPT2C', 'TEST-IPT-R2C', 'IPT', 'aronfranco2000@gmail.com', '0700000033'),
    ('IPT ROUTE 3', 'TEST TRAINEE IPT3A', 'TEST-IPT-R3A', 'IPT', 'msofedesigner@gmail.com', '0700000034'),
    ('IPT ROUTE 3', 'TEST TRAINEE IPT3B', 'TEST-IPT-R3B', 'IPT', 'msofecoder@gmail.com', '0700000035'),
    ('IPT ROUTE 3', 'TEST TRAINEE IPT3C', 'TEST-IPT-R3C', 'IPT', 'aronfranco2000@gmail.com', '0700000036'),
    ('IPT ROUTE 4', 'TEST TRAINEE IPT4A', 'TEST-IPT-R4A', 'IPT', 'msofedesigner@gmail.com', '0700000037'),
    ('IPT ROUTE 4', 'TEST TRAINEE IPT4B', 'TEST-IPT-R4B', 'IPT', 'msofecoder@gmail.com', '0700000038'),
    ('IPT ROUTE 4', 'TEST TRAINEE IPT4C', 'TEST-IPT-R4C', 'IPT', 'aronfranco2000@gmail.com', '0700000039'),
    ('IPT ROUTE 5', 'TEST TRAINEE IPT5A', 'TEST-IPT-R5A', 'IPT', 'msofedesigner@gmail.com', '0700000040'),
    ('IPT ROUTE 5', 'TEST TRAINEE IPT5B', 'TEST-IPT-R5B', 'IPT', 'msofecoder@gmail.com', '0700000041'),
    ('IPT ROUTE 5', 'TEST TRAINEE IPT5C', 'TEST-IPT-R5C', 'IPT', 'aronfranco2000@gmail.com', '0700000042')
  ) as v(route_code, name, registration_number, track, email, phone)
)
insert into trainees (name, registration_number, course, occupation, institution,
                      district, region, track, email, phone, route_id)
select ts.name, ts.registration_number, 'TEST', 'Test Occupation', 'TEST CENTRE',
       'TEST DISTRICT', 'TEST REGION', ts.track::track_type, ts.email, ts.phone, r.id
from test_trainee_seed ts
join routes r on r.code = ts.route_code
where not exists (
  select 1 from trainees t where t.registration_number = ts.registration_number
);

-- Both assessor slots, so either supervisor on the route can run the test and
-- the two-assessor path can be exercised. supervisor_a2_id is nullable, hence
-- the separate insert rather than one unnested statement.
insert into assignments (trainee_id, supervisor_id, slot)
select t.id, r.supervisor_a1_id, 'a1'
from trainees t
join routes r on r.id = t.route_id
where t.registration_number like 'TEST-%'
  and r.supervisor_a1_id is not null
  and not exists (
    select 1 from assignments a
    where a.trainee_id = t.id and a.supervisor_id = r.supervisor_a1_id
  );

insert into assignments (trainee_id, supervisor_id, slot)
select t.id, r.supervisor_a2_id, 'a2'
from trainees t
join routes r on r.id = t.route_id
where t.registration_number like 'TEST-%'
  and r.supervisor_a2_id is not null
  and not exists (
    select 1 from assignments a
    where a.trainee_id = t.id and a.supervisor_id = r.supervisor_a2_id
  );
