import { NextResponse } from 'next/server';
import { adminAccess } from '@/lib/admin/access';
import {
  EXPORT_TABLES,
  exportFileStamp,
  manifestCsv,
  readme,
  toCsv,
  type ManifestEntry,
} from '@/lib/admin/data-export';
import { createClient } from '@/lib/supabase/server';
import { ZipBuilder } from '@/lib/reports/zip';

/**
 * The assessment data itself, as one ZIP of CSVs.
 *
 * The Supabase project is on the Free plan, which takes no automatic backups.
 * Until that changes, this download and the report backup beside it are the
 * College's only copies of anything — and this is the half that holds the
 * marks. See lib/admin/data-export.ts for what it is and is not.
 *
 * Read entirely through the signed-in administrator's own session. The
 * service-role key is not here and must never be (AGENTS.md): RLS is what
 * decides which rows land in the archive, exactly as on every console screen.
 * A super_admin sees everything, so their export holds everything.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** PostgREST caps a response; every table is paged rather than trusted to fit. */
const PAGE_SIZE = 1000;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const { data: profile } = await supabase
    .from('users')
    .select('name, role, active')
    .eq('id', user.id)
    .maybeSingle();

  /**
   * Super Administrator only — deliberately stricter than the report backup
   * beside it, which a Coordinator may take.
   *
   * Not because a coordinator could read something new here: `is_coordinator()`
   * already grants select on all of these tables, so RLS would hand them the
   * same rows. It is that this one action collects every trainee's name,
   * e-mail address and phone number, and every mark ever awarded, into a
   * single file on somebody's laptop. Oversight does not require that, and the
   * person answerable for the register is the one who should be making copies
   * of it.
   */
  if (!profile || adminAccess(profile) !== 'write') {
    return NextResponse.json(
      { error: 'Only a Super Administrator may export the assessment data.' },
      { status: 403 },
    );
  }

  const takenBy = (profile.name as string | null) ?? 'an administrator';
  const stamp = exportFileStamp(new Date());
  const zip = new ZipBuilder();
  const encoder = new TextEncoder();
  const now = new Date();

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const entries: ManifestEntry[] = [];
      const failures: string[] = [];

      for (const spec of EXPORT_TABLES) {
        const rows: Record<string, unknown>[] = [];
        let failure: string | null = null;

        for (let page = 0; ; page += 1) {
          const from = page * PAGE_SIZE;
          const { data, error } = await supabase
            .from(spec.table)
            .select('*')
            .order(spec.orderBy)
            .range(from, from + PAGE_SIZE - 1);

          if (error) {
            /**
             * One unreadable table must not abandon the other sixteen. A table
             * that does not exist yet is the ordinary case, not a fault:
             * `trainee_change_requests` and `voided_assessments` arrive with
             * migrations that may not be applied wherever this runs. Either
             * way the gap is named in the archive rather than left silent — a
             * backup you cannot tell is incomplete is worse than one you can.
             */
            failure = error.message;
            break;
          }
          if (!data) break;
          rows.push(...(data as Record<string, unknown>[]));
          if (data.length < PAGE_SIZE) break;
        }

        if (failure) {
          failures.push(`${spec.table}.csv — ${failure}`);
          continue;
        }

        const bytes = encoder.encode(toCsv(rows));
        controller.enqueue(zip.entry(`${spec.table}.csv`, bytes, now));
        entries.push({ table: spec.table, rows: rows.length, sha256: await sha256Hex(bytes) });
      }

      // Manifest and README last: both describe what actually went in, and
      // neither can be written until every table has been read.
      controller.enqueue(zip.entry('manifest.csv', encoder.encode(manifestCsv(entries)), now));
      controller.enqueue(
        zip.entry('README.txt', encoder.encode(readme(stamp, entries, takenBy)), now),
      );

      if (failures.length > 0) {
        controller.enqueue(
          zip.entry(
            'MISSING-TABLES.txt',
            encoder.encode(
              `${failures.length} table${failures.length === 1 ? '' : 's'} could not be read and ${
                failures.length === 1 ? 'is' : 'are'
              } NOT in this archive:\n\n${failures.join('\n')}\n\nA table that does not exist yet is expected — it arrives with a migration that has not been applied. Anything else is worth investigating before relying on this copy.\n`,
            ),
            now,
          ),
        );
      }

      controller.enqueue(zip.end());
      controller.close();
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="tathmini-data-${stamp}.zip"`,
      // Built as it is sent, so its length is not known up front.
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/** The same hash the reports carry, so both backups are checked the same way. */
async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as ArrayBuffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
