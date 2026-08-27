import { useState, type CSSProperties } from 'react';
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  Church,
  HandCoins,
  Home,
  Plus,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from 'lucide-react';
import './_group.css';

type BudgetPath = {
  id: string;
  name: string;
  context: string;
  purpose: string;
  detail: string;
  accent: string;
  icon: 'personal' | 'family' | 'chama' | 'church' | 'team';
};

const budgetPaths: BudgetPath[] = [
  {
    id: 'personal',
    name: 'Personal budget',
    context: 'Just for you',
    purpose: 'Keep your everyday plans in one calm place.',
    detail: 'For spending decisions, saving goals and the things you are working towards.',
    accent: '#fdbb0a',
    icon: 'personal',
  },
  {
    id: 'family',
    name: 'Family budget',
    context: 'For home',
    purpose: 'Plan household life without mixing everything together.',
    detail: 'A shared place for home priorities, while personal choices stay personal.',
    accent: '#08b7b0',
    icon: 'family',
  },
  {
    id: 'chama',
    name: 'Chama budget',
    context: 'For your circle',
    purpose: 'Make pooled contributions easy to follow.',
    detail: 'Keep your chama’s commitments, decisions and shared purpose together.',
    accent: '#d99b18',
    icon: 'chama',
  },
  {
    id: 'church',
    name: 'Church budget',
    context: 'For your community',
    purpose: 'Coordinate care with the people who make it possible.',
    detail: 'A clear home for welfare support, group giving and community plans.',
    accent: '#6688bd',
    icon: 'church',
  },
  {
    id: 'team',
    name: 'Team budget',
    context: 'For your team',
    purpose: 'Give shared work a simple place to land.',
    detail: 'Keep team plans and contributions clear without extra admin.',
    accent: '#cf7658',
    icon: 'team',
  },
];

const pageStyles = `
  .vertical-budget-rail { --vbr-navy:#011c4e; --vbr-blue:#003383; --vbr-teal:#08b7b0; --vbr-gold:#fdbb0a; --vbr-page:#f5f8fc; --vbr-ink:#06224f; --vbr-muted:#4d6687; --vbr-line:#d7e3f1; min-height:100dvh; max-width:1000px; margin:0 auto; color:var(--vbr-ink); background:var(--vbr-page); font-family:Inter,Arial,sans-serif; }
  .vertical-budget-rail *, .vertical-budget-rail *::before, .vertical-budget-rail *::after { box-sizing:border-box; }
  .vbr-welcome { display:flex; align-items:center; justify-content:space-between; gap:14px; padding:21px 28px 20px; color:#f5f8ff; background:var(--vbr-navy); }
  .vbr-brand { display:flex; align-items:center; gap:8px; font-size:18px; font-weight:800; letter-spacing:-.5px; }.vbr-mark { display:grid; place-items:center; width:26px; height:26px; border-radius:8px; color:var(--vbr-navy); background:var(--vbr-gold); font-size:12px; font-weight:900; }
  .vbr-welcome-copy { text-align:right; }.vbr-welcome-kicker { margin:0 0 4px; color:var(--vbr-gold); font-size:10px; font-weight:800; letter-spacing:1.2px; text-transform:uppercase; }.vbr-welcome-line { margin:0; color:#c3d0e2; font-size:12px; }
  .vbr-intro { display:grid; grid-template-columns:minmax(0,1fr) minmax(230px,.7fr); align-items:end; gap:28px; padding:35px 28px 30px; background:#fff; border-bottom:1px solid var(--vbr-line); }.vbr-intro h1 { max-width:570px; margin:0; font-size:clamp(29px,4vw,43px); line-height:1.04; letter-spacing:-1.6px; }.vbr-intro p { max-width:400px; margin:0; color:var(--vbr-muted); font-size:13px; line-height:20px; }.vbr-intro strong { color:var(--vbr-navy); font-weight:750; }
  .vbr-main { padding:30px 28px 42px; }.vbr-layout { display:grid; grid-template-columns:minmax(330px,.9fr) minmax(320px,1.1fr); gap:34px; align-items:start; }.vbr-overline { margin:0 0 8px; color:var(--vbr-teal); font-size:10px; font-weight:800; letter-spacing:1.25px; text-transform:uppercase; }.vbr-main h2 { margin:0; font-size:24px; letter-spacing:-.7px; }.vbr-rail-help { margin:7px 0 18px; color:var(--vbr-muted); font-size:12px; line-height:18px; }
  .vbr-rail { position:relative; display:grid; gap:7px; }.vbr-rail::before { content:""; position:absolute; left:20px; top:20px; bottom:20px; width:2px; background:var(--vbr-line); }.vbr-tab { position:relative; z-index:1; display:flex; align-items:center; width:100%; min-height:67px; gap:11px; padding:9px 12px 9px 9px; border:1px solid transparent; border-radius:14px; color:var(--vbr-ink); background:transparent; text-align:left; transition:transform .18s ease,border-color .18s ease,background-color .18s ease,box-shadow .18s ease; }.vbr-tab:hover { transform:translateX(2px); border-color:var(--vbr-line); background:#fff; }.vbr-tab:focus-visible,.vbr-action:focus-visible { outline:3px solid rgba(8,183,176,.38); outline-offset:2px; }.vbr-tab[aria-pressed="true"] { border-color:var(--vbr-gold); background:#fff; box-shadow:0 4px 0 var(--vbr-gold); }.vbr-tab-icon { display:grid; place-items:center; width:41px; height:41px; flex:0 0 auto; border:3px solid var(--vbr-page); border-radius:12px; color:var(--vbr-navy); background:var(--vbr-accent); }.vbr-tab-copy { min-width:0; flex:1; }.vbr-context { display:block; margin-bottom:3px; color:var(--vbr-muted); font-size:9px; font-weight:800; letter-spacing:.7px; text-transform:uppercase; }.vbr-tab-name { display:block; font-size:15px; font-weight:750; }.vbr-tab-arrow { color:#8ba0bb; }.vbr-tab[aria-pressed="true"] .vbr-tab-arrow { color:var(--vbr-navy); }
  .vbr-detail-panel { padding:23px; border:1px solid var(--vbr-line); border-radius:19px; background:#fff; box-shadow:0 10px 27px rgba(6,34,79,.06); }.vbr-detail-head { display:flex; align-items:flex-start; gap:12px; }.vbr-detail-icon { display:grid; place-items:center; width:43px; height:43px; flex:0 0 auto; border-radius:13px; color:var(--vbr-navy); background:#e6f7f5; }.vbr-selected-label { margin:2px 0 6px; color:var(--vbr-teal); font-size:10px; font-weight:800; letter-spacing:.9px; text-transform:uppercase; }.vbr-detail-panel h3 { margin:0; font-size:22px; letter-spacing:-.6px; }.vbr-detail-panel p { margin:8px 0 0; color:var(--vbr-muted); font-size:13px; line-height:20px; }.vbr-purpose { margin-top:19px; padding:13px; border-left:3px solid var(--vbr-gold); color:var(--vbr-navy); background:#fff9e7; font-size:12px; font-weight:750; line-height:18px; }.vbr-action { display:flex; align-items:center; justify-content:space-between; width:100%; min-height:48px; margin-top:21px; padding:0 15px 0 17px; border:0; border-radius:11px; color:var(--vbr-navy); background:var(--vbr-gold); font-size:12px; font-weight:800; transition:transform .18s ease,background-color .18s ease; }.vbr-action:hover { transform:translateY(-1px); background:#ffca3a; }.vbr-action span { display:flex; align-items:center; gap:7px; }.vbr-secondary { display:flex; gap:9px; margin-top:12px; }.vbr-secondary button { display:flex; align-items:center; justify-content:center; gap:6px; flex:1; min-height:40px; border:1px solid #c9d7e8; border-radius:10px; color:var(--vbr-navy); background:transparent; font-size:10px; font-weight:750; }.vbr-secondary button:hover { border-color:var(--vbr-teal); background:#edf9f8; }.vbr-trust { display:flex; align-items:flex-start; gap:8px; margin-top:20px; padding-top:15px; border-top:1px solid var(--vbr-line); color:var(--vbr-muted); font-size:11px; line-height:16px; }.vbr-trust svg { flex:0 0 auto; color:var(--vbr-teal); }.vbr-note { margin-top:12px; padding:10px 12px; border-radius:10px; color:#216c68; background:#e8f8f6; font-size:11px; line-height:16px; }
  @media (max-width:700px) { .vbr-welcome { padding:18px; }.vbr-welcome-copy { text-align:right; }.vbr-welcome-line { max-width:190px; }.vbr-intro { display:block; padding:30px 18px 25px; }.vbr-intro p { margin-top:12px; }.vbr-main { padding:24px 16px 32px; }.vbr-layout { display:flex; flex-direction:column; }.vbr-layout > .vbr-detail-panel { order:1; margin-top:0; }.vbr-layout > :first-child { order:2; margin-top:23px; }.vbr-detail-panel { padding:19px; }.vbr-secondary { flex-direction:column; }.vbr-tab { min-height:64px; } }
  @media (prefers-reduced-motion:reduce) { .vbr-tab,.vbr-action { transition:none; } }
`;

function PathIcon({ icon }: { icon: BudgetPath['icon'] }) {
  if (icon === 'personal') return <Sparkles size={19} />;
  if (icon === 'family') return <Home size={19} />;
  if (icon === 'chama') return <HandCoins size={19} />;
  if (icon === 'church') return <Church size={19} />;
  return <UsersRound size={19} />;
}

export function VerticalBudgetRail() {
  const [selected, setSelected] = useState('personal');
  const [note, setNote] = useState('');
  const path = budgetPaths.find((item) => item.id === selected) ?? budgetPaths[0];

  const choosePath = (id: string) => {
    setSelected(id);
    setNote('');
  };

  return (
    <main className="vertical-budget-rail">
      <style>{pageStyles}</style>
      <header className="vbr-welcome">
        <div className="vbr-brand"><span className="vbr-mark">J</span> jamvi</div>
        <div className="vbr-welcome-copy"><p className="vbr-welcome-kicker">Your Jamvi spaces</p><p className="vbr-welcome-line">Choose where you want to work.</p></div>
      </header>

      <section className="vbr-intro" aria-label="Jamvi orientation">
        <h1>Choose a budget and get to work.</h1>
        <p><strong>Jamvi gives each plan a clear place</strong> — personal money stays separate, while shared money stays easy for the right people to follow.</p>
      </section>

      <section className="vbr-main" id="choose-your-space">
        <div className="vbr-layout">
          <div>
            <p className="vbr-overline">Choose your starting space</p>
            <h2>Where would you like to begin?</h2>
            <p className="vbr-rail-help">Select the space you want to open.</p>
            <div className="vbr-rail" role="listbox" aria-label="Available Jamvi spaces">
              {budgetPaths.map((item) => (
                <button key={item.id} className="vbr-tab" type="button" role="option" aria-selected={selected === item.id} aria-pressed={selected === item.id} style={{ '--vbr-accent': item.accent } as CSSProperties} onClick={() => choosePath(item.id)}>
                  <span className="vbr-tab-icon"><PathIcon icon={item.icon} /></span>
                  <span className="vbr-tab-copy"><span className="vbr-context">{item.context}</span><span className="vbr-tab-name">{item.name}</span></span>
                  {selected === item.id ? <Check className="vbr-tab-arrow" size={18} aria-label="Selected" /> : <ChevronRight className="vbr-tab-arrow" size={18} />}
                </button>
              ))}
            </div>
          </div>

          <aside className="vbr-detail-panel" aria-live="polite">
            <div className="vbr-detail-head">
              <span className="vbr-detail-icon" style={{ background: `${path.accent}33` }}><PathIcon icon={path.icon} /></span>
              <div><p className="vbr-selected-label">Selected space</p><h3>{path.name}</h3><p>{path.detail}</p></div>
            </div>
            <div className="vbr-purpose">{path.purpose}</div>
            <button className="vbr-action" type="button" onClick={() => setNote(`Demo preview: opening your ${path.name.toLowerCase()}.`)}><span>Open {path.name} <ArrowUpRight size={16} /></span><ChevronRight size={17} /></button>
            {note && <div className="vbr-note">{note}</div>}
            <div className="vbr-secondary">
              <button type="button" onClick={() => setNote('Demo preview: create a shared space when you are ready to bring people together.')}><Plus size={14} /> Create shared</button>
              <button type="button" onClick={() => setNote('Demo preview: join a shared space when someone has invited you in.')}><UsersRound size={14} /> Join shared</button>
            </div>
            <div className="vbr-trust"><ShieldCheck size={16} /><span>Clear places make shared decisions easier to trust.</span></div>
          </aside>
        </div>
      </section>
    </main>
  );
}