import { useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Bell,
  ChevronRight,
  CircleHelp,
  FileText,
  Landmark,
  MoreHorizontal,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  WalletCards,
  X,
} from "lucide-react";

type Workspace = {
  id: string;
  name: string;
  detail: string;
  initials: string;
  tone: string;
  count?: number;
  balance: string;
};

type RecordItem = {
  title: string;
  person: string;
  date: string;
  amount: string;
  direction: "in" | "out";
  kind: string;
  status?: string;
};

const workspaces: Workspace[] = [
  { id: "personal", name: "Personal", detail: "Budget", initials: "ME", tone: "#e6a84b", balance: "KSh 18,420" },
  { id: "home", name: "Mwangaza home", detail: "Family", initials: "MH", tone: "#356b66", count: 2, balance: "KSh 42,800" },
  { id: "chama", name: "Twende chama", detail: "8 members", initials: "TC", tone: "#c76c55", count: 5, balance: "KSh 96,500" },
  { id: "church", name: "St. Luke youth", detail: "Church group", initials: "SL", tone: "#6d739b", balance: "KSh 31,240" },
  { id: "team", name: "Kibera United", detail: "Team fund", initials: "KU", tone: "#7d9061", count: 1, balance: "KSh 12,750" },
];

const records: Record<string, RecordItem[]> = {
  personal: [
    { title: "Groceries — Naivas", person: "You recorded an expense", date: "Today, 9:42 am", amount: "− KSh 2,480", direction: "out", kind: "Food" },
    { title: "Salary", person: "Money in", date: "Yesterday", amount: "+ KSh 58,000", direction: "in", kind: "Income" },
    { title: "M-PESA transfer", person: "To savings", date: "Monday", amount: "− KSh 5,000", direction: "out", kind: "Saving" },
  ],
  home: [
    { title: "School fees · Term 2", person: "Lydiah added a record", date: "Today, 8:16 am", amount: "− KSh 8,500", direction: "out", kind: "Education", status: "Needs review" },
    { title: "Rent contribution", person: "Chege paid", date: "Yesterday", amount: "+ KSh 15,000", direction: "in", kind: "Contribution" },
    { title: "Electricity tokens", person: "You recorded an expense", date: "Monday", amount: "− KSh 2,100", direction: "out", kind: "Home" },
  ],
  chama: [
    { title: "Monthly share · June", person: "Amina added a record", date: "Today, 7:04 am", amount: "+ KSh 5,000", direction: "in", kind: "Share" },
    { title: "Venue deposit", person: "Brian recorded an expense", date: "Yesterday", amount: "− KSh 4,500", direction: "out", kind: "Events", status: "Needs receipt" },
    { title: "Treasurer handover", person: "Jane updated the balance", date: "Friday", amount: "KSh 91,500", direction: "in", kind: "Balance" },
  ],
  church: [
    { title: "Sunday offering", person: "Peter recorded money in", date: "Sunday", amount: "+ KSh 12,400", direction: "in", kind: "Offering" },
    { title: "Sound system repair", person: "Mary added an expense", date: "Saturday", amount: "− KSh 3,200", direction: "out", kind: "Maintenance" },
  ],
  team: [
    { title: "New jerseys", person: "Sam recorded an expense", date: "Yesterday", amount: "− KSh 7,850", direction: "out", kind: "Equipment" },
    { title: "Match day collection", person: "You added money in", date: "Saturday", amount: "+ KSh 9,000", direction: "in", kind: "Collection" },
  ],
};

function Avatar({ workspace, selected = false }: { workspace: Workspace; selected?: boolean }) {
  return (
    <div className="flex w-[67px] shrink-0 flex-col items-center gap-1.5">
      <div
        className={`relative grid h-[52px] w-[52px] place-items-center rounded-[17px] text-[13px] font-bold tracking-[-0.03em] text-white transition-transform ${selected ? "ring-2 ring-[#167d73] ring-offset-2" : ""}`}
        style={{ background: `linear-gradient(145deg, ${workspace.tone}, #253f4a)` }}
      >
        {workspace.initials}
        {workspace.count ? (
          <span className="absolute -right-1.5 -top-2 grid h-[21px] min-w-[21px] place-items-center rounded-full border-2 border-white bg-[#d86f55] px-1 text-[10px] font-bold text-white">
            {workspace.count}
          </span>
        ) : null}
      </div>
      <span className={`w-full truncate text-center text-[11px] ${selected ? "font-bold text-[#193c43]" : "text-[#66767a]"}`}>
        {workspace.name}
      </span>
    </div>
  );
}

export function WorkspaceInbox() {
  const [selectedId, setSelectedId] = useState("home");
  const [trayOpen, setTrayOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selectedWorkspace = workspaces.find((workspace) => workspace.id === selectedId) ?? workspaces[0];
  const visibleRecords = records[selectedId].filter((record) =>
    `${record.title} ${record.person} ${record.kind}`.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <main className="min-h-[100dvh] bg-[#f8faf8] px-3 py-4 text-[#193c43] sm:grid sm:place-items-center">
      <section className="relative mx-auto flex min-h-[844px] w-full max-w-[402px] flex-col overflow-hidden rounded-[30px] border border-[#dfeae5] bg-white shadow-[0_18px_55px_rgba(35,75,74,0.13)]">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[#167d73]" />
        <header className="px-5 pb-2 pt-7">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#78908e]">Your money, together</p>
              <h1 className="mt-1 font-serif text-[29px] leading-none tracking-[-0.045em] text-[#193c43]">Home</h1>
            </div>
            <div className="flex items-center gap-1">
              <button aria-label="Help" className="grid h-10 w-10 place-items-center rounded-full text-[#607875] transition-colors hover:bg-[#f0f6f3]"><CircleHelp size={19} strokeWidth={1.8} /></button>
              <button aria-label="Notifications" className="relative grid h-10 w-10 place-items-center rounded-full text-[#607875] transition-colors hover:bg-[#f0f6f3]"><Bell size={19} strokeWidth={1.8} /><span className="absolute right-2 top-1.5 h-1.5 w-1.5 rounded-full bg-[#d86f55]" /></button>
            </div>
          </div>
          <div className="mt-5 flex h-11 items-center gap-2 rounded-2xl bg-[#f3f7f5] px-3.5 text-[#7b8d8c]">
            <Search size={17} strokeWidth={1.8} />
            <input aria-label="Search money records" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search records" className="w-full bg-transparent text-[13px] text-[#193c43] outline-none placeholder:text-[#91a09f]" />
            {query ? <button aria-label="Clear search" onClick={() => setQuery("")}><X size={15} /></button> : null}
          </div>
        </header>

        <section className="border-b border-[#edf2ef] px-5 pb-5 pt-3">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[13px] font-bold text-[#526c6b]">Your workspaces</h2>
            <button className="flex items-center gap-0.5 text-[12px] font-semibold text-[#167d73]">Manage <ChevronRight size={14} /></button>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {workspaces.map((workspace) => (
              <button key={workspace.id} onClick={() => setSelectedId(workspace.id)} aria-label={`Open ${workspace.name}`} className="rounded-xl text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#167d73]">
                <Avatar workspace={workspace} selected={workspace.id === selectedId} />
              </button>
            ))}
          </div>
        </section>

        <section className="flex items-center justify-between px-5 py-5">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#e4f1ed] text-[#167d73]"><WalletCards size={21} strokeWidth={1.8} /></div>
            <div>
              <p className="text-[11px] text-[#7a8d8d]">{selectedWorkspace.detail}</p>
              <h2 className="mt-0.5 text-[17px] font-bold tracking-[-0.02em]">{selectedWorkspace.name}</h2>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-[0.11em] text-[#8a9d9a]">Balance</p>
            <p className="mt-1 text-[15px] font-bold text-[#193c43]">{selectedWorkspace.balance}</p>
          </div>
        </section>

        <div className="flex items-center justify-between px-5 pb-2">
          <h2 className="text-[13px] font-bold text-[#526c6b]">Recent records</h2>
          <button className="text-[12px] font-semibold text-[#167d73]">See all</button>
        </div>
        <section className="px-3 pb-24">
          {visibleRecords.length ? visibleRecords.map((record, index) => (
            <button key={`${record.title}-${index}`} className="flex w-full items-center gap-3 rounded-2xl px-2 py-3 text-left transition-colors hover:bg-[#f7faf8]">
              <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-[15px] ${record.direction === "in" ? "bg-[#e8f4ed] text-[#277d67]" : "bg-[#fff0eb] text-[#bc6650]"}`}>
                {record.direction === "in" ? <ArrowDownLeft size={19} strokeWidth={1.8} /> : <ArrowUpRight size={19} strokeWidth={1.8} />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-[14px] font-bold text-[#29484d]">{record.title}</p>
                  {record.status ? <span className="shrink-0 rounded-full bg-[#fff2d9] px-2 py-0.5 text-[9px] font-bold text-[#a86e1e]">{record.status}</span> : null}
                </div>
                <p className="mt-1 truncate text-[11px] text-[#80918f]">{record.person} · {record.date}</p>
              </div>
              <p className={`shrink-0 text-[13px] font-bold ${record.direction === "in" ? "text-[#267b67]" : "text-[#43575a]"}`}>{record.amount}</p>
            </button>
          )) : (
            <div className="rounded-2xl bg-[#f4f8f5] px-5 py-8 text-center">
              <FileText className="mx-auto text-[#9aadaa]" size={23} strokeWidth={1.6} />
              <p className="mt-2 text-[13px] font-semibold">No records found</p>
              <p className="mt-1 text-[11px] text-[#80918f]">Try another search.</p>
            </div>
          )}
          <button className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[#bcd4cc] py-3 text-[12px] font-bold text-[#167d73]"><ShieldCheck size={15} /> Records stay clear and accountable</button>
        </section>

        <div className="absolute bottom-5 right-5">
          {trayOpen ? (
            <div className="absolute bottom-[62px] right-0 flex w-[178px] flex-col gap-1 rounded-2xl border border-[#dce9e4] bg-white p-2 shadow-[0_10px_30px_rgba(33,76,73,0.16)]">
              {[["Money out", ArrowUpRight, "bg-[#fff0eb] text-[#bd6852]"], ["Money in", ArrowDownLeft, "bg-[#e8f4ed] text-[#277d67]"], ["Save", Sparkles, "bg-[#f0ebdc] text-[#98772f]"]].map(([label, Icon, tone]) => (
                <button key={label as string} onClick={() => setTrayOpen(false)} className="flex h-11 items-center gap-3 rounded-xl px-3 text-left text-[13px] font-bold text-[#29484d] hover:bg-[#f5f8f6]">
                  <span className={`grid h-7 w-7 place-items-center rounded-lg ${tone as string}`}><Icon size={15} strokeWidth={1.9} /></span>{label as string}
                </button>
              ))}
            </div>
          ) : null}
          <button aria-label={trayOpen ? "Close add menu" : "Add a money record"} onClick={() => setTrayOpen((open) => !open)} className={`grid h-14 w-14 place-items-center rounded-[19px] text-white shadow-[0_8px_20px_rgba(22,125,115,0.27)] transition-transform ${trayOpen ? "rotate-45 bg-[#d86f55]" : "bg-[#167d73]"}`}>
            <Plus size={25} strokeWidth={2} />
          </button>
        </div>
      </section>
    </main>
  );
}