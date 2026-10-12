/** Native form logout buttons — work without client-side JS. */
export function LogoutButton() {
  return (
    <form action="/api/auth/logout-form" method="POST" className="inline">
      <button
        type="submit"
        className="px-3 py-1.5 text-sm rounded-lg border border-[var(--color-border)] hover:border-[var(--color-accent)]"
      >
        Log out
      </button>
    </form>
  );
}

export function LogoutEverywhereButton() {
  return (
    <form action="/api/auth/logout-form" method="POST" className="inline">
      <input type="hidden" name="scope" value="all" />
      <button
        type="submit"
        className="px-3 py-1.5 text-sm rounded-lg border border-[var(--color-loss)] text-[var(--color-loss)] hover:bg-[var(--color-loss)] hover:text-white"
      >
        Sign out everywhere
      </button>
    </form>
  );
}
