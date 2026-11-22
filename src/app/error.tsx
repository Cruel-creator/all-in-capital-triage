"use client";
// Errors say what failed and offer a retry.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="elev-1 mx-auto mt-10 max-w-lg rounded-[16px] p-6">
      <h1 className="text-[16px]">Couldn’t load this page</h1>
      <p className="mt-1 text-[13px] text-ink-muted">
        {/supabase|fetch|ENOTFOUND|network/i.test(error.message)
          ? "The database didn’t respond. Check your connection, then try again."
          : `Something failed while loading: ${error.message}`}
      </p>
      <button type="button" onClick={reset} className="press mt-4 h-9 rounded-full bg-primary px-4 text-[13px] font-medium text-on-primary hover:bg-primary-hover">
        Try again
      </button>
    </div>
  );
}
