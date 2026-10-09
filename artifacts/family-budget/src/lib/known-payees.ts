/**
 * Payees whose category is obvious from the name alone - Kenya Power, a
 * supermarket, a petrol station - so the first payment to one is not left on
 * "Not sure yet" just because the budget has never paid it before.
 *
 * Used after the person"s own rules and history. Since 9 Oct 2026 Jamvi files
 * these itself ("all the recognized categories should be as per the app subject
 * to the user changing"): under the budget"s own category for the kind of payee,
 * or a common one it makes the first time one appears (lib/standardCategory). Each payee lists the categories it fits, most specific
 * first, by exact name and then by words a category"s name may contain. Broad
 * names that are usually headings (Utilities, Food, Transport, Health) are left
 * out on purpose: money cannot be filed under a heading.
 */

type KnownPayee = {
  /** Stable name for this kind of payee: what a budget"s own category for it is remembered by (setStandardLinks). */
  key: string;
  /** Matched against the payee as the message or statement names it. */
  pattern: RegExp;
  /** Category names this payee fits, exactly (ignoring case), best first. */
  names: readonly string[];
  /** Words a budget"s own category name may contain instead, best first. */
  words: readonly string[];
  /**
   * The common category Jamvi makes for it when the budget has none: a name and
   * the heading it goes under (lib/standardCategory). None for payees whose
   * spending could be anything (KRA, eCitizen).
   */
  standard?: { name: string; parent: string };
};

// Most specific first: the first pattern that matches wins, so "butchery &
// grill" is eating out before "butchery" is groceries, insurers come before
// "medical", and a plain "shop" is only tried last.
const KNOWN_PAYEES: readonly KnownPayee[] = [
  {
    key: "electricity",
    pattern: /\b(?:kplc|kenya power)\b/i,
    names: ["Electricity"],
    words: ["electric", "power", "kplc", "token"],
    standard: { name: "Electricity", parent: "Utilities" },
  },
  {
    key: "water",
    pattern: /\b(?:nairobi city water|ncwsc|water (?:and|&) sewerage|water (?:company|services|vendors?)|mawasco|nawassco|eldowas|kiwasco|mowasco|nyewasco|borehole)\b/i,
    names: ["Water"],
    words: ["water"],
    standard: { name: "Water", parent: "Utilities" },
  },
  {
    key: "garbage",
    pattern: /\b(?:garbage|refuse collection|waste (?:management|collection|collectors?))\b/i,
    names: ["Garbage collection"],
    words: ["garbage", "waste", "refuse"],
    standard: { name: "Garbage collection", parent: "Utilities" },
  },
  {
    key: "eating-out",
    // Before groceries: a butchery that grills, and a supermarket"s own cafe, are eating out.
    pattern: /\b(?:kfc|java house|artcaffe|pizza inn|chicken inn|dominos?|galitos|simbisa|bolt food|uber eats|glovo|jumia food|restaurants?|eatery|eateries|bistro|hotels?|kitchens?|foods?|fast ?foods?|cafeteria|canteen|grill|nyama choma|choma|kibanda|kibandaski|pizza|burgers?|chips|bakery|bakers|bakeries|dishes)\b|\bcaf[eé](?![a-z])/i,
    names: ["Eating out", "Meals", "Lunch", "Food & drinks"],
    words: ["eating out", "restaurant", "meal", "lunch"],
    standard: { name: "Eating out", parent: "Food" },
  },
  {
    key: "groceries",
    pattern: /\b(?:naivas|carrefour|majid al futtaim|quick ?mart|chandarana|cleanshelf|mulleys|eastmatt|magunas?|tuskys|khetias?|jumbo junction|powerstar|supermarkets?|hypermarkets?|mini ?mart|minimarket|wholesalers?|wholesale|cash (?:and|&) carry|mama mboga|greengrocers?|butcher(?:y|ies))\b/i,
    names: ["Supermarket", "Groceries", "Market shopping", "Shopping share"],
    words: ["supermarket", "grocer", "shopping"],
    standard: { name: "Groceries", parent: "Food" },
  },
  {
    key: "cooking-gas",
    // Before fuel: "Total gas" is cooking gas.
    pattern: /\b(?:k-?gas|pro ?gas|afrigas|hashi energy|lpg|total gas|gas (?:point|shop|depot|centre|center|supplies|refill|distributors?))\b/i,
    names: ["Cooking gas"],
    words: ["gas"],
    standard: { name: "Cooking gas", parent: "Utilities" },
  },
  {
    key: "fuel",
    pattern: /\b(?:total ?energies|total (?:kenya|service|petrol|filling)|rubis|shell|vivo energy|ola energy|kenol|kobil|astrol|gulf energy|hass petroleum|petroleum|petrol station|service station|filling station|gas station|fuel)\b/i,
    names: ["Fuel"],
    words: ["fuel", "petrol", "diesel"],
    standard: { name: "Fuel", parent: "Transport" },
  },
  {
    key: "parking",
    pattern: /\bparking\b/i,
    names: ["Parking"],
    words: ["parking"],
    standard: { name: "Parking", parent: "Transport" },
  },
  {
    key: "home-internet",
    pattern: /\b(?:zuku|wananchi|faiba|jtl|poa internet|starlink|liquid home|mawingu)\b/i,
    names: ["Home internet", "Wi-Fi"],
    words: ["internet", "wi-fi", "wifi", "fibre"],
    standard: { name: "Home internet", parent: "Airtime & data" },
  },
  {
    key: "pay-tv",
    pattern: /\b(?:dstv|multichoice|gotv|startimes)\b/i,
    names: ["Pay TV", "Subscriptions"],
    words: ["tv", "subscription"],
    standard: { name: "Pay TV", parent: "Subscriptions" },
  },
  {
    key: "streaming",
    pattern: /\b(?:netflix|showmax|spotify|boomplay|youtube premium|apple\.com|google play|amazon prime)\b/i,
    names: ["Streaming & music", "Subscriptions"],
    words: ["stream", "music", "subscription"],
    standard: { name: "Streaming & music", parent: "Subscriptions" },
  },
  {
    key: "sha",
    pattern: /\b(?:social health authority|nhif)\b|\bSHA\b/i,
    names: ["SHA contributions", "Medical cover"],
    words: ["nhif", "medical cover", "insurance"],
    standard: { name: "SHA contributions", parent: "Health" },
  },
  {
    key: "medical-cover",
    // Before hospitals: "AAR Healthcare", "medical insurance". Most M-Pesa payments
    // to an insurer are medical cover; car or life cover is moved once and remembered.
    pattern: /\b(?:jubilee (?:insurance|health)|aar (?:insurance|healthcare|health)|britam|cic (?:insurance|group)|madison (?:insurance|group)|old mutual|apa insurance|insurance)\b/i,
    names: ["Medical cover", "Insurance"],
    words: ["medical cover", "insurance"],
    standard: { name: "Medical cover", parent: "Insurance" },
  },
  {
    key: "medicine",
    pattern: /\b(?:pharmacy|pharmacies|pharma|pharmaceuticals?|chemists?|drug ?stores?|goodlife|haltons)\b/i,
    names: ["Medicine"],
    words: ["medicine", "pharmacy", "drug"],
    standard: { name: "Medicine", parent: "Health" },
  },
  {
    key: "hospital",
    pattern: /\b(?:hospitals?|clinics?|medical|nursing home|health cent(?:re|er)|dispensary|maternity|dental|dentists?|optic(?:al|ians?|s)|eye (?:clinic|cent(?:re|er))|laborator(?:y|ies)|diagnostics?|physio(?:therapy)?|aga khan|mp shah|mater|kenyatta national|gertrudes?)\b/i,
    names: ["Hospital & clinic"],
    words: ["hospital", "clinic", "doctor"],
    standard: { name: "Hospital & clinic", parent: "Health" },
  },
  {
    key: "taxi",
    pattern: /\b(?:uber|bolt|little cab|faras|moove|yego)\b/i,
    names: ["Taxi", "Boda boda"],
    words: ["taxi", "boda"],
    standard: { name: "Taxi", parent: "Transport" },
  },
  {
    key: "matatu-bus",
    pattern: /\b(?:kenya railways|madaraka express|easy coach|ena coach|modern coast|mash east africa|guardian coach|dreamline|super metro|shuttles?)\b/i,
    names: ["Matatu & bus", "Trips"],
    words: ["matatu", "travel", "trip"],
    standard: { name: "Matatu & bus", parent: "Transport" },
  },
  {
    key: "school-fees",
    pattern: /\b(?:school|schools|academy|university|college|polytechnic|institute|kindergarten|day ?care|pre-?school)\b/i,
    names: ["School fees", "Tuition", "Class fees", "School fees & classes"],
    words: ["school", "tuition"],
    standard: { name: "School fees", parent: "Education" },
  },
  {
    key: "books",
    pattern: /\b(?:book ?shops?|bookstores?|book ?cent(?:re|er)|text ?book|stationers|stationery)\b/i,
    names: ["Books", "Stationery"],
    words: ["book", "stationer"],
    standard: { name: "Books", parent: "Books & supplies" },
  },
  {
    key: "salon",
    pattern: /\b(?:salons?|barbers?|barber ?shop|kinyozi|beauty (?:parlou?r|shop|cent(?:re|er)|salon)|nail ?bar|spa)\b/i,
    names: ["Salon & barber", "Personal care"],
    words: ["salon", "barber", "personal care"],
    standard: { name: "Salon & barber", parent: "Personal care" },
  },
  {
    key: "clothes",
    pattern: /\b(?:boutiques?|fashions?|clothing|outfitters|mr price|lc waikiki|tailors?|tailoring|bata)\b/i,
    names: ["Clothes", "Clothing"],
    words: ["cloth", "fashion"],
    standard: { name: "Clothes", parent: "Clothing" },
  },
  {
    key: "house-repairs",
    pattern: /\b(?:hardwares?|plumbers?|plumbing|electricals)\b/i,
    names: ["House repairs", "Repairs"],
    words: ["repair", "hardware"],
    standard: { name: "House repairs", parent: "Household" },
  },
  {
    key: "tax",
    pattern: /\b(?:kenya revenue authority|kra|itax)\b/i,
    names: ["Tax", "Taxes", "KRA"],
    words: ["kra", "income tax"],
  },
  {
    key: "permits",
    pattern: /\b(?:ecitizen|e-citizen|ntsa)\b/i,
    names: ["Permits & licences"],
    words: ["permit", "licen", "government"],
  },
  {
    key: "shop",
    // Last of all: a plain duka or shop is nearly always household shopping
    // ("Wanjiru Shop"), but anything above that names what it sells comes first.
    pattern: /\b(?:shops?|duka|kiosk)\b/i,
    names: ["Groceries", "Supermarket", "Market shopping", "Shopping share"],
    words: ["grocer", "supermarket", "shopping"],
    standard: { name: "Groceries", parent: "Food" },
  },
];

/**
 * A budget"s own category for each kind of payee, by key, as it is named now
 * (api-server lib/standard-categories). Set by the screens once loaded, so a
 * common category the person renamed or moved keeps getting its payees:
 * "Eating out" renamed "Hotels & food" is still where restaurants go.
 */
let links: Readonly<Record<string, string>> = {};
export function setStandardLinks(next: Readonly<Record<string, string>>): void {
  links = next;
}

/**
 * Whether money out to a payee Jamvi knows may be filed under a common category
 * the budget does not have yet: on where that category is made before saving
 * (the phone"s import). Off elsewhere, which only use categories that exist.
 */
let makesStandard = false;
export function setMakesStandardCategories(on: boolean): void {
  makesStandard = on;
}
export const makesStandardCategories = (): boolean => makesStandard;

/** The kind of payee Jamvi knows this is, or null. */
export function knownPayeeOf(description: string): { key: string; standard: KnownPayee["standard"] } | null {
  if (!description) return null;
  const payee = KNOWN_PAYEES.find((known) => known.pattern.test(description));
  return payee ? { key: payee.key, standard: payee.standard } : null;
}

/**
 * The category from this budget that a well-known payee fits, or "" when the
 * payee is not one Jamvi knows or the budget has no category for it.
 */
export function knownPayeeCategory(description: string, categoryNames: readonly string[]): string {
  if (!description || categoryNames.length === 0) return "";
  const payee = KNOWN_PAYEES.find((known) => known.pattern.test(description));
  if (!payee) return "";
  // The budget"s own category for this kind of payee, whatever it is called now.
  const linked = links[payee.key];
  if (linked && categoryNames.includes(linked)) return linked;
  const lower = categoryNames.map((name) => name.trim().toLocaleLowerCase("en-KE"));
  for (const name of payee.names) {
    const at = lower.indexOf(name.toLocaleLowerCase("en-KE"));
    if (at !== -1) return categoryNames[at];
  }
  for (const word of payee.words) {
    const at = lower.findIndex((name) => name.includes(word));
    if (at !== -1) return categoryNames[at];
  }
  return "";
}

/** The category names a well-known payee fits, best first, whatever the budget has ([] for any other payee). */
export function knownPayeeNames(description: string): readonly string[] {
  if (!description) return [];
  return KNOWN_PAYEES.find((known) => known.pattern.test(description))?.names ?? [];
}
