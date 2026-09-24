import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

// Deleting a group needs the same emailed-code approval as deleting an account.
describe('mobile: deleting a group goes through the emailed code', () => {
  it('Delete group only leads to the code screen and never deletes by itself', () => {
    const settings = read('app/(tabs)/settings.tsx');
    const handler = settings.slice(settings.indexOf('const handleDeleteGroup'), settings.indexOf('const handleDeleteGroup') + 900);
    expect(handler).toContain("router.push('/delete-group-code')");
    expect(handler).not.toContain("method: 'DELETE'");
  });
  it('the code screen requests a code, then deletes with it', () => {
    const screen = read('app/delete-group-code.tsx');
    expect(screen).toContain("'/api/group/delete/request-code'");
    expect(screen).toContain("customFetch('/api/group', {\n          method: 'DELETE',");
    expect(screen).toContain('body: JSON.stringify({ code })');
  });
  it('is registered without a back gesture', () => {
    expect(read('app/_layout.tsx')).toContain('<Stack.Screen name="delete-group-code" options={{ headerShown: false, gestureEnabled: false }} />');
  });
});
