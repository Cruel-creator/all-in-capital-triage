import Link from "next/link";

export default function NotFound() {
  return (
    <div className="elev-1 mx-auto mt-10 max-w-lg rounded-[16px] p-6">
      <h1 className="text-[16px]">That application isn’t here</h1>
      <p className="mt-1 text-[13px] text-ink-muted">It may have been removed, or the link is incomplete.</p>
      <Link href="/" className="press mt-4 inline-flex h-9 items-center rounded-full bg-primary px-4 text-[13px] font-medium text-on-primary hover:bg-primary-hover">
        Back to the pipeline
      </Link>
    </div>
  );
}
