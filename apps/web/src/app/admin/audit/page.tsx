import Link from 'next/link';
import { auditActionText, formatTimestamp } from '@/lib/admin/format';
import { loadUsers } from '@/lib/admin/queries';
import { requireAdmin } from '@/lib/admin/session';
import { Badge, Card, EmptyRow, PageHeader, TableWrap, Td, Th } from '../ui';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 100;

const TABLE_FILTERS = [
  { value: '', label: 'Everything' },
  { value: 'trainees', label: 'Trainees' },
  { value: 'assignments', label: 'Assignments' },
  { value: 'routes', label: 'Routes' },
  { value: 'assessment_marks', label: 'Marks' },
  { value: 'results', label: 'Results' },
];

/**
 * The audit trail (ROADMAP.md Phase 3, "Audit log viewer").
 *
 * `audit_log` is append-only and hash-chained: each row carries the hash of
 * the one before it (chain_audit_log() in 0001_rls_and_functions.sql), so a
 * deleted or altered entry breaks the chain. No role holds a DELETE or UPDATE
 * grant on it, this console included — it can only ever be read here.
 */
export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ table?: string; page?: string }>;
}) {
  const { supabase } = await requireAdmin();
  const { table, page } = await searchParams;
  const pageNumber = Math.max(1, Number.parseInt(page ?? '1', 10) || 1);
  const from = (pageNumber - 1) * PAGE_SIZE;

  let query = supabase
    .from('audit_log')
    .select('id, actor_id, action, target_table, target_id, detail, created_at', {
      count: 'exact',
    })
    .order('created_at', { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  if (table && TABLE_FILTERS.some((f) => f.value === table)) {
    query = query.eq('target_table', table);
  }

  const [{ data: entries, count }, users] = await Promise.all([query, loadUsers(supabase)]);
  const userById = new Map(users.map((u) => [u.id, u]));
  const total = count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const href = (params: Record<string, string>) =>
    `/admin/audit?${new URLSearchParams(params).toString()}`;

  return (
    <>
      <PageHeader
        title="Audit trail"
        subtitle={`${total.toLocaleString('en-GB')} entries. Written by database triggers, hash-chained, and readable but never writable — including from here.`}
      />

      <div className="flex flex-wrap gap-2">
        {TABLE_FILTERS.map((filter) => {
          const active = (table ?? '') === filter.value;
          return (
            <Link
              key={filter.value || 'all'}
              href={filter.value ? href({ table: filter.value }) : '/admin/audit'}
              className={`focus:outline-accent inline-flex min-h-[40px] items-center rounded-full border px-3.5 text-[12.5px] font-bold focus:outline focus:outline-[3px] focus:outline-offset-2 ${
                active
                  ? 'border-[#0d4a43] bg-[#0d4a43] text-white'
                  : 'border-[#ccd7d4] bg-white text-[#14232e]'
              }`}
            >
              {filter.label}
            </Link>
          );
        })}
      </div>

      <Card>
        <TableWrap>
          <thead>
            <tr>
              <Th>When</Th>
              <Th>Who</Th>
              <Th>What</Th>
              <Th>Row</Th>
            </tr>
          </thead>
          <tbody>
            {(entries ?? []).length === 0 ? (
              <EmptyRow colSpan={4}>No entries.</EmptyRow>
            ) : (
              (entries ?? []).map((entry) => {
                const actor = entry.actor_id ? userById.get(entry.actor_id as string) : undefined;
                return (
                  <tr key={entry.id as string}>
                    <Td className="whitespace-nowrap">
                      {formatTimestamp(entry.created_at as string)}
                    </Td>
                    <Td>{actor ? actor.name : <Badge>system or migration</Badge>}</Td>
                    <Td>
                      {auditActionText(entry.action as string, entry.target_table as string)}
                      {entry.detail ? (
                        <p className="mt-0.5 text-[12px] text-[#5b6b78]">{entry.detail}</p>
                      ) : null}
                    </Td>
                    <Td>
                      {entry.target_table === 'trainees' && entry.target_id ? (
                        <Link
                          href={`/admin/trainees/${entry.target_id}`}
                          className="text-teal-mid focus:outline-accent font-mono text-[11.5px] underline focus:outline focus:outline-[3px] focus:outline-offset-2"
                        >
                          {String(entry.target_id).slice(0, 8)}
                        </Link>
                      ) : (
                        <span className="font-mono text-[11.5px] text-[#5b6b78]">
                          {entry.target_id ? String(entry.target_id).slice(0, 8) : '—'}
                        </span>
                      )}
                    </Td>
                  </tr>
                );
              })
            )}
          </tbody>
        </TableWrap>
      </Card>

      {pageCount > 1 ? (
        <nav aria-label="Pages" className="flex items-center gap-3">
          {pageNumber > 1 ? (
            <Link
              href={href({ ...(table ? { table } : {}), page: String(pageNumber - 1) })}
              className="focus:outline-accent min-h-[44px] rounded-xl border border-[#ccd7d4] bg-white px-3.5 py-2.5 text-[13px] font-bold text-[#14232e] focus:outline focus:outline-[3px] focus:outline-offset-2"
            >
              ← Newer
            </Link>
          ) : null}
          <p className="text-[12.5px] text-[#5b6b78]">
            Page {pageNumber} of {pageCount}
          </p>
          {pageNumber < pageCount ? (
            <Link
              href={href({ ...(table ? { table } : {}), page: String(pageNumber + 1) })}
              className="focus:outline-accent min-h-[44px] rounded-xl border border-[#ccd7d4] bg-white px-3.5 py-2.5 text-[13px] font-bold text-[#14232e] focus:outline focus:outline-[3px] focus:outline-offset-2"
            >
              Older →
            </Link>
          ) : null}
        </nav>
      ) : null}

      <p className="text-[12.5px] leading-relaxed text-[#5f6f7c]">
        Entries with no name against them were made before anyone signed in — by a migration or a
        script running as the database owner. That is expected for the roster imports.
      </p>
    </>
  );
}
