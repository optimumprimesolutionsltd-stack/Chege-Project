import { describe, expect, it } from 'vitest';
import { resolveScheme, VALID_APPEARANCES } from '@/lib/appearance';

describe('resolveScheme', () => {
  it('forces dark for "midnight" regardless of the phone', () => {
    expect(resolveScheme('midnight', 'light')).toBe('dark');
    expect(resolveScheme('midnight', 'dark')).toBe('dark');
    expect(resolveScheme('midnight', null)).toBe('dark');
  });

  it('forces light for "white" regardless of the phone', () => {
    expect(resolveScheme('white', 'dark')).toBe('light');
    expect(resolveScheme('white', 'light')).toBe('light');
    expect(resolveScheme('white', undefined)).toBe('light');
  });

  it('follows the phone for "system", defaulting to light when unknown', () => {
    expect(resolveScheme('system', 'dark')).toBe('dark');
    expect(resolveScheme('system', 'light')).toBe('light');
    expect(resolveScheme('system', null)).toBe('light');
    expect(resolveScheme('system', undefined)).toBe('light');
  });

  it('lists the three valid choices', () => {
    expect(VALID_APPEARANCES).toEqual(['system', 'white', 'midnight']);
  });
});
