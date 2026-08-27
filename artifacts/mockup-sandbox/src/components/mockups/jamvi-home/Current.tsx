import { useState, type ReactNode } from 'react';
import { Activity, BarChart2, Briefcase, ChevronDown, ChevronLeft, ChevronRight, CreditCard, Eye, FileText, PieChart, PlusCircle, Settings, ShoppingCart, Target, TrendingUp, Users, Zap, ArrowRight, Utensils, Bus, Heart, Check } from 'lucide-react';
import './_group.css';

const shortcuts = [
  [PlusCircle, 'Expense', '#3CDD62', '#0D3428'], [CreditCard, 'Deposit', '#FDBB0A', '#392D08'],
  [PieChart, 'Reports', '#6C9FE6', '#0A254E'], [BarChart2, 'Budget', '#2DD4CC', '#0B343B'],
  [Settings, 'Settings', '#A5B9D4', '#17243C'],
] as const;
const overview = [
  [BarChart2, 'Budget', '#2DD4CC', '#0B343B'], [TrendingUp, 'Contributions', '#3CDD62', '#0D3428'],
  [FileText, 'Expenses', '#FDBB0A', '#392D08'], [Target, 'Goals', '#6C9FE6', '#0A254E'],
  [CreditCard, 'Bank', '#08B7B0', '#0B343B'], [PieChart, 'Reports', '#6C9FE6', '#0A254E'],
] as const;

const noOp = () => undefined;
export function Current() {
  const [privateMode, setPrivateMode] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const hidden = (value: string) => privateMode ? '••••' : value;
  return <main className="jamvi-home">
    <header className="jh-header">
      <div className="jh-top">
        <div><span className="jh-greeting">Good morning, </span><span className="jh-name">Chege!</span></div>
        <div className="jh-controls">
          <button className="jh-avatar" onClick={noOp} aria-label="Open settings">C</button>
          <button className="jh-icon-button" onClick={() => setPrivateMode(!privateMode)} aria-label="Toggle privacy"><Eye size={20} /></button>
          <button className="jh-icon-button" onClick={noOp} aria-label="Settings"><Settings size={19} /></button>
          <div className="jh-month"><button className="jh-nav-button" onClick={noOp}><ChevronLeft size={18} /></button><span className="jh-month-label">Jun 2025</span><button className="jh-nav-button" disabled><ChevronRight size={18} /></button></div>
        </div>
      </div>
      <div className="jh-ring-wrap"><div className="jh-ring">
        <svg viewBox="0 0 196 196" aria-hidden="true"><circle className="jh-ring-track" cx="98" cy="98" r="89" /><circle className="jh-ring-progress" cx="98" cy="98" r="89" strokeDashoffset="234" /></svg>
        <div className="jh-ring-center"><strong className="jh-percent">58%</strong><span className="jh-used">used</span><strong className="jh-spent">{hidden('29,000')}</strong><span className="jh-total">{hidden('of 50,000 KES')}</span></div>
      </div></div>
      <div className="jh-stats"><div className="jh-stat"><div className="jh-stat-label">Budget</div><div className="jh-stat-value">{hidden('50K')}</div></div><div className="jh-stat-divider"/><div className="jh-stat"><div className="jh-stat-label">Spent</div><div className="jh-stat-value">{hidden('29K')}</div></div><div className="jh-stat-divider"/><div className="jh-stat"><div className="jh-stat-label">Left</div><div className="jh-stat-value" style={{ color: '#3CDD62' }}>{hidden('21K')}</div></div></div>
      <div className="jh-contributions">
        <Contribution name="Chege" net="+12,000" inValue="25,000" out="13,000" color="#08B7B0" width="84%" hidden={privateMode} />
        <Contribution name="Lydiah" net="+9,000" inValue="18,000" out="9,000" color="#FDBB0A" width="60%" hidden={privateMode} />
      </div>
    </header>
    <nav className="jh-shortcuts">{shortcuts.map(([Icon, label, color, bg]) => <button className="jh-shortcut" style={{ background: bg, color }} onClick={noOp} key={label}><Icon size={20}/><span>{label}</span></button>)}</nav>
    <section className="jh-overview"><div className="jh-eyebrow">GROUP OVERVIEW</div><h2>Go straight to a budget area</h2><p>Open the shared budget, contributions, expenses, goals, bank, or reports without hunting through the menu.</p><div className="jh-overview-grid">{overview.map(([Icon, label, color, bg]) => <button onClick={noOp} className="jh-overview-button" style={{ color, background: bg }} key={label}><Icon size={18}/><span>{label}</span><ChevronRight size={14}/></button>)}</div></section>
    <section className="jh-setup"><div className="jh-setup-head"><div><div className="jh-setup-eyebrow"><Zap size={12}/> START HERE · STEP 3 OF 4</div><h2>Finish setting up Jamvi</h2><p>A few small wins and you are ready to go.</p></div><button onClick={() => setExpanded(!expanded)} className="jh-setup-toggle" aria-label="Expand setup"><ChevronDown size={18} style={{ transform: expanded ? 'rotate(180deg)' : undefined }}/></button></div><div className="jh-setup-track"><div className="jh-setup-fill"/></div>
      {!expanded ? <><button onClick={noOp} className="jh-setup-cta"><span className="jh-setup-cta-icon"><CreditCard size={19}/></span><div><span className="jh-setup-label">DO THIS NEXT</span><span className="jh-setup-action">Set up bank funding</span></div><ArrowRight size={20}/></button><button onClick={noOp} className="jh-skip">Skip for now</button></> :
      <div className="jh-setup-list"><Step icon={<Check size={14}/>} title="Set a monthly budget" detail="Plan what you can spend this month." done/><Step icon={<Check size={14}/>} title="Add an income source" detail="Name where your funds come from." done/><Step icon={<CreditCard size={14}/>} title="Set up bank funding" detail="Record your first deposit." action/><Step icon={<Target size={14}/>} title="Create a savings goal" detail="Start saving for something important."/></div>}</section>
    <section className="jh-bank"><div className="jh-bank-head"><span className="jh-bank-icon"><CreditCard size={18}/></span><div className="jh-bank-copy"><div className="jh-bank-title">Joint Account</div><div className="jh-bank-sub">Shared budget funds</div></div><ChevronRight className="jh-bank-arrow" size={18}/></div><div className="jh-bank-stats"><Bank label="BALANCE" value={hidden('KES 41K')}/><Bank label="IN THIS MONTH" value={hidden('+KES 43K')} color="#209E45"/><Bank label="OUT THIS MONTH" value={hidden('-KES 9K')} color="#d92626"/></div></section>
    <section className="jh-section"><div className="jh-section-head"><h2>Recent Activity</h2><button onClick={noOp} className="jh-see-all">See all</button></div><ActivityRow icon={<Utensils size={18}/>} bg="#E1F6F4" color="#0B6A69" title="Market shopping" meta="Chege · 18 Jun" amount="−4,800"/><ActivityRow icon={<Bus size={18}/>} bg="#E1F6F4" color="#0B6A69" title="Transport" meta="Lydiah · 17 Jun" amount="−1,200"/><ActivityRow icon={<Heart size={18}/>} bg="#1a3320" color="#4ade80" title="Emergency fund" meta="Chege · 15 Jun" amount="+5,000" positive/></section>
  </main>;
}
function Contribution({ name, net, inValue, out, color, width, hidden }: {name:string;net:string;inValue:string;out:string;color:string;width:string;hidden:boolean}) { const value=(v:string)=>hidden?'••••':v; return <div className="jh-contribution"><div className="jh-contribution-row"><span className="jh-contribution-name">{name}</span><span className="jh-net" style={{color}}>{hidden ? '••••' : `Net ${net}`}</span></div><div className="jh-contribution-track"><div className="jh-contribution-fill" style={{ width, background: color, opacity:.35 }}/></div><div className="jh-contribution-row jh-contribution-sub"><span>In: {value(inValue)}</span><span>Out: {value(out)}</span></div></div> }
function Step({ icon, title, detail, done, action }: {icon:ReactNode;title:string;detail:string;done?:boolean;action?:boolean}) { return <div className="jh-step"><span className="jh-step-icon" style={done ? {background:'#011c4e20',color:'#011c4e'} : undefined}>{icon}</span><div className="jh-step-copy"><div className="jh-step-title" style={done?{color:'#4d6687',textDecoration:'line-through'}:undefined}>{title}</div><div className="jh-step-detail">{detail}</div></div>{action && <button onClick={noOp} className="jh-go">Go</button>}</div> }
function Bank({ label, value, color }: {label:string;value:string;color?:string}) { return <div className="jh-bank-stat"><div className="jh-bank-label">{label}</div><div className="jh-bank-value" style={color ? {color} : undefined}>{value}</div></div> }
function ActivityRow({icon,bg,color,title,meta,amount,positive}:{icon:ReactNode;bg:string;color:string;title:string;meta:string;amount:string;positive?:boolean}) { return <div className="jh-activity"><span className="jh-activity-icon" style={{background:bg,color}}>{icon}</span><div className="jh-activity-copy"><div className="jh-activity-desc">{title}</div><div className="jh-activity-meta">{meta}</div></div><strong className="jh-activity-amount" style={{color:positive?'#4ade80':'#06224f'}}>{amount}</strong></div> }