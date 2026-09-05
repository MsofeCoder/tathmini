-- Two more IPT trainees on TEST ROUTE, with realistic particulars so the
-- screens and the printed VETA report can be judged as they will actually
-- look. 0011's originals carry placeholder values ("Test Trade", "Test
-- Company") that make the IPT form impossible to review honestly — a report
-- proofread against those tells you nothing about the real one.
--
-- Still unmistakably test data, and that matters more than the realism:
--   * they live on TEST ROUTE, which is what 0013 deletes by, so they are
--     removed with everything else when the test route goes;
--   * their registration numbers are prefixed TEST-IPT-, so a row that ever
--     escapes onto a real screen announces itself;
--   * the phone numbers are in the 0700-000-0xx block already used by 0011's
--     synthetic trainees, so no real person is ever dialled.
--
-- IPT trainees carry a phone and NO e-mail. That is not a stylistic choice:
-- migration 0003's track/contact constraint enforces it, because the real IPT
-- register records a phone per trainee and no address, while the TP register
-- does the opposite (CONTEXT.md's "Trainee accounts?" decision). Giving these
-- an e-mail would fail the check outright.
--
-- NOT EXISTS-guarded on name within the route, like every seed before it, so
-- re-running adds nothing.

with test_trainee_seed as (
  select * from (values
    (
      'NEEMA JOSEPH MBWANA', 'TEST-IPT-0001', 'NTA Level 5',
      'Electrical Installation', 'Kilimanjaro Engineering Works',
      'Moshi Municipal', 'Kilimanjaro', '0700000006'
    ),
    (
      'BARAKA SAMSON MREMA', 'TEST-IPT-0002', 'NTA Level 5',
      'Motor Vehicle Mechanics', 'Nyanza Auto Garage Ltd',
      'Ilemela', 'Mwanza', '0700000007'
    )
  ) as v(name, registration_number, course, occupation, institution, district, region, phone)
)
insert into trainees (
  name, registration_number, course, occupation, institution,
  district, region, track, email, phone, route_id
)
select
  ts.name, ts.registration_number, ts.course, ts.occupation, ts.institution,
  ts.district, ts.region, 'IPT'::track_type, null, ts.phone, r.id
from test_trainee_seed ts
join routes r on r.code = 'TEST ROUTE'
where not exists (
  select 1 from trainees t where t.route_id = r.id and t.name = ts.name
);

-- Without an assignment the trainee is invisible: is_assigned_to_trainee()
-- gates every read, so an unassigned test trainee would simply not appear on
-- the route list, which looks like a bug rather than missing seed data.
insert into assignments (trainee_id, supervisor_id, slot)
select t.id, u.id, 'a1'
from trainees t
join routes r on r.id = t.route_id and r.code = 'TEST ROUTE'
join users u on u.email = 'test.supervisor@tathmini.internal'
where not exists (
  select 1 from assignments a where a.trainee_id = t.id and a.supervisor_id = u.id
);
