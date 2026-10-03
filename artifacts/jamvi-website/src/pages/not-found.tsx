import { useSeo } from "@/hooks/use-seo";
import { SITE_SEO } from "@/lib/site-seo";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";

export default function NotFound() {
  useSeo(SITE_SEO["/404"]);

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center bg-card px-4 text-center">
      <div className="w-24 h-24 rounded-[3px] bg-muted flex items-center justify-center mb-8">
        <span className="text-4xl font-serif text-primary/30">?</span>
      </div>
      <h1 className="text-5xl font-bold text-primary mb-4 font-serif">Oops!</h1>
      <p className="text-xl text-foreground/70 mb-10 max-w-md">
        Looks like you stepped off the mat. We can't find the page you're looking for.
      </p>
      <Link href="/" className="btn-mat h-14 px-8 text-base">
        <ArrowLeft className="mr-2 h-5 w-5" /> Back to Home
      </Link>
    </div>
  );
}
