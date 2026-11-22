// Where signed-out visitors land in production. Only accounts on the team list can get past sign-in.
export default async function SignInPage({ searchParams }: { searchParams: Promise<{ google?: string }> }) {
  const { google } = await searchParams;
  const why =
    google === "not_allowed" ? "That Google account isn’t on the team list. Ask a partner to add it."
      : google === "unverified" ? "That Google account’s email isn’t verified."
        : google === "denied" ? "Sign-in was cancelled."
          : google === "error" || google === "bad_state" ? "Sign-in didn’t complete. Try again." : null;
  return (
    <div className="elev-2 mx-auto mt-24 max-w-[380px] rounded-[16px] bg-canvas p-6 text-center">
      <h1 className="text-[18px] font-semibold tracking-[-0.2px]">All In Capital · Triage</h1>
      <p className="mt-1.5 text-[13px] text-ink-muted">Sign in with your team Google account to see the pipeline.</p>
      {why && <p role="alert" className="mt-3 rounded-[10px] bg-amber-bg px-3 py-2 text-[12px] text-amber">{why}</p>}
      <a href="/api/google/connect" className="press mt-4 inline-flex h-9 items-center rounded-full bg-primary px-4 text-[13px] font-medium text-on-primary hover:bg-primary-hover">
        Sign in with Google
      </a>
    </div>
  );
}
