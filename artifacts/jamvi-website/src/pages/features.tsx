import { useSeo } from "@/hooks/use-seo";
import { motion } from "framer-motion";
import { 
  PieChart, 
  History, 
  Target, 
  Users, 
  ShieldCheck, 
  Smartphone,
  CheckCircle
} from "lucide-react";

export default function Features() {
  useSeo({
    title: "Features - Everything you need",
    description: "Discover how Jamvi helps you track personal spending and manage group finances seamlessly.",
  });

  const features = [
    {
      icon: PieChart,
      title: "Clear Categorization",
      desc: "Automatically sort your expenses into categories that make sense for your lifestyle. See exactly where the bulk of your money goes each month."
    },
    {
      icon: History,
      title: "Transparent History",
      desc: "Every transaction, contribution, and adjustment is recorded with timestamps and payer details. Never argue over who paid for what again."
    },
    {
      icon: Target,
      title: "Shared Goals",
      desc: "Set up specific savings targets for your group. Watch the progress bar fill up as members contribute towards the shared vision."
    },
    {
      icon: Users,
      title: "Multiple Workspaces",
      desc: "Keep your personal budget separate from your family expenses and your chama contributions. Switch between them with a single tap."
    },
    {
      icon: ShieldCheck,
      title: "Granular Permissions",
      desc: "Group admins can control who can add expenses, invite members, or edit goals, keeping your shared money secure and organized."
    },
    {
      icon: Smartphone,
      title: "Mobile Optimized",
      desc: "Built to work flawlessly on the web and on your phone. Log expenses on the go, right when they happen."
    }
  ];

  return (
    <div className="flex flex-col min-h-screen bg-white">
      {/* Header */}
      <section className="pt-24 pb-16 bg-muted/30 border-b border-border">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl text-center">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl md:text-5xl lg:text-6xl font-bold text-primary mb-6 font-serif"
          >
            Everything you need,<br />nothing you don't.
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-lg md:text-xl text-foreground/70 max-w-2xl mx-auto leading-relaxed"
          >
            We stripped away the confusing jargon and complex accounting tools to build an interface that feels natural, fast, and trustworthy.
          </motion.p>
        </div>
      </section>

      {/* Feature Grid */}
      <section className="py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
            {features.map((feat, index) => (
              <motion.div 
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="p-8 rounded-3xl bg-white border border-border hover:shadow-xl hover:border-secondary/30 transition-all group"
              >
                <div className="w-14 h-14 rounded-2xl bg-secondary/10 text-secondary flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <feat.icon className="w-7 h-7" />
                </div>
                <h3 className="text-xl font-bold text-primary mb-3">{feat.title}</h3>
                <p className="text-foreground/70 leading-relaxed">
                  {feat.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Deep Dive Section */}
      <section className="py-24 bg-primary text-white overflow-hidden relative">
        <div className="absolute top-0 right-0 w-1/2 h-full bg-secondary/20 blur-[100px] rounded-full pointer-events-none"></div>
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div className="order-2 lg:order-1">
              <div className="bg-white/10 backdrop-blur-md p-8 rounded-[2.5rem] border border-white/20">
                <div className="space-y-6">
                  {[
                    { title: "Personal Finances", items: ["Track individual spending", "Set personal monthly budgets", "Review category breakdowns"] },
                    { title: "Chama & Group Funds", items: ["Invite members via link", "Track individual contributions", "Assign expenses to members", "Maintain a transparent audit log"] }
                  ].map((block, i) => (
                    <div key={i} className="bg-primary/40 rounded-2xl p-6">
                      <h4 className="font-serif text-xl font-bold mb-4 text-accent">{block.title}</h4>
                      <ul className="space-y-3">
                        {block.items.map((item, j) => (
                          <li key={j} className="flex items-start gap-3">
                            <CheckCircle className="w-5 h-5 text-secondary flex-shrink-0 mt-0.5" />
                            <span className="font-medium text-white/90">{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="order-1 lg:order-2">
              <h2 className="text-3xl md:text-4xl font-bold mb-6 font-serif">One platform. Two modes.</h2>
              <p className="text-lg text-white/80 mb-8 leading-relaxed">
                Jamvi recognizes that the way you manage your own money is fundamentally different from how you manage a group's money. 
                That's why we built tailored experiences for both, seamlessly integrated into one app.
              </p>
              <a href="https://jamvi.app/register" className="inline-flex items-center justify-center h-14 px-8 rounded-full bg-accent text-accent-foreground font-bold hover:bg-accent/90 transition-transform hover:scale-105 active:scale-95">
                Experience it now
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
