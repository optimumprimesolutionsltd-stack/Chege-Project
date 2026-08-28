import { useSeo } from "@/hooks/use-seo";
import { motion } from "framer-motion";

export default function About() {
  useSeo({
    title: "About Us - The story behind the mat",
    description: "Learn why we built Jamvi and our mission to bring trust and clarity to Kenyan finances.",
  });

  return (
    <div className="flex flex-col min-h-screen bg-white">
      {/* Hero */}
      <section className="pt-24 pb-16 bg-primary text-primary-foreground">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl text-center">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 font-serif text-white"
          >
            The story of the mat.
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-lg md:text-xl text-primary-foreground/80 leading-relaxed"
          >
            In Swahili, a <em>Jamvi</em> is a woven mat. It’s where elders gather to resolve issues, where families sit to share meals, and where communities meet to make plans. 
          </motion.p>
        </div>
      </section>

      {/* Content */}
      <section className="py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-3xl">
          <div className="prose prose-lg md:prose-xl prose-headings:font-serif prose-headings:text-primary prose-p:text-foreground/80 mx-auto">
            <h2 className="text-3xl font-bold mb-6 mt-0">Why we built Jamvi</h2>
            <p>
              Money is deeply personal, yet inherently communal. In Kenya, our financial lives are intertwined. We contribute to wedding committees, we pay school fees for relatives, we save together in chamas, and we pool resources to buy land.
            </p>
            <p>
              But the tools we use to manage this shared money are broken.
            </p>
            <p>
              We rely on chaotic WhatsApp groups where receipts get lost in the chat. We use fragile Excel spreadsheets that only the treasurer understands. This lack of clarity breeds suspicion, delays progress, and ultimately breaks down the very trust that these groups rely on.
            </p>
            
            <div className="my-12 p-8 bg-secondary/10 rounded-3xl border border-secondary/20">
              <h3 className="text-2xl font-bold text-secondary mb-4 mt-0">Our Mission</h3>
              <p className="text-foreground font-medium m-0 leading-relaxed">
                To build the digital mat where individuals and groups can manage money with absolute clarity, absolute warmth, and unbreakable trust.
              </p>
            </div>

            <h2 className="text-3xl font-bold mb-6">Designed for Trust</h2>
            <p>
              We didn't want to build another sterile, intimidating fintech dashboard. Money causes enough anxiety on its own. Jamvi is designed to feel warm, human, and grounded. 
            </p>
            <p>
              Every feature—from the immutable history logs to the clear, friendly typography—is chosen to remove friction and foster transparency. When everyone can see exactly what came in, what went out, and who paid for what, the conversation shifts from "where is the money?" to "what can we achieve together?"
            </p>
            <p>
              So, take off your shoes. Take a seat on the mat. Let's manage our money better, together.
            </p>
          </div>
        </div>
      </section>
      
      {/* Brand visuals */}
      <section className="py-20 bg-muted/30 border-t border-border">
        <div className="container mx-auto px-4 text-center">
           <img src={`${import.meta.env.BASE_URL}branding/jamvi-wordmark.png`} alt="Jamvi Logo" className="w-auto h-24 mx-auto object-contain opacity-80 mix-blend-multiply" />
        </div>
      </section>
    </div>
  );
}
