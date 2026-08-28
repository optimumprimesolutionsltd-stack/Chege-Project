import { useSeo } from "@/hooks/use-seo";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";

export default function NotFound() {
  useSeo({
    title: "Page Not Found",
    description: "The Jamvi page you are looking for does not exist.",
  });

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center bg-white px-4 text-center">
      <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center mb-8">
        <span className="text-4xl font-serif text-primary/30">?</span>
      </div>
      <h1 className="text-5xl font-bold text-primary mb-4 font-serif">Oops!</h1>
      <p className="text-xl text-foreground/70 mb-10 max-w-md">
        Looks like you stepped off the mat. We can't find the page you're looking for.
      </p>
      <Link href="/" className="inline-flex items-center justify-center h-14 px-8 rounded-full bg-primary text-white font-bold hover:bg-primary/90 transition-colors">
        <ArrowLeft className="mr-2 h-5 w-5" /> Back to Home
      </Link>
    </div>
  );
}
