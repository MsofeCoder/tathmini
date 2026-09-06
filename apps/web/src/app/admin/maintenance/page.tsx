import { formatTimestamp } from '@/lib/admin/format';
import { loadRoutes, loadTrainees } from '@/lib/admin/queries';
import { requireAdmin } from '@/lib/admin/session';
import { isTestTrainee } from '@/lib/admin/test-data';
import { Badge, Card, Code, PageHeader, StatTile } from '../ui';
import { PurgeForm } from './purge-form';

export const dynamic = 'force-dynamic';

/**
 * The two housekeeping jobs an administrator does on their own, on a morning
 * when nobody else should be in the system: take a copy of the reports, and
 * clear the test rows out of the live register.
 */
export default async function AdminMaintenancePage() {
  const { supabase, canWrite } = await requireAdmin();

  const [trainees, routes, reportsRes, marksRes] = await Promise.all([
    loadTrainees(supabase),
    loadRoutes(supabase),
    supabase.from('reports').select('trainee_id, generated_at').order('generated_at', {
      ascending: false,
    }),
    supabase.from('assessment_marks').select('trainee_id'),
  ]);

  const routeCodeById = new Map(routes.map((r) => [r.id, r.code]));
  const testTrainees = trainees.filter((t) =>
    isTestTrainee({
      registrationNumber: t.registration_number,
      routeCode: routeCodeById.get(t.route_id),
    }),
  );
  const testIds = new Set(testTrainees.map((t) => t.id));

  const reports = reportsRes.data ?? [];
  const marks = marksRes.data ?? [];
  const testMarks = marks.filter((m) => testIds.has(m.trainee_id as string)).length;
  const testReports = reports.filter((r) => testIds.has(r.trainee_id as string)).length;

  const startOfTodayEat = eatDayStart(new Date());
  const startOfWeek = new Date(startOfTodayEat.getTime() - 6 * 24 * 60 * 60 * 1000);
  const today = reports.filter((r) => new Date(r.generated_at as string) >= startOfTodayEat).length;
  const week = reports.filter((r) => new Date(r.generated_at as string) >= startOfWeek).length;
  const latest = reports[0]?.generated_at as string | undefined;

  return (
    <>
      <PageHeader
        title="Backup and maintenance"
        subtitle="Take the College's own copy of the reports, and clear test rows out of the live register."
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Reports on file" value={reports.length} hint="all time" />
        <StatTile label="Generated today" value={today} hint="East Africa Time" />
        <StatTile label="Last seven days" value={week} />
        <StatTile
          label="Most recent"
          value={latest ? formatTimestamp(latest).split(',')[0]! : '—'}
          hint={latest ? formatTimestamp(latest).split(', ')[1] : 'none yet'}
        />
      </div>

      <Card
        title="Download the report backup"
        description="Every generated report as a ZIP, filed by route, with a manifest listing each file, its trainee and the SHA-256 hash recorded when it was generated."
      >
        <div className="flex flex-wrap gap-2 p-4">
          <DownloadButton
            href="/api/admin/report-backup?scope=today"
            label="Today"
            count={today}
            primary
          />
          <DownloadButton
            href="/api/admin/report-backup?scope=week"
            label="Last 7 days"
            count={week}
          />
          <DownloadButton
            href="/api/admin/report-backup?scope=all"
            label="Everything"
            count={reports.length}
          />
        </div>

        <div className="space-y-2 border-t border-[#eef2f1] px-4 py-3 text-[12.5px] leading-relaxed text-[#4d5f6c]">
          <p>
            The archive is built as it downloads, so a large one starts immediately and finishes
            when the last file is in — do not close the tab while it runs.
          </p>
          <p>
            <strong>This is not a database backup.</strong> Marks, results and the audit trail are
            not in it: only the finished PDFs. A nightly encrypted dump of the database itself is
            still to be built, and until it exists this archive is the only copy of the reports that
            lives outside Supabase. Keep it somewhere other than the computer that downloaded it.
          </p>
          <p>
            Each file&rsquo;s hash can be checked years later against <Code>manifest.csv</Code> —{' '}
            <Code>certutil -hashfile &lt;file&gt; SHA256</Code> on Windows.
          </p>
        </div>
      </Card>

      <Card
        title="Remove test data from the register"
        tone={testTrainees.length > 0 ? 'warning' : 'plain'}
        description="Test rows sit on real routes, so supervisors see fake trainees in their own lists and their counters read high."
      >
        {testTrainees.length > 0 ? (
          <div className="px-4 pt-4">
            <div className="flex flex-wrap gap-2">
              <Badge bg="#fbe9e4" fg="#8a3a2a">
                {testTrainees.length} test trainees
              </Badge>
              <Badge bg="#fbe9e4" fg="#8a3a2a">
                {testMarks} marks
              </Badge>
              <Badge bg="#fbe9e4" fg="#8a3a2a">
                {testReports} reports
              </Badge>
            </div>
            <p className="mt-3 max-w-3xl text-[12.5px] leading-relaxed text-[#4d5f6c]">
              Removing them deletes those marks and reports with them, PDFs included, and cannot be
              undone. Take the backup above first if any of those reports matter. Real trainees are
              not at risk: the database function behind this button can only ever match the
              test-data pattern — a <Code>TEST-TP-</Code> or <Code>TEST-IPT-</Code> registration
              number, or membership of the route coded <Code>TEST ROUTE</Code>.
            </p>
          </div>
        ) : null}

        <PurgeForm
          traineeCount={testTrainees.length}
          markCount={testMarks}
          reportCount={testReports}
          disabled={!canWrite}
        />
      </Card>
    </>
  );
}

/**
 * A plain link, not a form: the response is a file, and a Server Action cannot
 * hand the browser one. `download` is advisory — the route sets
 * Content-Disposition, which is what actually names the file.
 */
function DownloadButton({
  href,
  label,
  count,
  primary,
}: {
  href: string;
  label: string;
  count: number;
  primary?: boolean;
}) {
  const disabled = count === 0;
  const base =
    'focus:outline-accent inline-flex min-h-[44px] items-center gap-2 rounded-xl border px-4 text-[13px] font-bold focus:outline focus:outline-[3px] focus:outline-offset-2';

  if (disabled) {
    return (
      <span className={`${base} cursor-not-allowed border-[#e1e9e6] bg-[#f6f8f8] text-[#98a7a2]`}>
        {label} · nothing yet
      </span>
    );
  }

  return (
    <a
      href={href}
      download
      className={`${base} ${
        primary
          ? 'border-[#0d4a43] bg-[#0d4a43] text-white'
          : 'border-[#ccd7d4] bg-white text-[#14232e]'
      }`}
    >
      {label}
      <span className={primary ? 'text-[#bfe0d8]' : 'text-[#5b6b78]'}>
        {count} {count === 1 ? 'file' : 'files'}
      </span>
    </a>
  );
}

/** Midnight in Morogoro, expressed as the instant to compare timestamps against. */
function eatDayStart(now: Date): Date {
  const shifted = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - 3 * 60 * 60 * 1000);
}
