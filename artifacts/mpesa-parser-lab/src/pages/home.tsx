import { useState } from 'react';
import { useParseMpesaMessage } from '@workspace/api-client-react';
import { useTestCases } from '@/hooks/use-test-cases';
import { ParserLayout } from '@/components/parser-layout';
import { ParseResult } from '@/components/mpesa/parse-result';
import { TestCasesSidebar } from '@/components/mpesa/test-cases-sidebar';
import { SaveCaseDialog } from '@/components/mpesa/save-case-dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ShieldCheck, Play, Eraser, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function Home() {
  const [message, setMessage] = useState('');
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [isRunningAll, setIsRunningAll] = useState(false);
  const { testCases, saveTestCase, updateTestCaseStatus, deleteTestCase } = useTestCases();
  const { toast } = useToast();
  
  const parseMutation = useParseMpesaMessage();

  const handleParse = (textToParse: string) => {
    if (!textToParse.trim()) return;
    
    // Set message text in case it was triggered from sidebar
    setMessage(textToParse);
    
    parseMutation.mutate(
      { data: { message: textToParse } },
      {
        onError: (error) => {
          toast({
            title: 'Parsing Failed',
            description: error instanceof Error ? error.message : 'An unexpected error occurred',
            variant: 'destructive',
          });
        }
      }
    );
  };

  const handleClear = () => {
    setMessage('');
    parseMutation.reset();
  };

  const handleSaveTestCase = (name: string) => {
    const newCase = saveTestCase({
      name,
      message,
      lastStatus: parseMutation.data?.status,
      lastConfidence: parseMutation.data?.confidence,
    });
    
    toast({
      title: 'Saved',
      description: 'Test case saved locally to your browser.',
    });
  };

  const handleRunTestCase = async (id: string, testCaseMessage: string) => {
    setMessage(testCaseMessage);
    try {
      const result = await parseMutation.mutateAsync({ data: { message: testCaseMessage } });
      updateTestCaseStatus(id, result.status, result.confidence);
    } catch (error) {
      toast({
        title: 'Test Run Failed',
        description: error instanceof Error ? error.message : 'The parser could not run this test case.',
        variant: 'destructive',
      });
    }
  };

  const handleRunAll = async () => {
    if (testCases.length === 0) return;
    setIsRunningAll(true);
    try {
      for (const testCase of testCases) {
        const result = await parseMutation.mutateAsync({ data: { message: testCase.message } });
        updateTestCaseStatus(testCase.id, result.status, result.confidence);
      }
      toast({
        title: 'Test Run Complete',
        description: `${testCases.length} saved ${testCases.length === 1 ? 'case' : 'cases'} checked against the current parser.`,
      });
    } catch (error) {
      toast({
        title: 'Test Run Stopped',
        description: error instanceof Error ? error.message : 'A saved case could not be checked.',
        variant: 'destructive',
      });
    } finally {
      setIsRunningAll(false);
    }
  };

  return (
    <ParserLayout>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
        
        {/* Main interactive area */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          
          <Card className="shadow-sm border-border/60">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  Input Message
                </h2>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded-md">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>Anonymize private details</span>
                </div>
              </div>
              
              <Textarea
                placeholder="Paste the M-Pesa SMS confirmation here..."
                className="min-h-[160px] font-mono text-sm resize-y mb-4"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                data-testid="textarea-mpesa-message"
              />
              
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Button 
                    onClick={() => handleParse(message)} 
                    disabled={!message.trim() || parseMutation.isPending}
                    className="min-w-[120px]"
                    data-testid="button-parse-message"
                  >
                    {parseMutation.isPending ? 'Parsing...' : (
                      <>
                        <Play className="h-4 w-4 mr-2" />
                        Parse Message
                      </>
                    )}
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={handleClear}
                    disabled={!message && !parseMutation.data}
                    data-testid="button-clear"
                  >
                    <Eraser className="h-4 w-4 mr-2" />
                    Clear
                  </Button>
                </div>
                
                {parseMutation.data && (
                  <Button 
                    variant="secondary" 
                    onClick={() => setIsSaveDialogOpen(true)}
                    className="bg-primary/10 text-primary hover:bg-primary/20"
                    data-testid="button-save-as-test-case"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    Save as Test Case
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="flex-1 min-h-[400px]">
            <ParseResult 
              result={parseMutation.data || null} 
              isLoading={parseMutation.isPending} 
            />
          </div>
        </div>

        {/* Sidebar */}
        <div className="h-[600px] lg:h-auto lg:sticky lg:top-24">
          <TestCasesSidebar 
            testCases={testCases}
            onRunCase={handleRunTestCase}
             onRunAll={handleRunAll}
            onDeleteCase={deleteTestCase}
             isRunningAll={isRunningAll}
          />
        </div>

      </div>

      <SaveCaseDialog 
        isOpen={isSaveDialogOpen}
        onOpenChange={setIsSaveDialogOpen}
        onSave={handleSaveTestCase}
        messageText={message}
      />
    </ParserLayout>
  );
}
