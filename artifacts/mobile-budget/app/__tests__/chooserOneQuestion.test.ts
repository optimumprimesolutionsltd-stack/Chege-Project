import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const phone = readFileSync(join(__dirname, '..', 'budget-chooser.tsx'), 'utf8');
const web = readFileSync(join(__dirname, '..', '..', '..', 'family-budget', 'src', 'components', 'budget-chooser.tsx'), 'utf8');

// "Why have two workspaces asking the same question?" - a tap in the list opens
// a workspace, so a "Ready to open" card above it asked again.
describe('the workspace chooser asks once', () => {
  it('has no Ready to open card on the phone or the web', () => {
    expect(phone).not.toContain('READY TO OPEN');
    expect(phone).not.toContain('testID="open-selected-budget"');
    expect(web).not.toContain('Ready to open');
  });

  it('opens a workspace straight from the list', () => {
    expect(phone).toContain('onPress={() => { setError(null); setSelectedWorkspaceId(workspace.id); void chooseWorkspace(workspace); }}');
  });

  it('still shows the next step for somebody who wants a group and has none', () => {
    expect(phone).toContain('{!selectedWorkspace && prefersShared ? (');
    expect(phone).toContain('testID="create-shared-budget-primary"');
    expect(web).toContain('{!selectedWorkspace && onboardingMode === "shared" ? (');
  });
});
