-- Links the synthetic dev/test Auth accounts (packages/db/src/data/
-- dev-accounts.ts) into users — same NOT EXISTS-guarded pattern as the
-- IPT/TP account-linking in 0007/0008. Auth-only creation
-- (create-accounts.ts) doesn't touch the users table itself; this is the
-- step that was missing until now — caught while verifying the Phase 1
-- auth flow. See MEMORY.md.

insert into users (id, role, name, email)
select au.id, v.role::app_role, v.name, v.email
from (values
  ('test.supervisor@tathmini.internal', 'supervisor', 'Test Supervisor')
) as v(email, role, name)
join auth.users au on au.email = v.email
where not exists (select 1 from users u where u.id = au.id);
