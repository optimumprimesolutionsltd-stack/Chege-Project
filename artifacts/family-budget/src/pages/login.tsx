import { useAuth } from '@workspace/replit-auth-web';
import { TrendingUp } from 'lucide-react';

function FeatureRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-4 p-4 rounded-xl" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: 'rgba(207,114,23,0.18)' }}>
        {icon}
      </div>
      <span className="text-sm font-medium" style={{ color: 'rgba(247,250,246,0.85)' }}>{text}</span>
    </div>
  );
}

export default function LoginPage() {
  const { login } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(160deg, #0a1a10 0%, #0f2217 50%, #163020 100%)' }}>
      <div className="w-full max-w-sm px-6 flex flex-col items-center gap-10">

        {/* Brand mark */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-20 h-20 rounded-3xl flex items-center justify-center shadow-2xl" style={{ backgroundColor: 'rgba(207,114,23,0.25)', border: '1px solid rgba(207,114,23,0.3)' }}>
            <TrendingUp className="w-10 h-10" style={{ color: '#cf7217' }} />
          </div>
          <div className="text-center">
            <h1 className="text-4xl font-display font-bold tracking-tight" style={{ color: '#f7faf6' }}>Bajeti</h1>
            <p className="text-sm mt-1 font-medium" style={{ color: '#7aaa8a' }}>Shared finances, together</p>
          </div>
        </div>

        {/* Feature list */}
        <div className="w-full space-y-3">
          <FeatureRow
            icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#cf7217" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>}
            text="Track every shilling your group spends"
          />
          <FeatureRow
            icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#cf7217" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>}
            text="Log expenses anywhere, anytime"
          />
          <FeatureRow
            icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#cf7217" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>}
            text="Everyone in your group stays in sync"
          />
        </div>

        {/* Sign in */}
        <div className="w-full space-y-4">
          <button
            onClick={login}
            className="w-full h-14 rounded-2xl text-base font-bold transition-opacity hover:opacity-90 active:opacity-80 flex items-center justify-center gap-2"
            style={{ backgroundColor: '#2d6a4f', color: '#f7faf6', boxShadow: '0 4px 20px rgba(74,222,128,0.2)' }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
            Sign in to continue
          </button>
          <p className="text-center text-xs" style={{ color: 'rgba(122,170,138,0.7)' }}>
            Your account works on web and mobile
          </p>
        </div>
      </div>
    </div>
  );
}
