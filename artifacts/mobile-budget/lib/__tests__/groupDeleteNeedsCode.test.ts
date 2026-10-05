import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cleanConfirmInput, confirmBody, confirmReady, typedWord } from '../deletionConfirm';

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
    expect(screen).toContain('body: JSON.stringify(confirmBody(code, word))');
  });
  it('is registered without a back gesture', () => {
    expect(read('app/_layout.tsx')).toContain('<Stack.Screen name="delete-group-code" options={{ headerShown: false, gestureEnabled: false }} />');
  });
});


// An account with no email can never get a code (5 Oct 2026).
describe('confirming a deletion without an email', () => {
  it('types the word the server names instead of a code', () => {
    expect(typedWord({ sent: true })).toBeNull();
    expect(typedWord({ sent: false, confirmWith: 'DELETE' })).toBe('DELETE');
    expect(cleanConfirmInput('del ete1', 'DELETE')).toBe('DELETE');
    expect(confirmReady('DELET', 'DELETE')).toBe(false);
    expect(confirmReady('DELETE', 'DELETE')).toBe(true);
    expect(confirmBody('DELETE', 'DELETE')).toEqual({ confirm: 'DELETE' });
    expect(confirmBody('123456', null)).toEqual({ code: '123456' });
    expect(confirmReady('12345', null)).toBe(false);
  });
});
