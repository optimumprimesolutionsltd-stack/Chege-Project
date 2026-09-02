import { 
  MpesaParseResult, 
  MpesaParseResultStatus
} from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle2, HelpCircle, XCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface ParseResultProps {
  result: MpesaParseResult | null;
  isLoading: boolean;
}

export function ParseResult({ result, isLoading }: ParseResultProps) {
  if (isLoading) {
    return (
      <Card className="h-full border-border/50 shadow-sm animate-pulse bg-muted/20">
        <CardHeader>
          <div className="h-6 w-1/3 bg-muted rounded mb-2"></div>
          <div className="h-4 w-1/2 bg-muted rounded"></div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="h-4 w-full bg-muted rounded"></div>
          <div className="h-4 w-full bg-muted rounded"></div>
          <div className="h-4 w-3/4 bg-muted rounded"></div>
        </CardContent>
      </Card>
    );
  }

  if (!result) {
    return (
      <Card className="h-full border-dashed border-border/50 bg-muted/10 flex flex-col items-center justify-center p-12 text-center">
        <div className="rounded-full bg-muted p-4 mb-4">
          <HelpCircle className="h-8 w-8 text-muted-foreground" />
        </div>
        <CardTitle className="text-xl mb-2">Awaiting Input</CardTitle>
        <CardDescription className="max-w-xs mx-auto">
          Paste an anonymised M-Pesa message in the field to see how the deterministic parser interprets it.
        </CardDescription>
      </Card>
    );
  }

  const getStatusIcon = (status: MpesaParseResultStatus) => {
    switch (status) {
      case 'parsed': return <CheckCircle2 className="h-5 w-5 text-primary" />;
      case 'unsupported': return <AlertCircle className="h-5 w-5 text-amber-500" />;
      case 'invalid': return <XCircle className="h-5 w-5 text-destructive" />;
    }
  };

  const getConfidenceBadge = (confidence: string) => {
    switch (confidence) {
      case 'high': return <Badge variant="default" className="bg-primary/20 text-primary hover:bg-primary/30">High Confidence</Badge>;
      case 'medium': return <Badge variant="secondary" className="bg-amber-500/20 text-amber-700 hover:bg-amber-500/30">Medium Confidence</Badge>;
      case 'low': return <Badge variant="secondary" className="bg-destructive/20 text-destructive hover:bg-destructive/30">Low Confidence</Badge>;
      default: return <Badge variant="outline" className="text-muted-foreground">None</Badge>;
    }
  };

  const tx = result.transaction;

  return (
    <Card className="h-full shadow-sm flex flex-col overflow-hidden border-border/60" data-testid="card-parse-result">
      <CardHeader className="bg-muted/30 border-b border-border/30 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl">
              {getStatusIcon(result.status)}
              <span className="capitalize" data-testid="text-result-status">
                {result.status} Result
              </span>
            </CardTitle>
            <CardDescription className="mt-1.5">
              Parser Version: <span className="font-mono bg-muted px-1 py-0.5 rounded text-xs">{tx?.parserVersion || 'Unknown'}</span>
            </CardDescription>
          </div>
          {getConfidenceBadge(result.confidence)}
        </div>
      </CardHeader>

      <CardContent className="flex-1 p-0 overflow-y-auto">
        {result.warnings.length > 0 && (
          <div className="p-4 border-b border-border/30">
            <Alert variant="destructive" className="bg-amber-500/10 text-amber-800 border-amber-500/30">
              <AlertCircle className="h-4 w-4 !text-amber-700" />
              <AlertTitle className="!text-amber-800 font-semibold">Parse Warnings</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-4 mt-1 space-y-1 text-sm">
                  {result.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          </div>
        )}

        <div className="p-4">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">Extracted Fields</h3>
          
          {result.status === 'invalid' && !tx ? (
            <div className="text-center py-8 text-muted-foreground">
              The message could not be parsed as a valid M-Pesa transaction.
            </div>
          ) : tx ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              {/* Only render fields that are not null/empty */}
              <Field label="Transaction Type" value={tx.transactionType} />
              <Field label="Purchase Category" value={tx.purchaseCategory} />
              <Field label="Transaction ID" value={tx.transactionId} />
              <Field label="Amount" value={tx.amount !== null ? `${tx.currency || 'KES'} ${tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : null} />
              <Field label="Merchant/Counterparty" value={tx.merchantOrCounterparty} />
              <Field label="Phone Number" value={tx.phoneNumber} />
              <Field label="Date" value={tx.date} />
              <Field label="Time" value={tx.time} />
              <Field label="M-Pesa Balance" value={tx.mpesaBalance !== null ? `${tx.currency || 'KES'} ${tx.mpesaBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : null} />
              <Field label="Fee" value={tx.fee !== null ? `${tx.currency || 'KES'} ${tx.fee.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : null} />
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No transaction fields were extracted.
            </div>
          )}
        </div>

        <div className="p-4 bg-muted/10 border-t border-border/30 mt-auto">
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Normalized Message View</h3>
          <div className="text-xs font-mono p-3 bg-muted rounded-md text-muted-foreground whitespace-pre-wrap break-words leading-relaxed" data-testid="text-normalized-message">
            {result.normalizedMessage}
          </div>
          <p className="text-[10px] text-muted-foreground/70 mt-2">
            This is what the parser actually sees after personal numbers are redacted.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value === null || value === undefined || value === '') return null;
  
  return (
    <div className="flex flex-col gap-1 border-b border-border/20 pb-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-medium text-sm text-foreground break-words" data-testid={`field-${label.toLowerCase().replace(/[\s/]/g, '-')}`}>
        {value}
      </span>
    </div>
  );
}
