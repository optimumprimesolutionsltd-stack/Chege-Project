import { useState } from "react";
import { Link } from "wouter";
import { Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { readMpesaCard, rememberMpesaCard, shouldShowMpesaCard } from "@/lib/mpesa-card";

/**
 * The first thing on the dashboard until it has been used: Jamvi's best trick.
 * Your M-Pesa month, filled in for you, instead of typed in.
 */
export function MpesaImportCard() {
  const [show, setShow] = useState(() => shouldShowMpesaCard(readMpesaCard()));
  if (!show) return null;
  return (
    <Card className="border-2 border-primary" data-testid="mpesa-home-card">
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted text-primary">
            <Smartphone className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <p className="text-xs font-bold tracking-wider text-primary">START HERE</p>
            <p className="text-lg font-bold text-foreground">Your M-Pesa month, sorted in minutes</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Import your M-Pesa statement or paste your messages, and Jamvi fills in what you spent, on what and who paid you.
          A statement is read on your computer and never uploaded.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/mpesa-import">
            <Button onClick={() => { rememberMpesaCard("done"); setShow(false); }} data-testid="mpesa-home-card-open">Import my M-Pesa</Button>
          </Link>
          <Button variant="ghost" onClick={() => { rememberMpesaCard("dismissed"); setShow(false); }} data-testid="mpesa-home-card-later">Not now</Button>
        </div>
      </CardContent>
    </Card>
  );
}
