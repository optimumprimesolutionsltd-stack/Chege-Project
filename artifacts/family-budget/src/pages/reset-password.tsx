import { useState } from 'react';
import { useLocation } from 'wouter';
import { KeyRound } from 'lucide-react';
import { useAuth, type AuthUser } from '@workspace/replit-auth-web';
import { BrandLogo } from '@/components/brand-logo';

/** Wrapper shared with the "link is broken" states below, so a person who
 *  arrives here from an email always sees the same Jamvi card whether their
 *  link worked or not. */
function ResetCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-[#00132f] via-brand-navy to-brand-blue px-4 py-10 sm:px-6">
      <div className="pointer-events-none absolute -left-32 -top-32 h-80 w-80 rounded-full bg-brand-gold/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-20 h-[28rem] w-[28rem] rounded-full bg-brand-teal/15 blur-3xl" />
      <main className="relative mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-md items-center">
        <div className="w-full rounded-[2rem] border border-brand-teal/20 bg-[#06183c]/95 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
          <div className="mb-7 flex items-start justify-between gap-4">
            <div className="flex h-11 w-36 items-center justify-center rounded-2xl bg-brand-surface px-2">
              <BrandLogo className="h-9 w-full" alt="Jamvi — personal and shared budgeting" />
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-teal/15 text-brand-teal">
              <KeyRound className="h-5 w-5" />
            </div>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}

const inputClass =
  'h-12 w-full rounded-xl border border-blue-100/20 bg-white/[0.08] px-4 text-white placeholder:text-blue-100/50 focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/30';

export default function ResetPasswordPage() {
  const { adoptSession } = useAuth();
  const [, navigate] = useLocation();
  const token = new URLSearchParams(window.location.search).get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // A link with no token is not worth a round trip to the server, and the
  // reason is one the person can act on.
  if (!token) {
    return (
      <ResetCard>
        <h1 className="font-display text-2xl font-bold text-white">That reset link is incomplete</h1>
        <p className="mt-3 text-sm leading-6 text-blue-100/80">
          Some email apps cut long links in half. Open the link from the email again, or ask for a new one from the
          sign-in page.
        </p>
        <a
          href="/app/"
          className="mt-6 flex w-full items-center justify-center rounded-2xl bg-brand-teal py-4 text-base font-bold text-brand-navy"
        >
          Back to sign in
        </a>
      </ResetCard>
    );
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password !== confirmation) {
      setError('The two passwords do not match.');
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const result = (await response.json()) as { error?: string; user?: AuthUser };
      if (!response.ok) throw new Error(result.error ?? 'Could not set your new password. Please try again.');
      if (!result.user) throw new Error('Could not set your new password. Please try again.');
      // The server signs them in as part of the reset, so there is no reason
      // to make them type the password they just chose - or to reload the app
      // to discover a session we were just handed.
      adoptSession(result.user);
      navigate('/');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not set your new password. Please try again.');
      setIsSaving(false);
    }
  };

  return (
    <ResetCard>
      <h1 className="font-display text-3xl font-bold leading-tight text-white">Choose a new password</h1>
      <p className="mt-3 text-sm leading-6 text-blue-100/80">
        Pick something you have not used elsewhere. You will be signed in as soon as it is saved.
      </p>

      <form onSubmit={submit} className="mt-7 space-y-3">
        <input
          required
          minLength={8}
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="New password (8+ characters)"
          autoComplete="new-password"
          data-testid="input-new-password"
          className={inputClass}
        />
        <input
          required
          minLength={8}
          type="password"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          placeholder="Repeat the new password"
          autoComplete="new-password"
          data-testid="input-confirm-password"
          className={inputClass}
        />
        {error ? (
          <p role="alert" className="rounded-xl bg-red-400/15 px-3 py-2 text-sm text-red-100">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={isSaving}
          data-testid="button-save-password"
          className="flex h-14 w-full items-center justify-center rounded-2xl bg-brand-teal text-base font-bold text-brand-navy shadow-lg shadow-brand-teal/20 transition-all hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-80"
        >
          {isSaving ? 'Saving your new password…' : 'Save and sign in'}
        </button>
      </form>

      <a href="/app/" className="mt-4 block text-center text-sm font-semibold text-brand-teal hover:underline">
        Back to sign in
      </a>
    </ResetCard>
  );
}
