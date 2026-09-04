import { TestCase } from '@/hooks/use-test-cases';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Play, Trash2, Clock, CheckCircle2, AlertCircle, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface TestCasesSidebarProps {
  testCases: TestCase[];
  onRunCase: (id: string, message: string) => void;
  onRunAll: () => void;
  onDeleteCase: (id: string) => void;
  isRunningAll: boolean;
}

export function TestCasesSidebar({ testCases, onRunCase, onRunAll, onDeleteCase, isRunningAll }: TestCasesSidebarProps) {
  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'parsed': return <CheckCircle2 className="h-4 w-4 text-primary" />;
      case 'unsupported': return <AlertCircle className="h-4 w-4 text-amber-500" />;
      case 'invalid': return <XCircle className="h-4 w-4 text-destructive" />;
      default: return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getConfidenceColor = (confidence?: string) => {
    switch (confidence) {
      case 'high': return 'bg-primary/20 text-primary';
      case 'medium': return 'bg-amber-500/20 text-amber-700';
      case 'low': return 'bg-destructive/20 text-destructive';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <Card className="h-full shadow-sm flex flex-col border-border/60">
      <CardHeader className="bg-muted/20 border-b border-border/30 pb-4">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-lg">Saved Test Cases</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={onRunAll}
            disabled={testCases.length === 0 || isRunningAll}
            data-testid="button-run-all-cases"
          >
            <Play className="h-3.5 w-3.5 mr-1.5" />
            {isRunningAll ? 'Running...' : 'Run all'}
          </Button>
        </div>
        <CardDescription>
          Locally saved examples to verify parser changes. Stays in this browser only.
        </CardDescription>
      </CardHeader>
      
      <CardContent className="flex-1 p-0 overflow-y-auto min-h-[300px]">
        {testCases.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center h-full text-muted-foreground">
            <div className="rounded-full bg-muted p-3 mb-3">
              <Clock className="h-6 w-6" />
            </div>
            <p className="text-sm">No test cases saved yet.</p>
            <p className="text-xs mt-1 max-w-[200px]">
              Parse a message and click "Save as Test Case" to add one here.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border/30">
            {testCases.map((tc) => (
              <li key={tc.id} className="p-4 hover:bg-muted/10 transition-colors group" data-testid={`test-case-item-${tc.id}`}>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 font-medium text-sm">
                    {getStatusIcon(tc.lastStatus)}
                    <span className="line-clamp-1 break-all">{tc.name}</span>
                  </div>
                  <div className="flex items-center gap-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => onDeleteCase(tc.id)}
                      data-testid={`button-delete-case-${tc.id}`}
                      title="Delete test case"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="secondary" 
                      size="sm" 
                      className="h-7 px-2 text-xs bg-primary/10 text-primary hover:bg-primary/20"
                      onClick={() => onRunCase(tc.id, tc.message)}
                      data-testid={`button-run-case-${tc.id}`}
                    >
                      <Play className="h-3 w-3 mr-1" />
                      Run
                    </Button>
                  </div>
                </div>
                
                <div className="text-xs text-muted-foreground line-clamp-2 bg-muted/30 p-2 rounded border border-border/30 font-mono mb-2">
                  {tc.message}
                </div>
                
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-muted-foreground">
                    Added {new Date(tc.createdAt).toLocaleDateString()}
                  </span>
                  {tc.lastConfidence && (
                    <Badge variant="outline" className={`text-[9px] px-1.5 py-0 border-none ${getConfidenceColor(tc.lastConfidence)}`}>
                      {tc.lastConfidence} conf
                    </Badge>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
