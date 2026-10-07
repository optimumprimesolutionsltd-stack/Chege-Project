/**
 * Payees whose category is obvious from the name alone - Kenya Power, a
 * supermarket, a petrol station - so the first payment to one is not left on
 * "Not sure yet" just because the budget has never paid it before.
 *
 * Only ever a suggestion: it is used after the person"s own rules and history,
 * starts unconfirmed like every other suggestion, and only names a category the
 * budget already has. Each payee lists the categories it fits, most specific
 * first, by exact name and then by words a category"s name may contain. Broad
 * names that are usually headings (Utilities, Food, Transport, Health) are left
 * out on purpose: money cannot be filed under a heading.
 */

type KnownPayee = {
  /** Matched against the payee as the message or statement names it. */
  pattern: RegExp;
  /** Category names this payee fits, exactly (ignoring case), best first. */
  names: readonly string[];
  /** Words a budget"s own category name may contain instead, best first. */
  words: readonly string[];
};

const KNOWN_PAYEES: readonly KnownPayee[] = [
  {
    pattern: /\b(?:kplc|kenya power)\b/i,
    names: ["Electricity"],
    words: ["electric", "power", "kplc", "token"],
  },
  {
    pattern: /\b(?:nairobi city water|ncwsc|water (?:and|&) sewerage|water company|mawasco|nawassco|eldowas|kiwasco|mowasco|nyewasco)\b/i,
    names: ["Water"],
    words: ["water"],
  },
  {
    pattern: /\b(?:naivas|carrefour|majid al futtaim|quick ?mart|chandarana|cleanshelf|mulleys|eastmatt|magunas?|tuskys|khetias?|jumbo junction|powerstar|supermarkets?|mini ?mart|minimarket)\b/i,
    names: ["Supermarket", "Groceries", "Market shopping", "Shopping share"],
    words: ["supermarket", "grocer", "shopping"],
  },
  {
    pattern: /\b(?:total ?energies|total (?:kenya|service|petrol|filling)|rubis|shell|vivo energy|ola energy|kenol|kobil|astrol|gulf energy|hass petroleum|petrol station|service station|filling station)\b/i,
    names: ["Fuel"],
    words: ["fuel", "petrol", "diesel"],
  },
  {
    pattern: /\b(?:k-?gas|pro ?gas|afrigas|gas (?:point|shop|depot|centre|center|supplies|refill))\b/i,
    names: ["Cooking gas"],
    words: ["gas"],
  },
  {
    pattern: /\b(?:zuku|wananchi|faiba|jtl|poa internet|starlink|liquid home|mawingu)\b/i,
    names: ["Home internet", "Wi-Fi"],
    words: ["internet", "wi-fi", "wifi", "fibre"],
  },
  {
    pattern: /\b(?:dstv|multichoice|gotv|startimes)\b/i,
    names: ["Pay TV", "Subscriptions"],
    words: ["tv", "subscription"],
  },
  {
    pattern: /\b(?:netflix|showmax|spotify|boomplay|youtube premium|apple\.com|google play)\b/i,
    names: ["Streaming & music", "Subscriptions"],
    words: ["stream", "music", "subscription"],
  },
  {
    pattern: /\b(?:social health authority|nhif)\b|\bSHA\b/i,
    names: ["SHA contributions", "Medical cover"],
    words: ["nhif", "medical cover", "insurance"],
  },
  {
    pattern: /\b(?:pharmacy|pharmaceuticals?|chemists?|goodlife|haltons)\b/i,
    names: ["Medicine"],
    words: ["medicine", "pharmacy", "drug"],
  },
  {
    pattern: /\b(?:hospital|clinic|medical cent(?:re|er)|nursing home|health cent(?:re|er)|dispensary|aga khan)\b/i,
    names: ["Hospital & clinic"],
    words: ["hospital", "clinic", "doctor"],
  },
  {
    pattern: /\b(?:kfc|java house|artcaffe|pizza inn|chicken inn|dominos?|galitos|simbisa|restaurant|cafe|eatery|bistro)\b/i,
    names: ["Eating out", "Meals", "Lunch", "Food & drinks"],
    words: ["eating out", "restaurant", "meal", "lunch"],
  },
  {
    pattern: /\b(?:uber|bolt|little cab|faras)\b/i,
    names: ["Taxi", "Boda boda"],
    words: ["taxi", "boda"],
  },
  {
    pattern: /\b(?:kenya railways|madaraka express|easy coach|ena coach|modern coast|mash east africa|guardian coach|dreamline)\b/i,
    names: ["Matatu & bus", "Trips"],
    words: ["matatu", "travel", "trip"],
  },
  {
    pattern: /\b(?:school|academy|university|college|polytechnic)\b/i,
    names: ["School fees", "Tuition", "Class fees", "School fees & classes"],
    words: ["school", "tuition"],
  },
  {
    pattern: /\b(?:salon|barber|beauty parlou?r|spa)\b/i,
    names: ["Salon & barber", "Personal care"],
    words: ["salon", "barber", "personal care"],
  },
  {
    pattern: /\b(?:kenya revenue authority|kra)\b/i,
    names: ["Tax", "Taxes", "KRA"],
    words: ["kra", "income tax"],
  },
  {
    pattern: /\b(?:ecitizen|e-citizen|ntsa)\b/i,
    names: ["Permits & licences"],
    words: ["permit", "licen", "government"],
  },
];

/**
 * The category from this budget that a well-known payee fits, or "" when the
 * payee is not one Jamvi knows or the budget has no category for it.
 */
export function knownPayeeCategory(description: string, categoryNames: readonly string[]): string {
  if (!description || categoryNames.length === 0) return "";
  const payee = KNOWN_PAYEES.find((known) => known.pattern.test(description));
  if (!payee) return "";
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
