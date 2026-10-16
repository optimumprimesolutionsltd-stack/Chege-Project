import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Readying Jamvi for Google Play (docs/play-store, 9 Oct 2026).
const read = (path: string) => readFileSync(path, 'utf8');

describe('ready for Google Play', () => {
  it('asks for no camera: a profile photo comes from the library', () => {
    expect(read('app.config.js')).toContain("'android.permission.CAMERA',");
    expect(read('app/(tabs)/settings.tsx')).not.toContain('launchCameraAsync');
  });

  it("says before Android asks that M-Pesa's messages are sent to Jamvi to be read, and not kept", () => {
    const screen = read('app/mpesa-import.tsx');
    expect((screen.match(/sent to Jamvi to be read/g) ?? []).length).toBe(2);
  });

  it('has a page for deleting an account, and names who handles payments and Ask Jamvi', () => {
    const privacy = read('../jamvi-website/src/pages/privacy.tsx');
    expect(privacy).toContain('<h3 id="delete-account">Deleting your account</h3>');
    expect(privacy).toContain('<strong>Safaricom</strong>');
    expect(privacy).toContain('<strong>An AI model provider</strong>');
  });
});
