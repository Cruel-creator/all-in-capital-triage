// Skeleton matching the detail page: header band, criteria column, evidence column.
const Bar = ({ w, h = "h-3" }: { w: string; h?: string }) => <div className={`${h} animate-pulse rounded bg-surface-2`} style={{ width: w }} />;

export default function Loading() {
  return (
    <div aria-busy aria-label="Loading the application" className="space-y-5">
      <div className="elev-1 grid gap-5 rounded-[16px] p-5 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-2"><Bar w="30%" h="h-5" /><Bar w="70%" /><Bar w="50%" /></div>
        <div className="space-y-3"><Bar w="25%" h="h-7" /><Bar w="100%" h="h-2" /><Bar w="60%" /></div>
      </div>
      <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="elev-1 space-y-2 rounded-[16px] p-4"><Bar w="40%" /><Bar w="95%" /><Bar w="85%" /></div>
          ))}
        </div>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="elev-1 space-y-2 rounded-[16px] p-4"><Bar w="35%" /><Bar w="90%" /><Bar w="70%" /></div>
          ))}
        </div>
      </div>
    </div>
  );
}
