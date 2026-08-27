import { useState } from 'react';
import { useAuth } from '@workspace/replit-auth-web';
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
  const { login } = useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-[#00132f] via-brand-navy to-brand-blue px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
      <div className="pointer-events-none absolute -left-32 -top-32 h-80 w-80 rounded-full bg-brand-gold/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-20 h-[28rem] w-[28rem] rounded-full bg-brand-teal/15 blur-3xl" />

      <div className="relative mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-6xl items-center justify-center gap-12 lg:min-h-[calc(100vh-4rem)] lg:justify-between">
        <section className="hidden max-w-xl flex-1 lg:block">
          <div className="mb-8 flex flex-col items-start gap-2">
            <div className="flex h-12 w-44 items-center justify-center rounded-2xl bg-brand-surface px-3 shadow-lg">
              <BrandLogo className="h-10 w-full" />
            </div>
            <p className="pl-1 text-xs font-medium text-blue-100/70">Shared finances, together</p>
          </div>

          <p className="mb-5 text-sm font-semibold uppercase tracking-[0.2em] text-brand-gold">A calmer way to budget</p>
          <h1 className="max-w-lg font-display text-5xl font-bold leading-[1.05] tracking-tight text-white xl:text-6xl">
            Make every shilling count — together.
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-8 text-blue-100/80">
            One clear place for group spending, shared goals, and the decisions that keep everyone moving forward.
          </p>

          <div className="mt-9 space-y-3">
            <FeatureRow icon={<WalletCards className="h-5 w-5" />} text="See where your group money is going" />
            <FeatureRow icon={<Users className="h-5 w-5" />} text="Keep every member on the same page" />
            <FeatureRow icon={<ShieldCheck className="h-5 w-5" />} text="Build a record everyone can trust" />
          </div>
        </section>

        <main className="w-full max-w-md">
          <div className="rounded-[2rem] border border-brand-teal/20 bg-[#06183c]/95 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
            <div className="mb-8 flex items-start justify-between gap-4">
              <div className="flex flex-col items-start gap-2 lg:hidden">
                <div className="flex h-11 w-36 items-center justify-center rounded-2xl bg-brand-surface px-2">
                  <BrandLogo className="h-9 w-full" />
                </div>
                <p className="pl-1 text-xs font-medium text-blue-100/70">Shared finances, together</p>
              </div>
              <div className="ml-auto flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-teal/15 text-brand-teal">
                <Sparkles className="h-5 w-5" />
              </div>
            </div>

            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-gold">Welcome back</p>
            <h2 className="mt-3 font-display text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl">
              Your money, in focus.
            </h2>
            <p className="mt-3 text-sm leading-6 text-blue-100/80">
              Sign in to pick up where your group left off.
            </p>

            <div className="my-7 rounded-2xl border border-blue-100/15 bg-white/[0.055] p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-brand-teal">Your shared view</p>
                  <p className="mt-1 font-display text-lg font-bold text-white">Clearer decisions</p>
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

            <button
              onClick={() => {
                setIsSigningIn(true);
                login();
              }}
              disabled={isSigningIn}
              aria-busy={isSigningIn}
              className="flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-brand-blue text-base font-bold text-white shadow-lg shadow-brand-blue/25 transition-all hover:-translate-y-0.5 hover:bg-[#002966] hover:shadow-xl active:translate-y-0 disabled:cursor-wait disabled:opacity-80"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-sm font-bold" aria-hidden="true">
                <span className="bg-gradient-to-br from-[#4285f4] via-[#34a853] to-[#ea4335] bg-clip-text text-transparent">G</span>
              </span>
              {isSigningIn ? 'Opening secure sign-in…' : 'Continue with Google'}
            </button>
            <p className="mt-4 text-center text-xs leading-5 text-blue-100/70">
              You’ll continue through Google’s secure sign-in. Your Jamvi account works on web and mobile.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
