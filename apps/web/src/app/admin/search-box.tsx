/**
 * A plain GET form. No client JavaScript, no debounce, no router push: the
 * query lives in the URL, which means a filtered list can be bookmarked,
 * reloaded and linked to from the overview page's health checks.
 */
export function SearchBox({
  action,
  placeholder,
  value,
  hidden,
}: {
  action: string;
  placeholder: string;
  value?: string;
  /** Other query parameters to preserve when searching. */
  hidden?: Record<string, string | undefined>;
}) {
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      {Object.entries(hidden ?? {}).map(([name, val]) =>
        val ? <input key={name} type="hidden" name={name} value={val} /> : null,
      )}
      <label className="sr-only" htmlFor={`search-${action}`}>
        {placeholder}
      </label>
      <input
        id={`search-${action}`}
        name="q"
        type="search"
        defaultValue={value ?? ''}
        placeholder={placeholder}
        className="focus:outline-accent min-h-[44px] w-full min-w-[220px] max-w-[360px] rounded-xl border border-[#ccd7d4] bg-white px-3.5 text-[13.5px] text-[#14232e] focus:outline focus:outline-[3px] focus:outline-offset-1"
      />
      <button
        type="submit"
        className="focus:outline-accent min-h-[44px] rounded-xl border border-[#0d4a43] bg-[#0d4a43] px-4 text-[13px] font-bold text-white focus:outline focus:outline-[3px] focus:outline-offset-2"
      >
        Search
      </button>
    </form>
  );
}
