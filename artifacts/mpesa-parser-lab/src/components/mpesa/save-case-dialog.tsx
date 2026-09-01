import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface SaveCaseDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (name: string) => void;
  messageText: string;
}

export function SaveCaseDialog({ isOpen, onOpenChange, onSave, messageText }: SaveCaseDialogProps) {
  const [name, setName] = useState('');

  const handleSave = () => {
    if (!name.trim()) return;
    onSave(name.trim());
    setName('');
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Save as Test Case</DialogTitle>
          <DialogDescription>
            This will save the current message to your browser's local storage so you can quickly re-test it later.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Test Case Name</Label>
            <Input
              id="name"
              placeholder="e.g., Paybill with zero fee"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              autoFocus
              data-testid="input-test-case-name"
            />
          </div>
          <div className="space-y-2">
            <Label>Message Snippet</Label>
            <div className="text-xs text-muted-foreground bg-muted p-2 rounded-md line-clamp-2">
              {messageText.slice(0, 100)}{messageText.length > 100 ? '...' : ''}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-save">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim()} data-testid="button-confirm-save">
            Save Test Case
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
