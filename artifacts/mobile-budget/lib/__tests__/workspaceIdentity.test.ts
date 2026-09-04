import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('lib/workspaceIdentity.ts', 'utf8');

describe('workspaceBudgetName', () => {
  it('uses the fixed Personal budget name for private workspaces', () => {
    expect(source).toContain("if (workspace?.isPrivate) return 'Personal budget';");
  });

  it('preserves the exact shared workspace identity, including its emoji', () => {
    expect(source).toContain("return workspace ? workspaceIdentityText(workspace, 'Shared budget') : 'Shared budget';");
  });
});