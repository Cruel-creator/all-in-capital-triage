// Skeleton matching the pipeline table's final layout.
export default function Loading() {
  return (
    <div aria-busy aria-label="Loading the pipeline">
      <div className="mb-4 h-6 w-32 animate-pulse rounded bg-surface-2" />
      <div className="mb-3 h-9 w-full animate-pulse rounded-[10px] bg-surface-1" />
      <div className="elev-1 overflow-hidden rounded-[16px]">
        <div className="h-9 bg-surface-1" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex h-12 items-center gap-4 border-t border-hairline px-4">
            <div className="h-3 w-40 animate-pulse rounded bg-surface-2" />
            <div className="hidden h-3 w-24 animate-pulse rounded bg-surface-2 lg:block" />
            <div className="h-1.5 w-36 animate-pulse rounded bg-surface-2" />
            <div className="hidden h-4 w-20 animate-pulse rounded bg-surface-2 sm:block" />
          </div>
        ))}
      </div>
    </div>
  );
}
