import { useState, type CSSProperties } from 'react';
import { ArrowRight, Check, ChevronDown, ChevronRight, Plus, ShieldCheck, Users, X } from 'lucide-react';
import './_group.css';

type Budget = {
  name: string;
  kind: string;
  detail: string;
  people: string;
  accent: string;
  initials: string;
};

const sharedBudgets: Budget[] = [
  { name: 'Mwangaza Family', kind: 'Shared budget', detail: 'Home bills, food & school', people: '5 members', accent: '#19b7ae', initials: 'MF' },
  { name: 'Tujenge Chama', kind: 'Chama budget', detail: 'Monthly contributions & table banking', people: '8 members', accent: '#f0b429', initials: 'TC' },
  { name: 'St. Luke Welfare', kind: 'Church budget', detail: 'Welfare contributions & support', people: '24 members', accent: '#8aa8df', initials: 'SL' },
  { name: 'Sprint Crew', kind: 'Team budget', detail: 'Team lunch & shared tools', people: '6 members', accent: '#df8c68', initials: 'SC' },
];

const pageStyles = `
  .budget-chooser { --chooser-navy:#061f4d; --chooser-deep:#031639; --chooser-ink:#102b54; --chooser-muted:#6b7f9d; --chooser-line:#dce6f2; --chooser-paper:#f6f8fc; min-height:100dvh; max-width:402px; margin:0 auto; background:var(--chooser-paper); color:var(--chooser-ink); font-family:Inter, ui-sans-serif, sans-serif; padding-bottom:28px; }
  .budget-chooser *, .budget-chooser *::before, .budget-chooser *::after { box-sizing:border-box; }
  .chooser-hero { position:relative; overflow:hidden; padding:24px 20px 25px; color:#f6f8ff; background:var(--chooser-navy); }
  .chooser-hero::after { content:""; position:absolute; width:180px; height:180px; right:-75px; top:-105px; border:1px solid rgba(255,255,255,.16); border-radius:50%; box-shadow:0 0 0 22px rgba(255,255,255,.035),0 0 0 44px rgba(255,255,255,.025); }
  .chooser-top { position:relative; z-index:1; display:flex; align-items:center; justify-content:space-between; margin-bottom:39px; }
  .chooser-brand { display:flex; gap:8px; align-items:center; font-weight:800; letter-spacing:-.4px; font-size:18px; }
  .chooser-mark { display:grid; place-items:center; width:25px; height:25px; border-radius:8px; color:var(--chooser-navy); background:#f0b429; font-size:12px; font-weight:900; }
  .chooser-profile { display:flex; align-items:center; gap:8px; color:#b5c5dc; font-size:11px; }
  .chooser-avatar { display:grid; place-items:center; width:29px; height:29px; border-radius:50%; background:#1c477c; color:#f5f8ff; font-size:11px; font-weight:700; }
  .chooser-kicker { position:relative; z-index:1; margin:0 0 9px; color:#f0b429; font-size:10px; font-weight:800; letter-spacing:1.3px; }
  .chooser-hero h1 { position:relative; z-index:1; max-width:315px; margin:0; color:#f6f8ff; font-size:31px; line-height:1.08; letter-spacing:-1.2px; }
  .chooser-hero p { position:relative; z-index:1; max-width:330px; margin:12px 0 0; color:#b7c7dd; font-size:13px; line-height:19px; }
  .chooser-main { padding:22px 16px 0; }
  .chooser-intro { display:flex; justify-content:space-between; align-items:end; gap:12px; margin:0 4px 11px; }
  .chooser-intro h2 { margin:0; font-size:17px; letter-spacing:-.3px; }
  .chooser-intro span { color:var(--chooser-muted); font-size:11px; }
  .budget-card { position:relative; width:100%; margin:0 0 10px; padding:16px; border:1px solid var(--chooser-line); border-radius:17px; color:var(--chooser-ink); background:#fff; text-align:left; transition:transform .18s ease, border-color .18s ease, box-shadow .18s ease; }
  .budget-card:hover { transform:translateY(-1px); }
  .budget-card.selected { border-color:#f0b429; box-shadow:0 5px 0 #f0b429; }
  .budget-card.personal { padding:18px 16px; border:0; color:#fff; background:var(--chooser-deep); }
  .budget-card.personal.selected { box-shadow:0 5px 0 #f0b429; }
  .card-row { display:flex; align-items:center; gap:12px; }
  .budget-icon { display:grid; place-items:center; width:43px; height:43px; flex:0 0 auto; border-radius:13px; color:var(--chooser-navy); background:#f0b429; }
  .budget-icon.shared { color:#fff; background:var(--card-accent); }
  .card-copy { min-width:0; flex:1; }
  .card-label { display:block; margin-bottom:3px; color:#aebed4; font-size:10px; font-weight:800; letter-spacing:1px; text-transform:uppercase; }
  .shared .card-label { color:var(--chooser-muted); }
  .card-title { display:block; font-size:16px; font-weight:750; letter-spacing:-.3px; }
  .card-detail { display:block; overflow:hidden; margin-top:4px; color:#aebed4; font-size:11px; text-overflow:ellipsis; white-space:nowrap; }
  .shared .card-detail { color:var(--chooser-muted); }
  .card-arrow { color:#7e94b2; }
  .personal .card-arrow { color:#f0b429; }
  .selected-tag { position:absolute; right:13px; top:-9px; display:flex; align-items:center; gap:4px; padding:4px 8px; border-radius:20px; color:var(--chooser-navy); background:#f0b429; font-size:9px; font-weight:800; }
  .people-row { display:flex; align-items:center; gap:6px; margin:13px 0 0 55px; color:var(--chooser-muted); font-size:11px; }
  .people-dots { display:flex; }
  .people-dots span { display:grid; place-items:center; width:19px; height:19px; margin-left:-4px; border:2px solid #fff; border-radius:50%; color:#fff; background:#6f90ba; font-size:7px; font-weight:700; }
  .people-dots span:first-child { margin-left:0; background:#1b9e9c; }
  .chooser-divider { display:flex; align-items:center; gap:10px; margin:21px 4px 13px; color:#91a2ba; font-size:10px; font-weight:700; letter-spacing:1px; }
  .chooser-divider::before, .chooser-divider::after { content:""; height:1px; flex:1; background:var(--chooser-line); }
  .secondary-actions { display:grid; grid-template-columns:1fr 1fr; gap:9px; }
  .secondary-action { display:flex; align-items:center; justify-content:center; gap:7px; min-height:44px; border:1px solid #c8d6e8; border-radius:12px; color:var(--chooser-navy); background:transparent; font-size:11px; font-weight:750; }
  .secondary-action:hover { background:#edf3fa; }
  .trust-note { display:flex; gap:9px; align-items:flex-start; margin:22px 4px 0; padding:12px; border-radius:12px; color:#58708f; background:#eaf1f8; font-size:11px; line-height:16px; }
  .trust-note svg { flex:0 0 auto; margin-top:1px; color:#168e87; }
  .inline-panel { margin:13px 0 0; padding:14px; border:1px solid #c8d6e8; border-radius:14px; background:#fff; }
  .inline-panel-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; font-size:13px; font-weight:750; }
  .close-panel { display:grid; place-items:center; width:24px; height:24px; border:0; border-radius:50%; color:var(--chooser-muted); background:#edf2f8; }
  .inline-panel input { width:100%; height:38px; margin-bottom:9px; padding:0 11px; border:1px solid #d6e1ed; border-radius:9px; outline:0; color:var(--chooser-ink); background:#f8fafc; font:inherit; font-size:12px; }
  .inline-panel input:focus { border-color:#168e87; }
  .panel-submit { width:100%; height:38px; border:0; border-radius:9px; color:var(--chooser-navy); background:#f0b429; font-size:12px; font-weight:800; }
  @media (prefers-reduced-motion:reduce) { .budget-card { transition:none; } }
`;

export function BudgetChooser() {
  const [selected, setSelected] = useState('personal');
  const [panel, setPanel] = useState<'create' | 'join' | null>(null);
  const choose = (name: string) => { setSelected(name); setPanel(null); };

  return (
    <main className="budget-chooser">
      <style>{pageStyles}</style>
      <header className="chooser-hero">
        <div className="chooser-top">
          <div className="chooser-brand"><span className="chooser-mark">J</span> jamvi</div>
          <div className="chooser-profile"><span>Hi, Chege</span><span className="chooser-avatar">C</span></div>
        </div>
        <div className="chooser-kicker">A CLEARER WAY TO MANAGE MONEY</div>
        <h1>Good morning, Chege.</h1>
        <p>Keep your money clear and accountable. Choose where you want to start today.</p>
      </header>

      <section className="chooser-main" aria-label="Choose a budget">
        <div className="chooser-intro"><h2>Choose a budget</h2><span>{selected === 'personal' ? 'Personal first' : 'Selected'}</span></div>
        <button className={`budget-card personal ${selected === 'personal' ? 'selected' : ''}`} onClick={() => choose('personal')} aria-pressed={selected === 'personal'}>
          {selected === 'personal' && <span className="selected-tag"><Check size={11} /> Selected</span>}
          <div className="card-row"><span className="budget-icon"><ChevronRight size={21} /></span><span className="card-copy"><span className="card-label">Personal</span><span className="card-title">My Budget</span><span className="card-detail">Your own plans, spending and goals</span></span><ArrowRight className="card-arrow" size={19} /></div>
        </button>
        <div className="chooser-divider">SHARED WITH OTHERS</div>
        {sharedBudgets.map((budget) => (
          <button key={budget.name} className={`budget-card shared ${selected === budget.name ? 'selected' : ''}`} style={{ '--card-accent': budget.accent } as CSSProperties} onClick={() => choose(budget.name)} aria-pressed={selected === budget.name}>
            {selected === budget.name && <span className="selected-tag"><Check size={11} /> Selected</span>}
            <div className="card-row"><span className="budget-icon shared"><Users size={19} /></span><span className="card-copy"><span className="card-label">{budget.kind}</span><span className="card-title">{budget.name}</span><span className="card-detail">{budget.detail}</span></span><ChevronRight className="card-arrow" size={19} /></div>
            <div className="people-row"><span className="people-dots"><span>{budget.initials[0]}</span><span>{budget.initials[1]}</span><span>+</span></span>{budget.people}</div>
          </button>
        ))}
        <div className="secondary-actions">
          <button className="secondary-action" onClick={() => setPanel(panel === 'create' ? null : 'create')}><Plus size={16} /> Create shared</button>
          <button className="secondary-action" onClick={() => setPanel(panel === 'join' ? null : 'join')}><Users size={16} /> Join shared</button>
        </div>
        {panel && <div className="inline-panel">
          <div className="inline-panel-head"><span>{panel === 'create' ? 'Create a shared budget' : 'Join a shared budget'}</span><button className="close-panel" onClick={() => setPanel(null)} aria-label="Close"><X size={14} /></button></div>
          {panel === 'create' ? <><input aria-label="Budget name" placeholder="e.g. Akinyi household" /><input aria-label="Budget purpose" placeholder="What is it for?" /></> : <input aria-label="Invite code" placeholder="Enter your invite code" />}
          <button className="panel-submit" onClick={() => setPanel(null)}>{panel === 'create' ? 'Continue' : 'Join budget'}</button>
        </div>}
        <div className="trust-note"><ShieldCheck size={16} /><span>Personal and shared money stay separate in Jamvi. Every contribution and expense has a name attached.</span></div>
      </section>
    </main>
  );
}