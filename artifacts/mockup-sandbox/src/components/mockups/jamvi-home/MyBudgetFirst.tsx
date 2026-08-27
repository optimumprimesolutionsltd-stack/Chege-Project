import { useState, type ReactNode } from 'react';
import { ArrowRight, BarChart2, Bell, Bus, Check, ChevronDown, ChevronLeft, ChevronRight, CreditCard, Eye, FileText, Heart, PieChart, Plus, Settings, ShoppingCart, Target, TrendingUp, Users, Utensils, Wallet, X, Zap } from 'lucide-react';
import './_group.css';

const shortcuts = [
  { label: 'Add expense', icon: ShoppingCart, tint: '#e5f4ef', color: '#087b70' },
  { label: 'Add money', icon: Plus, tint: '#fff1c9', color: '#8a6100' },
  { label: 'See reports', icon: PieChart, tint: '#e7eef9', color: '#215792' },
];

const overview = [
  { label: 'Budget plan', icon: BarChart2, color: '#087b70' },
  { label: 'Expenses', icon: FileText, color: '#8a6100' },
  { label: 'Savings goals', icon: Target, color: '#215792' },
  { label: 'Contributions', icon: TrendingUp, color: '#16854c' },
];

export function MyBudgetFirst() {
  const [privateMode, setPrivateMode] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [notice, setNotice] = useState('');
  const hidden = (value: string) => privateMode ? '••••' : value;
  const act = (message: string) => setNotice(message);

  return (
    <main className="jamvi-home mbf">
      <style>{`
        .mbf { --page:#f6f8f6; --ink:#08264e; --muted:#60738c; --line:#dbe6e5; background:var(--page); }
        .mbf .jh-header { padding:24px 20px 18px; background:#061f4a; }
        .mbf .jh-top { margin-bottom:14px; }
        .mbf .jh-greeting { color:#afc0d4; } .mbf .jh-name { font-size:19px; }
        .mbf .jh-controls { gap:8px; flex-wrap:wrap; justify-content:flex-end; }
        .mbf .jh-avatar { background:#f5bd39; color:#09264c; }
        .mbf .jh-month { order:5; width:100%; justify-content:space-between; border-top:1px solid rgba(255,255,255,.13); padding-top:10px; margin-top:2px; }
        .mbf .jh-month-label { width:auto; font-size:12px; color:#dce7f5; }
        .mbf .jh-ring-wrap { margin:8px 0 15px; }
        .mbf .jh-ring { width:174px; height:174px; } .mbf .jh-ring svg { width:174px; height:174px; }
        .mbf .jh-percent { font-size:38px; } .mbf .jh-spent { color:#f5bd39; }
        .mbf .jh-stats { background:#0d2c5a; margin-bottom:16px; }
        .mbf .jh-contributions { padding:0 3px; }
        .mbf .jh-shortcuts { padding:14px 16px 3px; gap:9px; background:var(--page); }
        .mbf .jh-shortcut { display:flex; align-items:center; justify-content:center; gap:7px; min-height:45px; padding:10px 6px; border:1px solid rgba(8,38,78,.08); border-radius:12px; }
        .mbf .jh-shortcut span { font-size:10px; color:#244260; }
        .mbf .mbf-personal { margin:15px 16px 0; padding:17px; border-radius:20px; color:#f7fbfa; background:#0d695f; box-shadow:0 8px 20px rgba(6,70,64,.13); }
        .mbf .mbf-personal-top { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; }
        .mbf .mbf-kicker { color:#bce9df; font-size:10px; font-weight:800; letter-spacing:1.2px; }
        .mbf .mbf-personal h2 { margin:4px 0 0; font-size:21px; letter-spacing:-.3px; }
        .mbf .mbf-context { display:flex; align-items:center; gap:5px; padding:6px 9px; color:#d5f5ee; background:rgba(0,31,58,.25); border:1px solid rgba(255,255,255,.2); border-radius:20px; font-size:10px; font-weight:700; white-space:nowrap; }
        .mbf .mbf-personal-copy { color:#c9ebe4; font-size:12px; line-height:17px; margin:10px 0 14px; max-width:270px; }
        .mbf .mbf-personal-actions { display:flex; gap:8px; }
        .mbf .mbf-personal-actions button { border:0; border-radius:10px; padding:9px 12px; font-size:11px; font-weight:800; }
        .mbf .mbf-primary { color:#092a51; background:#f5bd39; } .mbf .mbf-secondary { color:#e1f5f0; background:rgba(255,255,255,.13); }
        .mbf .jh-overview { margin:14px 16px 0; padding:16px; background:#fff; border-color:var(--line); }
        .mbf .jh-eyebrow { color:#0d695f; } .mbf .jh-overview h2 { font-size:17px; }
        .mbf .jh-overview p { margin-top:4px; } .mbf .jh-overview-grid { margin-top:13px; gap:7px; }
        .mbf .jh-overview-button { min-height:42px; background:#f6faf9 !important; border-color:#e3ecea; }
        .mbf .jh-overview-button span { color:#254764; font-size:10px; }
        .mbf .jh-setup { margin-top:14px; border-color:#f0c652; background:#fffdf4; }
        .mbf .jh-setup h2 { font-size:18px; } .mbf .jh-setup-cta { margin-top:14px; min-height:60px; }
        .mbf .mbf-shared { display:flex; align-items:center; gap:12px; margin:14px 16px 0; padding:13px; border:1px solid #cfdfec; border-radius:16px; background:#edf4fb; }
        .mbf .mbf-shared-icon { width:38px; height:38px; display:grid; place-items:center; border-radius:12px; color:#215792; background:#d6e6f6; }
        .mbf .mbf-shared-copy { flex:1; } .mbf .mbf-shared-title { color:#123c6d; font-size:13px; font-weight:800; }
        .mbf .mbf-shared-copy p { color:#60738c; font-size:11px; line-height:15px; margin:2px 0 0; }
        .mbf .mbf-shared button { display:grid; place-items:center; width:28px; height:28px; border:0; border-radius:50%; color:#215792; background:#fff; }
        .mbf .jh-bank { margin-top:12px; } .mbf .jh-section { padding-bottom:105px; }
        .mbf .mbf-toast { position:fixed; left:16px; right:16px; bottom:18px; z-index:4; display:flex; align-items:center; gap:10px; padding:12px 13px; color:#ecf8f3; background:#09264e; border-radius:12px; box-shadow:0 10px 25px rgba(2,25,57,.2); font-size:12px; }
        .mbf .mbf-toast span { flex:1; } .mbf .mbf-toast button { border:0; color:#d6e5f4; background:none; }
      `}</style>
      <header className="jh-header">
        <div className="jh-top">
          <div><span className="jh-greeting">Good morning, </span><span className="jh-name">Chege</span></div>
          <div className="jh-controls">
            <button className="jh-avatar" onClick={() => act('Profile settings opened')} aria-label="Open profile settings">C</button>
            <button className="jh-icon-button" onClick={() => setPrivateMode(!privateMode)} aria-label={privateMode ? 'Show balances' : 'Hide balances'}><Eye size={19}/></button>
            <button className="jh-icon-button" onClick={() => act('Notifications opened')} aria-label="Open notifications"><Bell size={18}/></button>
            <button className="jh-icon-button" onClick={() => act('Settings opened')} aria-label="Open settings"><Settings size={18}/></button>
            <div className="jh-month"><button className="jh-nav-button" onClick={() => act('Already viewing the latest month')} aria-label="Previous month"><ChevronLeft size={17}/></button><span className="jh-month-label">June 2025</span><button className="jh-nav-button" disabled aria-label="Next month"><ChevronRight size={17}/></button></div>
          </div>
        </div>
        <div className="jh-ring-wrap"><div className="jh-ring">
          <svg viewBox="0 0 196 196" aria-hidden="true"><circle className="jh-ring-track" cx="98" cy="98" r="89"/><circle className="jh-ring-progress" cx="98" cy="98" r="89" strokeDashoffset="234"/></svg>
          <div className="jh-ring-center"><strong className="jh-percent">58%</strong><span className="jh-used">used this month</span><strong className="jh-spent">{hidden('KSh 29,000')}</strong><span className="jh-total">{hidden('of KSh 50,000')}</span></div>
        </div></div>
        <div className="jh-stats"><div className="jh-stat"><div className="jh-stat-label">BUDGET</div><div className="jh-stat-value">{hidden('KSh 50K')}</div></div><div className="jh-stat-divider"/><div className="jh-stat"><div className="jh-stat-label">SPENT</div><div className="jh-stat-value">{hidden('KSh 29K')}</div></div><div className="jh-stat-divider"/><div className="jh-stat"><div className="jh-stat-label">LEFT</div><div className="jh-stat-value" style={{color:'#50df75'}}>{hidden('KSh 21K')}</div></div></div>
        <div className="jh-contributions"><Contribution name="Chege" net="+12,000" inValue="25,000" out="13,000" color="#52d5ca" width="84%" hidden={privateMode}/><Contribution name="Lydiah" net="+9,000" inValue="18,000" out="9,000" color="#f5bd39" width="60%" hidden={privateMode}/></div>
      </header>
      <nav className="jh-shortcuts" aria-label="Quick actions">{shortcuts.map(({label, icon: Icon, tint, color}) => <button className="jh-shortcut" style={{background:tint, color}} onClick={() => act(`${label} is ready`)} key={label}><Icon size={17}/><span>{label}</span></button>)}</nav>
      <section className="mbf-personal" aria-labelledby="personal-budget-heading">
        <div className="mbf-personal-top"><div><div className="mbf-kicker">YOUR DEFAULT SPACE</div><h2 id="personal-budget-heading">My Budget</h2></div><div className="mbf-context"><Wallet size={13}/> Private</div></div>
        <p className="mbf-personal-copy">Your own plan is on track. Keep an eye on the KSh 21,000 left for the rest of June.</p>
        <div className="mbf-personal-actions"><button className="mbf-primary" onClick={() => act('Opening your personal budget')}>Open My Budget <ArrowRight size={13} style={{verticalAlign:'-2px'}}/></button><button className="mbf-secondary" onClick={() => act('Shared budget options opened')}><Users size={13} style={{verticalAlign:'-2px'}}/> Shared budgets</button></div>
      </section>
      <section className="jh-overview"><div className="jh-eyebrow">MY BUDGET</div><h2>Make your next money move</h2><p>Everything for this month, in one calm place.</p><div className="jh-overview-grid">{overview.map(({label, icon: Icon, color}) => <button onClick={() => act(`${label} opened`)} className="jh-overview-button" style={{color}} key={label}><Icon size={17}/><span>{label}</span><ChevronRight size={13}/></button>)}</div></section>
      <section className="jh-setup"><div className="jh-setup-head"><div><div className="jh-setup-eyebrow"><span><Zap size={12}/></span> START HERE · STEP 3 OF 4</div><h2>Finish setting up Jamvi</h2><p>One small step before your plan is complete.</p></div><button onClick={() => setExpanded(!expanded)} className="jh-setup-toggle" aria-label={expanded ? 'Collapse setup' : 'Expand setup'}><ChevronDown size={18} style={{transform:expanded?'rotate(180deg)':undefined}}/></button></div><div className="jh-setup-track"><div className="jh-setup-fill"/></div>{!expanded ? <><button onClick={() => act('Bank funding setup opened')} className="jh-setup-cta"><span className="jh-setup-cta-icon"><CreditCard size={18}/></span><div><span className="jh-setup-label">DO THIS NEXT</span><span className="jh-setup-action">Set up bank funding</span></div><ArrowRight size={19}/></button><button onClick={() => act('Setup paused for now')} className="jh-skip">Skip for now</button></> : <div className="jh-setup-list"><Step icon={<Check size={14}/>} title="Set a monthly budget" detail="Plan what you can spend this month." done/><Step icon={<Check size={14}/>} title="Add an income source" detail="Name where your funds come from." done/><Step icon={<CreditCard size={14}/>} title="Set up bank funding" detail="Record your first deposit." action onClick={() => act('Bank funding setup opened')}/><Step icon={<Target size={14}/>} title="Create a savings goal" detail="Start saving for something important."/></div>}</section>
      <section className="mbf-shared"><span className="mbf-shared-icon"><Users size={19}/></span><div className="mbf-shared-copy"><div className="mbf-shared-title">Money is better together</div><p>Create or join a shared budget when you are ready.</p></div><button onClick={() => act('Create or join shared budget')} aria-label="Create or join a shared budget"><ArrowRight size={15}/></button></section>
      <section className="jh-bank"><div className="jh-bank-head"><span className="jh-bank-icon"><CreditCard size={18}/></span><div className="jh-bank-copy"><div className="jh-bank-title">Joint Account</div><div className="jh-bank-sub">Shared budget funds</div></div><button onClick={() => act('Joint Account opened')} aria-label="Open Joint Account" style={{border:0,background:'none',color:'#60738c'}}><ChevronRight size={18}/></button></div><div className="jh-bank-stats"><Bank label="BALANCE" value={hidden('KSh 41K')}/><Bank label="IN THIS MONTH" value={hidden('+KSh 43K')} color="#209e45"/><Bank label="OUT THIS MONTH" value={hidden('-KSh 9K')} color="#c72d35"/></div></section>
      <section className="jh-section"><div className="jh-section-head"><h2>Recent Activity</h2><button onClick={() => act('Showing all recent activity')} className="jh-see-all">See all</button></div><ActivityRow icon={<Utensils size={17}/>} bg="#e1f6f4" color="#0b6a69" title="Market shopping" meta="Chege · 18 Jun" amount="−KSh 4,800"/><ActivityRow icon={<Bus size={17}/>} bg="#e1f6f4" color="#0b6a69" title="Transport" meta="Lydiah · 17 Jun" amount="−KSh 1,200"/><ActivityRow icon={<Heart size={17}/>} bg="#e5f4e8" color="#19834a" title="Emergency fund" meta="Chege · 15 Jun" amount="+KSh 5,000" positive/></section>
      {notice && <div className="mbf-toast" role="status"><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss notification"><X size={16}/></button></div>}
    </main>
  );
}

function Contribution({name,net,inValue,out,color,width,hidden}:{name:string;net:string;inValue:string;out:string;color:string;width:string;hidden:boolean}) { const value=(v:string)=>hidden?'••••':v; return <div className="jh-contribution"><div className="jh-contribution-row"><span className="jh-contribution-name">{name}</span><span className="jh-net" style={{color}}>{hidden?'••••':`Net ${net}`}</span></div><div className="jh-contribution-track"><div className="jh-contribution-fill" style={{width,background:color,opacity:.35}}/></div><div className="jh-contribution-row jh-contribution-sub"><span>In: {value(inValue)}</span><span>Out: {value(out)}</span></div></div>; }
function Step({icon,title,detail,done,action,onClick}:{icon:ReactNode;title:string;detail:string;done?:boolean;action?:boolean;onClick?:()=>void}) { return <div className="jh-step"><span className="jh-step-icon" style={done?{background:'#011c4e20',color:'#011c4e'}:undefined}>{icon}</span><div className="jh-step-copy"><div className="jh-step-title" style={done?{color:'#4d6687',textDecoration:'line-through'}:undefined}>{title}</div><div className="jh-step-detail">{detail}</div></div>{action && <button onClick={onClick} className="jh-go">Go</button>}</div>; }
function Bank({label,value,color}:{label:string;value:string;color?:string}) { return <div className="jh-bank-stat"><div className="jh-bank-label">{label}</div><div className="jh-bank-value" style={color?{color}:undefined}>{value}</div></div>; }
function ActivityRow({icon,bg,color,title,meta,amount,positive}:{icon:ReactNode;bg:string;color:string;title:string;meta:string;amount:string;positive?:boolean}) { return <div className="jh-activity"><span className="jh-activity-icon" style={{background:bg,color}}>{icon}</span><div className="jh-activity-copy"><div className="jh-activity-desc">{title}</div><div className="jh-activity-meta">{meta}</div></div><strong className="jh-activity-amount" style={{color:positive?'#19834a':'#06224f'}}>{amount}</strong></div>; }