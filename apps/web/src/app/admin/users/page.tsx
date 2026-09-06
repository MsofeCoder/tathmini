import { roleLabel, usernameFromEmail } from '@/lib/admin/access';
import { loadAssignments, loadRoutes, loadUsers } from '@/lib/admin/queries';
import { requireAdmin } from '@/lib/admin/session';
import { Badge, Card, Code, EmptyRow, OutOfScopeNote, PageHeader, TableWrap, Td, Th } from '../ui';
import { SearchBox } from '../search-box';
import { ActiveToggleForm, ContactEmailForm } from './account-forms';

export const dynamic = 'force-dynamic';

/**
 * Accounts (ROADMAP.md Phase 3, "Super Admin: account creation, password
 * set, deactivate").
 *
 * Two of those three happen here. Account creation and password setting do
 * not, and cannot: both go through the Supabase Auth Admin API, which needs
 * the service-role key. That key bypasses every row-level policy in the
 * database, so it stays out of the deployed application entirely and lives
 * only in the local scripts — see the note at the foot of this page. Putting
 * it in Vercel's environment to save a terminal window would mean any flaw
 * in this web app is a flaw with unrestricted database access.
 */
export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { supabase, userId, canWrite } = await requireAdmin();
  const { q } = await searchParams;
  const query = (q ?? '').trim().toLowerCase();

  const [users, routes, assignments] = await Promise.all([
    loadUsers(supabase),
    loadRoutes(supabase),
    loadAssignments(supabase),
  ]);

  const routesBySupervisor = new Map<string, string[]>();
  for (const route of routes) {
    for (const id of [route.supervisor_a1_id, route.supervisor_a2_id]) {
      if (!id) continue;
      const list = routesBySupervisor.get(id) ?? [];
      list.push(route.code);
      routesBySupervisor.set(id, list);
    }
  }

  const traineeCountBySupervisor = new Map<string, number>();
  for (const assignment of assignments) {
    traineeCountBySupervisor.set(
      assignment.supervisor_id,
      (traineeCountBySupervisor.get(assignment.supervisor_id) ?? 0) + 1,
    );
  }

  const visible = users.filter((user) => {
    if (query === '') return true;
    return (
      user.name.toLowerCase().includes(query) ||
      user.email.toLowerCase().includes(query) ||
      (user.contact_email ?? '').toLowerCase().includes(query) ||
      (routesBySupervisor.get(user.id) ?? []).some((code) => code.toLowerCase().includes(query))
    );
  });

  const missingAddress = users.filter((u) => u.role === 'supervisor' && !u.contact_email).length;

  return (
    <>
      <PageHeader
        title="Accounts"
        subtitle={`${users.length} accounts. A reachable address is what puts an assessor on the copy list for their own trainees' reports — the sign-in username is not a mailbox.`}
      />

      <div className="flex flex-wrap items-center gap-3">
        <SearchBox action="/admin/users" placeholder="Search name, username or route" value={q} />
        {missingAddress > 0 ? (
          <Badge bg="#fff0d6" fg="#6b4400">
            {missingAddress} supervisors with no e-mail address
          </Badge>
        ) : null}
        {canWrite ? null : (
          <Badge bg="#eef1f3" fg="#4d5f6c">
            Read-only view
          </Badge>
        )}
      </div>

      <Card>
        <TableWrap>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Role</Th>
              <Th>Route</Th>
              <Th>Reachable e-mail</Th>
              <Th>Status</Th>
              <Th>Action</Th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <EmptyRow colSpan={6}>No account matches “{q}”.</EmptyRow>
            ) : (
              visible.map((user) => {
                const codes = routesBySupervisor.get(user.id) ?? [];
                const traineeCount = traineeCountBySupervisor.get(user.id) ?? 0;
                return (
                  <tr key={user.id}>
                    <Td>
                      <p className="font-bold">{user.name}</p>
                      <p className="mt-0.5 text-[12px] text-[#5b6b78]">
                        {usernameFromEmail(user.email)}
                      </p>
                    </Td>
                    <Td className="whitespace-nowrap">{roleLabel(user.role)}</Td>
                    <Td>
                      {codes.length > 0 ? (
                        <>
                          <p>{codes.join(', ')}</p>
                          <p className="mt-0.5 text-[12px] text-[#5b6b78]">
                            {traineeCount} assessor {traineeCount === 1 ? 'slot' : 'slots'}
                          </p>
                        </>
                      ) : (
                        <span className="text-[#5b6b78]">—</span>
                      )}
                    </Td>
                    <Td>
                      <ContactEmailForm
                        userId={user.id}
                        current={user.contact_email}
                        disabled={!canWrite}
                      />
                    </Td>
                    <Td>
                      <div className="flex flex-col items-start gap-1">
                        {user.active ? (
                          <Badge bg="#e2f0ea" fg="#1c6650">
                            Active
                          </Badge>
                        ) : (
                          <Badge bg="#fbe9e4" fg="#8a3a2a">
                            Deactivated
                          </Badge>
                        )}
                        {user.must_change_password ? (
                          <Badge bg="#e6eefc" fg="#243f7a">
                            Must set password
                          </Badge>
                        ) : null}
                      </div>
                    </Td>
                    <Td>
                      <ActiveToggleForm
                        userId={user.id}
                        name={user.name}
                        active={user.active}
                        disabled={!canWrite}
                        isSelf={user.id === userId}
                      />
                    </Td>
                  </tr>
                );
              })
            )}
          </tbody>
        </TableWrap>
      </Card>

      <OutOfScopeNote title="Creating an account, or changing a password">
        <p>
          Both need the Supabase service-role key, which bypasses every database policy. It is
          deliberately absent from this application, so these stay terminal commands run by an
          administrator on their own machine:
        </p>
        <p>
          <Code>pnpm create:accounts</Code> — creates the sign-in identities listed in{' '}
          <Code>packages/db/src/data/</Code>. It skips an account that already exists, so it can
          never overwrite a password.
        </p>
        <p>
          <Code>pnpm assign:passwords</Code> — applies the College&rsquo;s own chosen passwords in
          bulk from a spreadsheet. These are permanent: the holder is not forced to change them.
        </p>
        <p>
          <Code>pnpm reset:passwords</Code> — rotates an existing account to a one-time password and
          re-arms the forced change at next sign-in. Use this one if a password has been seen by
          anyone it should not have been.
        </p>
        <p>
          Deactivating an account here is immediate and is checked at sign-in, but it does not
          revoke a session already open on a device. If an account is compromised, reset the
          password as well.
        </p>
      </OutOfScopeNote>
    </>
  );
}
