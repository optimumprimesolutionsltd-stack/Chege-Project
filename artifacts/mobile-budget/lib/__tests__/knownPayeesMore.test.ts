import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { recognisedPlace } from '@/lib/commonCategories';
import { KNOWN_PAYEES_VERSION, knownPayeeOf } from '@/lib/knownPayees';
import { standardTargetFor } from '@/lib/standardCategory';

// "Do a deep dive for such logics in categories" and "implement backwards
// too" (9 Oct 2026): more Kenyan payees, and entries saved before a rule
// existed are filed by it as well.
const kind = (name: string) => knownPayeeOf(name)?.key ?? null;

describe('payees Jamvi now knows', () => {
  it.each([
    ['OLA Kahawa Sukari', 'fuel'], ['SHELL THIKA ROAD', 'fuel'], ['RUBIS JUJA', 'fuel'], ['Galana Energies', 'fuel'],
    ['Lake Oil Ruiru', 'fuel'], ['National Oil Embakasi', 'fuel'], ['Stabex Kitengela', 'fuel'], ['Engen Westlands', 'fuel'],
    ['Thika Water and Sewerage', 'water'], ['THIWASCO', 'water'], ['Rujwasco', 'water'], ['Nyeri Water NYEWASCO', 'water'],
    ['Uchumi Supermarket', 'groceries'], ['Gilanis Kileleshwa', 'groceries'], ['Brookside Dairy Shop', 'groceries'],
    ['Pharmaplus Yaya', 'medicine'], ['MyDawa', 'medicine'],
    ['Strathmore University', 'school-fees'], ['USIU Africa', 'school-fees'], ['JKUAT', 'school-fees'], ['Shule ya Msingi Kihara', 'school-fees'],
    ['PCEA St Andrews', 'giving'], ['Holy Family Basilica Parish', 'giving'], ['Jamia Mosque', 'giving'], ['CITAM Valley Road Church', 'giving'],
    ['Lee Funeral Home', 'funerals'], ['Harambee for Wanjiku', 'funerals'],
    ['SportPesa', 'betting'], ['Betika', 'betting'], ['Odibets', 'betting'], ['Mozzart Bet', 'betting'],
    ['Kilimani Heights Apartments', 'rent'], ['Riverside Court', 'rent'], ['Hass Properties', 'rent'], ['Lloyd Masika Property Management', 'rent'],
    ['G4S Kenya', 'security'], ['KK Security', 'security'],
    ['Spinners Car Wash', 'car-costs'], ['Kirinyaga Road Auto Spares', 'car-costs'], ['Bridgestone Tyres', 'car-costs'],
    ['Nairobi Expressway', 'tolls'], ['Moja Expressway', 'tolls'],
    ['Waterfront Gym', 'gym'], ['Zoezi Fitness', 'gym'],
    ['Juja Agrovet', 'farm-inputs'], ['Kenya Seed Company', 'farm-inputs'],
    ['Jumia Kenya', 'online-shopping'], ['Kilimall', 'online-shopping'],
    ['Hotpoint Appliances', 'electronics'], ['Avechi', 'electronics'], ['Phone World Moi Avenue', 'electronics'],
    ['Bata Shoe Shop', 'shoes'], ['School Uniforms Centre', 'school-fees'], ['Kim Uniforms', 'uniform'],
    ['Deacons Kenya', 'clothes'], ['Gikomba Mitumba', 'clothes'],
    ['Wachira Hardwares', 'house-repairs'], ['Ruiru Timber Yard', 'house-repairs'],
    ['Elegant Decor', 'decor'], ['Royal Interiors', 'decor'], ['Kamukunji Furniture', 'decor'],
    ['Kamau Traders', 'shop'], ['Juja General Merchants', 'shop'],
  ])('%s -> %s', (name, key) => {
    expect(kind(name)).toBe(key);
  });
});

describe('the first rule that fits wins', () => {
  it.each([
    ['Jumia Food', 'eating-out'],
    ['Amazon Prime Video', 'streaming'],
    ['Vet Clinic Karen', 'farm-inputs'],
    ['Kenyatta National Hospital', 'hospital'],
    ['St Marys Catholic Academy', 'school-fees'],
    ['Court View Restaurant', 'eating-out'],
    ['Shell Shop Westlands', 'fuel'],
    ['Lake Oil Service Station', 'fuel'],
    ['Insurance Agencies Ltd', 'medical-cover'],
  ])('%s -> %s', (name, key) => {
    expect(kind(name)).toBe(key);
  });
});

describe('fuel stations named the way statements write them', () => {
  // Two words in capitals must not be taken for a person's name.
  it.each(['OLA KAHAWA', 'SHELL JUJA', 'RUBIS RUIRU', 'Rubis Energy Kenya'])('%s is filed as fuel', (name) => {
    expect(recognisedPlace(name, ['Fuel'])?.name).toBe('Fuel');
  });

  it.each([['WACHIRA HARDWARES', 'House repairs'], ['KAMAU TRADERS', 'Groceries'], ['ELEGANT DECOR', 'Furniture & decor']])('%s is a business, filed under %s', (name, category) => {
    expect(recognisedPlace(name, [category])?.name).toBe(category);
  });

  it('a person is still a person', () => {
    expect(recognisedPlace('Mary Wanjiku', ['Groceries'])).toBeNull();
  });
});

describe('each new kind has a common category in its place', () => {
  it.each([
    ['Kilimani Heights Apartments', 'Rent', 'Housing'],
    ['PCEA St Andrews', 'Tithe', 'Tithe & giving'],
    ['SportPesa', 'Betting', 'Entertainment'],
    ['Spinners Car Wash', 'Car maintenance', 'Transport'],
    ['G4S Kenya', 'Security', 'Household'],
    ['Juja Agrovet', 'Farm inputs', 'Farm'],
    ['Bata Shoe Shop', 'Shoes', 'Clothing'],
  ])('%s -> %s under %s', (name, category, heading) => {
    expect(standardTargetFor(name)).toMatchObject({ name: category, parent: heading });
  });
});

describe('implemented backwards too', () => {
  it('the old entries are filed again whenever the rules change', () => {
    expect(KNOWN_PAYEES_VERSION).toMatch(/^[0-9a-z]+$/);
    const hook = readFileSync('hooks/useCommonCategories.ts', 'utf8');
    expect(hook).toContain('`jamvi:recognised-sorted:${KNOWN_PAYEES_VERSION}:${groupId}`');
    // Still only Not sure yet entries: what the person filed is never moved.
    expect(hook).toContain("customFetch<{ entries: EntryToSort[] }>('/api/entries-to-sort'");
  });
});
