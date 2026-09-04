-- Synthetic test data for verifying the route-list screen (packages/db
-- has no real supervisor password to test with) — see MEMORY.md.
-- Obviously fake: route code 'TEST ROUTE', trainee names 'TEST TRAINEE
-- 1'..'5', no real person or trainee. Easy to find and remove later:
--   delete from trainees where route_id = (select id from routes where code = 'TEST ROUTE');
--   delete from routes where code = 'TEST ROUTE';
-- (assignments cascade-delete with their trainee, per schema.ts.)
--
-- One assessor slot only (routes.supervisor_a2_id is nullable) — no
-- second fake person needed. 3 TP + 2 IPT trainees to exercise both
-- track chips. Guarded with NOT EXISTS, same pattern as every migration
-- so far.

insert into routes (code, supervisor_a1_id)
select 'TEST ROUTE', u.id
from users u
where u.email = 'test.supervisor@tathmini.internal'
  and not exists (select 1 from routes r where r.code = 'TEST ROUTE');

with test_trainee_seed as (
  select * from (values
    ('TEST TRAINEE 1', 'TEST-0001', 'CAVT', 'Test Occupation', 'Test VTC', 'TP', 'test.trainee1@example.test', null),
    ('TEST TRAINEE 2', 'TEST-0002', 'CAVT', 'Test Occupation', 'Test VTC', 'TP', 'test.trainee2@example.test', null),
    ('TEST TRAINEE 3', 'TEST-0003', 'CAVT', 'Test Occupation', 'Test VTC', 'TP', 'test.trainee3@example.test', null),
    ('TEST TRAINEE 4', null, 'Test Trade', 'Test Trade', 'Test Company', 'IPT', null, '0700000004'),
    ('TEST TRAINEE 5', null, 'Test Trade', 'Test Trade', 'Test Company', 'IPT', null, '0700000005')
  ) as v(name, registration_number, course, occupation, institution, track, email, phone)
)
insert into trainees (name, registration_number, course, occupation, institution, track, email, phone, route_id)
select ts.name, ts.registration_number, ts.course, ts.occupation, ts.institution, ts.track::track_type, ts.email, ts.phone, r.id
from test_trainee_seed ts
join routes r on r.code = 'TEST ROUTE'
where not exists (
  select 1 from trainees t where t.route_id = r.id and t.name = ts.name
);

insert into assignments (trainee_id, supervisor_id, slot)
select t.id, u.id, 'a1'
from trainees t
join routes r on r.id = t.route_id and r.code = 'TEST ROUTE'
join users u on u.email = 'test.supervisor@tathmini.internal'
where not exists (
  select 1 from assignments a where a.trainee_id = t.id and a.supervisor_id = u.id
);
