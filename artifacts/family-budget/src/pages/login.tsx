import { useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth, type AuthUser } from '@workspace/replit-auth-web';
import { ArrowUpRight, ShieldCheck, Sparkles, TrendingUp, Users, WalletCards } from 'lucide-react';
import { BrandLogo } from '@/components/brand-logo';

function FeatureRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.055] px-4 py-3.5 backdrop-blur-sm">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-gold/15 text-brand-gold">
        {icon}
      </div>
      <span className="text-sm font-medium text-white/85">{text}</span>
    </div>
  );
}

export default function LoginPage() {
  const { login, adoptSession } = useAuth();
  const [, navigate] = useLocation();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [credentialMode, setCredentialMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [credentialError, setCredentialError] = useState<string | null>(null);
  const [credentialNotice, setCredentialNotice] = useState<string | null>(null);

  const switchMode = (mode: 'login' | 'register' | 'forgot') => {
    setCredentialMode(mode);
    setCredentialError(null);
    setCredentialNotice(null);
  };

  const requestPasswordReset = async () => {
    setCredentialError(null);
    setIsSigningIn(true);
    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const result = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(result.error ?? 'Could not send the reset link. Please try again.');
      // Deliberately the same answer whether or not the address has an
      // account, matching the server. Confirming an email exists here would
      // undo the reason the endpoint refuses to.
      setCredentialNotice(result.message ?? 'If that email has a Jamvi account, a reset link is on its way.');
      setPassword('');
    } catch (error) {
      setCredentialError(error instanceof Error ? error.message : 'Could not send the reset link. Please try again.');
    } finally {
      setIsSigningIn(false);
    }
  };

  const submitCredentials = async (event: React.FormEvent) => {
    event.preventDefault();
    if (credentialMode === 'forgot') {
      await requestPasswordReset();
      return;
    }
    setCredentialError(null);
    setCredentialNotice(null);
    setIsSigningIn(true);
    try {
      const response = await fetch(credentialMode === 'register' ? '/api/auth/register' : '/api/auth/password-login', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentialMode === 'register' ? { name, email, password } : { email, password }),
      });
      const result = await response.json() as { error?: string; user?: AuthUser };
      if (!response.ok) throw new Error(result.error ?? 'Could not sign in. Please try again.');
      if (!result.user) throw new Error('Could not sign in. Please try again.');
      // The session exists and the server has already told us who it belongs
      // to. Reloading here would tear down the app and parse the whole bundle
      // again to rediscover that.
      adoptSession(result.user);
      navigate('/');
    } catch (error) {
      setCredentialError(error instanceof Error ? error.message : 'Could not sign in. Please try again.');
      setIsSigningIn(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-[#00132f] via-brand-navy to-brand-blue px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
      <div className="pointer-events-none absolute -left-32 -top-32 h-80 w-80 rounded-full bg-brand-gold/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-20 h-[28rem] w-[28rem] rounded-full bg-brand-teal/15 blur-3xl" />

      <div className="relative mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-6xl items-center justify-center gap-12 lg:min-h-[calc(100vh-4rem)] lg:justify-between">
        <section className="hidden max-w-xl flex-1 lg:block">
          <div className="mb-8 flex flex-col items-start gap-2">
            <div className="flex h-12 w-44 items-center justify-center rounded-2xl bg-brand-surface px-3 shadow-lg">
              <BrandLogo className="h-10 w-full" alt="Jamvi — personal and shared budgeting" />
            </div>
            <p className="pl-1 text-xs font-medium text-blue-100/70">Personal & shared money, together</p>
          </div>

          <p className="mb-5 text-sm font-semibold uppercase tracking-[0.2em] text-brand-gold">A calmer way to budget</p>
          <h1 className="max-w-lg font-display text-5xl font-bold leading-[1.05] tracking-tight text-white xl:text-6xl">
            Make every shilling count — your way.
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-8 text-blue-100/80">
            One clear place for your personal budget and the money you choose to share with others.
          </p>

          <div className="mt-9 space-y-3">
            <FeatureRow icon={<WalletCards className="h-5 w-5" />} text="Understand your personal spending" />
            <FeatureRow icon={<Users className="h-5 w-5" />} text="Share budgets with the people you choose" />
            <FeatureRow icon={<ShieldCheck className="h-5 w-5" />} text="Keep personal and shared money separate" />
          </div>
        </section>

        <main className="w-full max-w-md">
          <div className="rounded-[2rem] border border-brand-teal/20 bg-[#06183c]/95 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
            <div className="mb-8 flex items-start justify-between gap-4">
              <div className="flex flex-col items-start gap-2 lg:hidden">
                <div className="flex h-11 w-36 items-center justify-center rounded-2xl bg-brand-surface px-2">
                  <BrandLogo className="h-9 w-full" alt="Jamvi — personal and shared budgeting" />
                </div>
                <p className="pl-1 text-xs font-medium text-blue-100/70">Personal & shared money, together</p>
              </div>
              <div className="ml-auto flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-teal/15 text-brand-teal">
                <Sparkles className="h-5 w-5" />
              </div>
            </div>

            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-gold">
              {credentialMode === 'forgot' ? 'Password help' : 'Welcome back'}
            </p>
            <h2 className="mt-3 font-display text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl">
              {credentialMode === 'forgot' ? 'Get back into Jamvi.' : 'Your money, in focus.'}
            </h2>
            <p className="mt-3 text-sm leading-6 text-blue-100/80">
              {credentialMode === 'forgot'
                ? 'Enter the email you sign in with and we will send you a link to set a new password.'
                : 'Sign in to pick up where your money journey left off.'}
            </p>

            <div className="my-7 rounded-2xl border border-blue-100/15 bg-white/[0.055] p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-brand-teal">Your money view</p>
                  <p className="mt-1 font-display text-lg font-bold text-white">Clearer next steps</p>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-teal/15 text-brand-teal">
                  <ArrowUpRight className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-4 flex h-10 items-end gap-1.5" aria-hidden="true">
                {[28, 40, 34, 52, 46, 66, 60, 78, 72, 88].map((height, index) => (
                  <div key={index} className="flex-1 rounded-t-md bg-brand-teal/80" style={{ height: `${height}%`, opacity: 0.45 + index * 0.05 }} />
                ))}
              </div>
            </div>

            <form onSubmit={submitCredentials} className="space-y-3">
              {credentialMode === 'register' ? <input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" autoComplete="name" className="h-12 w-full rounded-xl border border-blue-100/20 bg-white/[0.08] px-4 text-white placeholder:text-blue-100/50 focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/30" /> : null}
              <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email address" autoComplete="email" className="h-12 w-full rounded-xl border border-blue-100/20 bg-white/[0.08] px-4 text-white placeholder:text-blue-100/50 focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/30" />
              {credentialMode === 'forgot' ? null : <input required minLength={8} type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password (8+ characters)" autoComplete={credentialMode === 'register' ? 'new-password' : 'current-password'} className="h-12 w-full rounded-xl border border-blue-100/20 bg-white/[0.08] px-4 text-white placeholder:text-blue-100/50 focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/30" />}
              {credentialMode === 'login' ? <button type="button" onClick={() => switchMode('forgot')} data-testid="link-forgot-password" className="block w-full text-right text-sm font-semibold text-brand-teal hover:underline">Forgot your password?</button> : null}
              {credentialError ? <p role="alert" className="rounded-xl bg-red-400/15 px-3 py-2 text-sm text-red-100">{credentialError}</p> : null}
              {credentialNotice ? <p role="status" data-testid="text-reset-sent" className="rounded-xl bg-brand-teal/15 px-3 py-2 text-sm text-blue-50">{credentialNotice}</p> : null}
              <button type="submit" disabled={isSigningIn} data-testid="button-submit-credentials" className="flex h-14 w-full items-center justify-center rounded-2xl bg-brand-teal text-base font-bold text-brand-navy shadow-lg shadow-brand-teal/20 transition-all hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-80">{isSigningIn ? (credentialMode === 'forgot' ? 'Sending your link…' : 'Signing in securely…') : credentialMode === 'forgot' ? 'Email me a reset link' : credentialMode === 'register' ? 'Create account with email' : 'Sign in with email'}</button>
            </form>
            <button type="button" onClick={() => switchMode(credentialMode === 'login' ? 'register' : 'login')} className="mt-3 w-full text-sm font-semibold text-brand-teal hover:underline">{credentialMode === 'login' ? 'Need an account? Create one' : credentialMode === 'forgot' ? 'Remembered it? Back to sign in' : 'Already have an account? Sign in'}</button>
            <div className="my-5 flex items-center gap-3 text-xs text-blue-100/50"><span className="h-px flex-1 bg-blue-100/15" /><span>OR</span><span className="h-px flex-1 bg-blue-100/15" /></div>
            <button type="button" onClick={() => { setIsSigningIn(true); login(); }} disabled={isSigningIn} aria-busy={isSigningIn} className="flex h-14 w-full items-center justify-center gap-3 rounded-2xl border border-blue-100/20 bg-white/[0.08] text-base font-bold text-white transition-all hover:bg-white/[0.13] disabled:cursor-wait disabled:opacity-80"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-sm font-bold" aria-hidden="true"><span className="bg-gradient-to-br from-[#4285f4] via-[#34a853] to-[#ea4335] bg-clip-text text-transparent">G</span></span>{isSigningIn ? 'Opening secure sign-in…' : 'Continue with Google'}</button>
            <p className="mt-4 text-center text-xs leading-5 text-blue-100/70">Use email and password or continue through Google’s secure sign-in. Your Jamvi account works on web and mobile.</p>
          </div>
        </main>
      </div>
    </div>
  );
}
