import Link from 'next/link';

/**
 * The console's shared furniture. Server components with no state, so the
 * admin pages ship almost no JavaScript — only the three genuinely
 * interactive pieces (the confirm button, the inline forms) are client
 * components.
 *
 * Palette is the app's own (AGENTS.md: never invent a colour): deep teal
 * #0d4a43, mid teal #12665b, accent #a35c00 for focus rings only, and the
 * neutrals already used across the supervisor screens.
 */

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e1e9e6] pb-4">
      <div className="min-w-0">
        <h1 className="text-[22px] font-bold tracking-[-0.2px] text-[#14232e]">{title}</h1>
        {subtitle ? <p className="mt-1 max-w-2xl text-[13px] text-[#5b6b78]">{subtitle}</p> : null}
      </div>
      {action}
    </header>
  );
}

export function Card({
  title,
  description,
  children,
  tone = 'plain',
}: {
  title?: string;
  description?: string;
  children: React.ReactNode;
  tone?: 'plain' | 'warning';
}) {
  const border = tone === 'warning' ? 'border-[#e0c39a]' : 'border-[#e1e9e6]';
  return (
    <section className={`rounded-2xl border ${border} bg-white`}>
      {title ? (
        <div className="border-b border-[#eef2f1] px-4 py-3">
          <h2 className="text-[14px] font-bold text-[#14232e]">{title}</h2>
          {description ? (
            <p className="mt-1 text-[12.5px] leading-relaxed text-[#5b6b78]">{description}</p>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function StatTile({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: string | number;
  hint?: string;
  href?: string;
}) {
  const body = (
    <>
      <p className="text-[11.5px] font-bold uppercase tracking-[0.6px] text-[#5b6b78]">{label}</p>
      <p className="mt-1.5 text-[26px] font-bold leading-none text-[#0d4a43]">{value}</p>
      {hint ? <p className="mt-1.5 text-[12px] text-[#5b6b78]">{hint}</p> : null}
    </>
  );

  const shell = 'rounded-2xl border border-[#e1e9e6] bg-white p-4';
  return href ? (
    <Link
      href={href}
      className={`${shell} focus:outline-accent block transition-colors hover:border-[#c6d8d3] focus:outline focus:outline-[3px] focus:outline-offset-2`}
    >
      {body}
    </Link>
  ) : (
    <div className={shell}>{body}</div>
  );
}

export function Badge({
  children,
  bg = '#eef1f3',
  fg = '#4d5f6c',
}: {
  children: React.ReactNode;
  bg?: string;
  fg?: string;
}) {
  return (
    <span
      className="inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-bold"
      style={{ backgroundColor: bg, color: fg }}
    >
      {children}
    </span>
  );
}

/**
 * Every table on a phone is a horizontal scroll away from being unreadable;
 * the wrapper scrolls the table rather than the page (AGENTS.md's UI rules
 * and the artifact-style rule that the body must never scroll sideways).
 */
export function TableWrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-left text-[13px]">
        {children}
      </table>
    </div>
  );
}

export function Th({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={`border-b border-[#eef2f1] px-4 py-2.5 text-[11.5px] font-bold uppercase tracking-[0.5px] text-[#5b6b78] ${className}`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <td className={`border-b border-[#f2f5f4] px-4 py-2.5 align-top text-[#14232e] ${className}`}>
      {children}
    </td>
  );
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-8 text-center text-[13px] text-[#5b6b78]">
        {children}
      </td>
    </tr>
  );
}

/**
 * A note about something the console deliberately cannot do. Used where a
 * capability lives outside the app on purpose — account creation and
 * passwords need the service-role key, which never comes near this server
 * (AGENTS.md), so the console explains where the capability is instead of
 * pretending it is missing.
 */
export function OutOfScopeNote({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#dfe6ec] bg-[#f6f8f8] p-4">
      <p className="text-[13px] font-bold text-[#14232e]">{title}</p>
      <div className="mt-1.5 space-y-1.5 text-[12.5px] leading-relaxed text-[#4d5f6c]">
        {children}
      </div>
    </div>
  );
}

export function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-[#eceff0] px-1.5 py-0.5 font-mono text-[12px] text-[#14232e]">
      {children}
    </code>
  );
}
