/* =====================================================================
   1. GAME DATA
   ===================================================================== */

// Sectors group industries. Owning lots of one sector unlocks upgrades for it.
// color: used for the business logo and its building in the skyline.
const SECTORS = {
  services: { name: "Services",      color: "#3a8fb7" },
  auto:     { name: "Auto",          color: "#c0443a" },
  transport:{ name: "Transport",     color: "#4a9d6b" },
  tech:     { name: "Tech",          color: "#22a596" },
  food:     { name: "Food",          color: "#d9822b" },
  retail:   { name: "Retail",        color: "#8e5ba8" },
  property: { name: "Property",      color: "#a88d2f" },
  fun:      { name: "Entertainment", color: "#d35d8e" },
  finance:  { name: "Finance",       color: "#5c6bc0" },
};

// Tiers: bigger businesses unlock as your earnings this run grow.
// rank is your title at that stage; gigs are what the Hustle button does.
const TIERS = [
  { unlock: 0,     rank: "Side hustler",         gigs: ["Mowing a lawn", "Washing a car", "Delivering a pizza", "Fixing a cracked screen"] },
  { unlock: 2e3,   rank: "Small business owner", gigs: ["Working the food truck window", "Restocking vending machines", "Clearing a paper jam", "Pulling espresso shots"] },
  { unlock: 1e5,   rank: "Main Street mogul",    gigs: ["Covering a shift at the diner", "Haggling with a supplier", "Training a new hire", "Walking the car wash line"] },
  { unlock: 5e6,   rank: "Regional magnate",     gigs: ["Negotiating a lease", "Meeting with the bank", "Touring a hotel", "Signing a freight contract"] },
  { unlock: 5e8,   rank: "Industry titan",       gigs: ["Pitching investors", "Courting a merger", "Doing a TV interview", "Reviewing the quarterly numbers"] },
  { unlock: 1e11,  rank: "Global tycoon",        gigs: ["Ringing the opening bell", "Lunch with a senator", "Touring a launch pad", "Pricing out a small island"] },
];

// Every kind of business. cost = asking price for your first one (before the
// listing's own quirks). Its income per second is worked out below from
// TIER_PAYBACK, so bigger businesses take longer to pay for themselves.
// names: patterns for made-up names. {place} {surname} {first} {adj} {tech}
// {city} {mascot} are filled in from the NAME PARTS lists below.
const INDUSTRIES = [
  // --- tier 0: side hustles ---
  { id: "lawn",     name: "Lawn care route",    sector: "services", tier: 0, cost: 25,     names: ["{surname} Lawn Care", "{place} Lawn & Garden", "{first}'s Mowing"] },
  { id: "detail",   name: "Car detailing",      sector: "auto",     tier: 0, cost: 70,     names: ["{adj} Shine Detailing", "{first}'s Mobile Detail", "{place} Auto Spa"] },
  { id: "courier",  name: "Bike courier",       sector: "transport",tier: 0, cost: 180,    names: ["{first}'s Bike Courier", "{place} Express", "{adj} Wheels Courier"] },
  { id: "phonefix", name: "Phone repair kiosk", sector: "tech",     tier: 0, cost: 450,    names: ["{place} Phone Fix", "{adj} Screen Repair", "{first}'s Cell Doctor"] },
  // --- tier 1: small businesses ---
  { id: "foodtruck",name: "Food truck",         sector: "food",     tier: 1, cost: 2500,   names: ["{first}'s Taco Truck", "{place} BBQ Wagon", "{adj} Bites Food Truck"] },
  { id: "laundry",  name: "Laundromat",         sector: "services", tier: 1, cost: 5000,   names: ["{place} Laundromat", "{adj} Suds Laundry", "{surname} Wash & Fold"] },
  { id: "vending",  name: "Vending route",      sector: "retail",   tier: 1, cost: 8000,   names: ["{place} Vending Co.", "{adj} Snack Route", "{surname} Vending"] },
  { id: "copier",   name: "Copier service",     sector: "services", tier: 1, cost: 12000,  names: ["{place} Copier Service", "{surname} Business Machines", "{adj} Imaging Solutions"] },
  { id: "coffee",   name: "Coffee shop",        sector: "food",     tier: 1, cost: 18000,  names: ["{place} Coffee Co.", "{adj} Bean Roasters", "{first}'s Espresso Bar"] },
  // --- tier 2: main street ---
  { id: "diner",    name: "Diner",              sector: "food",     tier: 2, cost: 120e3,  names: ["{first}'s Diner", "{place} Grill", "The {adj} Spoon"] },
  { id: "carwash",  name: "Car wash",           sector: "auto",     tier: 2, cost: 200e3,  names: ["{place} Car Wash", "{adj} Wave Car Wash", "{surname} Express Wash"] },
  { id: "garage",   name: "Auto repair shop",   sector: "auto",     tier: 2, cost: 300e3,  names: ["{surname} Auto Repair", "{place} Garage", "{adj} Wrench Automotive"] },
  { id: "gym",      name: "Gym",                sector: "services", tier: 2, cost: 450e3,  names: ["{place} Fitness", "{adj} Iron Gym", "{surname} Strength Club"] },
  { id: "hvac",     name: "HVAC company",       sector: "services", tier: 2, cost: 600e3,  names: ["{surname} Heating & Air", "{place} HVAC", "{adj} Comfort Systems"] },
  { id: "hardware", name: "Hardware store",     sector: "retail",   tier: 2, cost: 800e3,  names: ["{place} Hardware", "{surname} Supply Co.", "{adj} Tool & Lumber"] },
  // --- tier 3: regional ---
  { id: "grocery",  name: "Grocery store",      sector: "retail",   tier: 3, cost: 8e6,    names: ["{place} Market", "{surname}'s Grocery", "{adj} Basket Foods"] },
  { id: "insure",   name: "Insurance agency",   sector: "finance",  tier: 3, cost: 12e6,   names: ["{surname} Insurance Group", "{place} Mutual", "{adj} Shield Insurance"] },
  { id: "hotel",    name: "Hotel",              sector: "property", tier: 3, cost: 15e6,   names: ["The {place} Hotel", "{adj} Inn & Suites", "{surname} House Hotel"] },
  { id: "storage",  name: "Self-storage park",  sector: "property", tier: 3, cost: 22e6,   names: ["{place} Self Storage", "{adj} Lock Storage", "{surname} Storage Center"] },
  { id: "brewery",  name: "Brewery",            sector: "food",     tier: 3, cost: 30e6,   names: ["{place} Brewing Co.", "{adj} Barrel Brewery", "{surname} Brothers Brewing"] },
  { id: "trucking", name: "Trucking company",   sector: "transport",tier: 3, cost: 45e6,   names: ["{surname} Freight", "{place} Logistics", "{adj} Haul Trucking"] },
  { id: "dealer",   name: "Car dealership",     sector: "auto",     tier: 3, cost: 60e6,   names: ["{surname} Motors", "{place} Auto Group", "{adj} Ride Motors"] },
  // --- tier 4: big business ---
  { id: "software", name: "Software company",   sector: "tech",     tier: 4, cost: 700e6,  names: ["{tech} Software", "{place} Labs", "{surname} Systems"] },
  { id: "resort",   name: "Beach resort",       sector: "property", tier: 4, cost: 1.2e9,  names: ["{place} Resort & Spa", "The {adj} Palms Resort", "{surname} Island Resort"] },
  { id: "studio",   name: "Film studio",        sector: "fun",      tier: 4, cost: 1.6e9,  names: ["{place} Pictures", "{adj} Lantern Studios", "{surname} Films"] },
  { id: "hospital", name: "Hospital group",     sector: "services", tier: 4, cost: 2e9,    names: ["{place} Medical Center", "{surname} Health", "{adj} Care Hospitals"] },
  { id: "team",     name: "Pro sports team",    sector: "fun",      tier: 4, cost: 3e9,    names: ["{city} {mascot}"] },
  { id: "port",     name: "Shipping terminal",  sector: "transport",tier: 4, cost: 4.5e9,  names: ["Port of {place}", "{surname} Marine Terminal", "{adj} Harbor Shipping"] },
  // --- tier 5: global ---
  { id: "park",     name: "Theme park",         sector: "fun",      tier: 5, cost: 150e9,  names: ["{adj} Kingdom", "{place} Adventure Park", "{surname}land"] },
  { id: "airline",  name: "Airline",            sector: "transport",tier: 5, cost: 250e9,  names: ["{place} Air", "{adj} Wing Airlines", "{tech} Airways"] },
  { id: "bank",     name: "Bank",               sector: "finance",  tier: 5, cost: 400e9,  names: ["{place} National Bank", "{surname} Trust", "{adj} Federal"] },
  { id: "chips",    name: "Chip factory",       sector: "tech",     tier: 5, cost: 700e9,  names: ["{tech} Semiconductor", "{place} Silicon Works", "{tech} Microsystems"] },
  { id: "rocket",   name: "Launch company",     sector: "tech",     tier: 5, cost: 1.2e12, names: ["{tech} Launch", "{place} Aerospace", "{adj} Orbit Space Co."] },
];
// Seconds a plain level-1 business of each tier takes to earn back its price.
// This one table sets the pace of the whole game: bigger numbers = slower.
const TIER_PAYBACK = [60, 300, 1500, 6000, 25000, 90000];
// Within a tier, pricier businesses pay back a little faster (6% per step),
// so there's a reason to save up for the expensive ones.
for (const tier of TIER_PAYBACK.keys()) {
  INDUSTRIES.filter(i => i.tier === tier).forEach((ind, rank) => {
    ind.income = ind.cost / TIER_PAYBACK[tier] * (1 + 0.06 * rank);
  });
}
const IND = Object.fromEntries(INDUSTRIES.map(i => [i.id, i]));

// NAME PARTS for the made-up business names. All invented or generic,
// so nothing is named after a real company.
const NAME_PARTS = {
  place:   ["Harbor", "Riverside", "Magnolia", "Palmetto", "Cedar Creek", "Summit", "Bayview", "Oak Street", "King Street", "Northside",
            "Lakeshore", "Pine Ridge", "Union", "Granite", "Coastal", "Lowcountry", "Meridian", "Sunset", "Westgate", "Old Mill"],
  surname: ["Miller", "Rivera", "Okafor", "Nguyen", "Patel", "Brooks", "Kowalski", "Haddad", "Jensen", "Romero", "Bishop", "Grant",
            "Delgado", "Whitaker", "Chen", "Fontaine", "Mbeki", "Larsen", "O'Hara", "Castillo"],
  first:   ["Ray", "Lou", "Dee", "Tony", "Rosa", "Gus", "Bev", "Marco", "Jo", "Sal", "Nina", "Hank", "Tasha", "Earl", "Mae"],
  adj:     ["Golden", "Swift", "Prime", "Sparkle", "Iron", "Silver", "Lucky", "Evergreen", "Bright", "Crimson", "Liberty", "Royal", "Sterling", "True North"],
  tech:    ["Nimbus", "Vector", "Quanta", "Helix", "Orbit", "Lattice", "Ember", "Pixel", "Cobalt", "Signal", "Arcus", "Polar"],
  city:    ["Charleston", "Savannah", "Columbus", "Tulsa", "Boise", "Raleigh", "Omaha", "Tucson", "Richmond", "Knoxville", "Spokane",
            "Dayton", "Reno", "Mobile", "Akron", "Madison", "Fresno", "Wichita", "Chattanooga", "Wilmington"],
  mascot:  ["Ironclads", "Night Owls", "Tidewalkers", "Stormchasers", "Copperheads", "Comets", "Blue Herons", "Wildcards", "Foxhounds", "Riptides"],
};

// What the location of a listing is like: changes its income and its price.
const LOCATIONS = [
  { name: "Rough area",   inc: 0.8,  price: 0.8,  tone: "bad"  },
  { name: "Okay spot",    inc: 1.0,  price: 1.0,  tone: ""     },
  { name: "Good spot",    inc: 1.15, price: 1.1,  tone: "good" },
  { name: "Prime location", inc: 1.3, price: 1.25, tone: "good" },
];
// Quirks: one per listing. weight = how often it comes up.
const QUIRKS = [
  { name: "Nothing special",          inc: 1.0,  price: 1.0,  weight: 6, tone: ""     },
  { name: "Loyal regulars",           inc: 1.15, price: 1.05, weight: 3, tone: "good" },
  { name: "Owner wants out fast",     inc: 1.0,  price: 0.7,  weight: 2, tone: "good" },
  { name: "Below-market lease",       inc: 1.2,  price: 1.0,  weight: 2, tone: "good" },
  { name: "Went viral last month",    inc: 1.4,  price: 1.35, weight: 1, tone: "good" },
  { name: "Family-run for 40 years",  inc: 1.1,  price: 1.1,  weight: 2, tone: "good" },
  // fix: these bad quirks can be fixed once you own the business (see PROBLEMS)
  { name: "Bad online reviews",       inc: 0.8,  price: 0.75, weight: 2, tone: "bad", fix: "reviews"   },
  { name: "Needs new equipment",      inc: 0.75, price: 0.6,  weight: 2, tone: "bad", fix: "equipment" },
  { name: "Messy books",              inc: 0.9,  price: 0.95, weight: 2, tone: "bad", fix: "books"     },
  // Never on a listing (weight 0): what a fixed bad quirk turns into.
  // Slightly better than "Nothing special": customers noticed the change.
  { name: "Turned around",            inc: 1.05, price: 1.0,  weight: 0, tone: "good" },
];
const TURNED_AROUND = QUIRKS.length - 1;
const QUIRK_WEIGHT = QUIRKS.reduce((a, q) => a + q.weight, 0);

// ---------------------------------------------------------------------
// PROBLEMS: what can be wrong with a business, and how you fix it.
// This is the "buy it cheap, fix it up, sell it on" side of the game,
// the way real small-business buyers make money:
//   - Some problems are out in the open (a listing's bad quirk, or a
//     rough location). They make the business cheaper to buy.
//   - Some are HIDDEN: the seller doesn't mention them. You only find
//     out after you buy, unless you pay for due diligence first.
// Fixing a problem means passing a quick mini game (game: which one),
// then paying for the work and waiting for it to finish (bigger
// businesses take longer). A fixed business earns more, and buyers pay
// more for it, so you can sell it on at a profit.
//   penalty: income multiplier while a HIDDEN problem is there (open
//            problems are already counted in the quirk / location numbers)
//   costMult: share of the business's base price the fix costs
//   timeMult: how long the work takes, times FIX_SECONDS for its tier
// ---------------------------------------------------------------------
const PROBLEMS = {
  reviews:   { name: "Bad online reviews",  fixLabel: "Answer the reviews",    game: "reviews", costMult: 0.08, timeMult: 1 },
  equipment: { name: "Needs new equipment", fixLabel: "Repair the machines",   game: "machine", costMult: 0.08, timeMult: 1 },
  books:     { name: "Messy books",         fixLabel: "Clean up the books",    game: "books",   costMult: 0.08, timeMult: 1 },
  rough:     { name: "Rough area",          fixLabel: "Renovate the storefront", game: null,    costMult: 0.25, timeMult: 2 },
  // hidden ones
  staff:     { name: "Staff keep quitting", fixLabel: "Hire a good manager",   game: "hire",    costMult: 0.08, timeMult: 1, hidden: true, penalty: 0.8 },
  taxes:     { name: "Behind on taxes",     fixLabel: "Sort out the taxes",    game: "books",   costMult: 0.08, timeMult: 1, hidden: true, penalty: 0.85 },
  roof:      { name: "Leaky roof",          fixLabel: "Patch the roof",        game: "machine", costMult: 0.08, timeMult: 1, hidden: true, penalty: 0.85 },
};
const HIDDEN_PROBLEMS = Object.keys(PROBLEMS).filter(id => PROBLEMS[id].hidden);
const HIDDEN_CHANCE = 0.25;         // share of listings hiding a problem
const DD_COST = 0.03;               // due diligence costs this share of the asking price
// Seconds the repair work takes after you pass the mini game, by tier.
const FIX_SECONDS = [10, 30, 90, 240, 600, 1200];
const FIX_RETRY = 20;               // seconds to wait after failing a mini game
// Selling: see saleValue(). SALE_MULT takes off the buyer's haggling and
// the broker's fee, so a plain business sells for 80% of its asking price
// and you only profit by fixing things or by buying at a real bargain. Finding a buyer takes SELL_SECONDS for its tier, so you can't buy
// a bargain and dump it the same second.
const SALE_MULT = 0.8;
const SELL_SECONDS = [20, 60, 180, 480, 1200, 2400];


// Prices: every level you own in an industry (a new business counts as one
// level) makes the next one in that industry UNIT_GROWTH times pricier.
// Expanding costs EXPAND_BASE of what a new business would; a new one costs
// more but might come with a better location or quirk.
const UNIT_GROWTH = 1.25;
const EXPAND_BASE = 0.6;
const LEVEL_MILESTONES = [10, 25, 50, 100];   // each doubles that business's income

// Deals board
const DEAL_SLOTS = 4;               // listings on the board (Scout upgrade adds one)
const DEAL_REFRESH = 150;           // seconds until the board refreshes by itself
const SCOUT_COOLDOWN = 45;          // seconds between free "Scout new deals" presses

// DEAL SENSE: you get better at finding businesses the more deals you do,
// like a real buyer who has looked at hundreds of them. Experience (XP)
// comes from due diligence, buying, fixing and selling, and it stays with
// you when you retire. Each level adds a perk (see scoutPerk below).
const SCOUT_XP = { check: 1, buy: 1, fix: 2, saleProfit: 3, saleLoss: 1 };
const SCOUT_LEVELS = [
  { xp: 0,   name: "Rookie",              perk: "You take sellers at their word." },
  { xp: 8,   name: "Has an eye",          perk: "Due diligence costs half." },
  { xp: 25,  name: "Deal hunter",         perk: "One more listing on the Deals board." },
  { xp: 60,  name: "Gut feeling",         perk: "Listings hiding a problem get a \"Something feels off\" warning." },
  { xp: 120, name: "Sharp negotiator",    perk: "Asking prices come in about 6% lower." },
  { xp: 220, name: "Well connected",      perk: "One off-market deal on every fresh board (15% off), faster refreshes, and Scout recharges twice as fast." },
  { xp: 380, name: "Legendary dealmaker", perk: "One more listing, and due diligence is free." },
];
const OFF_MARKET_DISCOUNT = 0.85;

// Hustle (tapping)
const STEPS_PER_JOB = 10;           // hustles to finish a job
const JOB_BONUS = 5;                // finishing a job pays this many extra hustles

// Events (the pop-up offers)
const EVENT_MIN = 100, EVENT_MAX = 220;   // seconds between events
const EVENT_VISIBLE = 25;                 // seconds an event waits for an answer
const VIRAL_MULT = 10, VIRAL_SECONDS = 60;
const BOOM_MULT = 3, BOOM_SECONDS = 45;
const INSPECTION_SECONDS = 600;           // half income at one business if you skip the fix

// Legacy (prestige): stars = floor( sqrt(everything ever earned / LEGACY_DIVISOR) )
const LEGACY_DIVISOR = 1e9;
const LEGACY_BONUS = 0.10;

const OFFLINE_CAP_HOURS = 8;

// Upgrades. kind:
//   tapFlat / tapMult / tapPct - make hustling pay more (tapPct = share of income/sec)
//   global     - multiplies all income
//   price      - multiplies every purchase and expansion price (0.9 = 10% off)
//   eventRate  - events come this much more often
//   slots      - extra listings on the Deals board
//   sector     - doubles one sector's income (made automatically below)
// need = earnings this run before it shows up.
const OWNER_UPGRADES = [
  { id: "boots",   name: "Work Boots",        cost: 40,     kind: "tapFlat", value: 1,    need: 15,    desc: "+$1 per hustle." },
  { id: "harder",  name: "Hustle Harder",     cost: 600,    kind: "tapMult", value: 2,    need: 200,   desc: "Hustling pays double." },
  { id: "cards",   name: "Business Cards",    cost: 4000,   kind: "eventRate", value: 0.25, need: 1500, desc: "Offers and events come 25% more often." },
  { id: "deleg",   name: "Delegation",        cost: 12e3,   kind: "tapPct",  value: 0.01, need: 4e3,   desc: "Each hustle also pays 1% of your income per second." },
  { id: "nego1",   name: "Negotiator",        cost: 30e3,   kind: "price",   value: 0.9,  need: 10e3,  desc: "Everything you buy or expand costs 10% less." },
  { id: "scout",   name: "Business Broker",   cost: 60e3,   kind: "slots",   value: 1,    need: 20e3,  desc: "One more listing on the Deals board." },
  { id: "acct",    name: "Good Accountant",   cost: 150e3,  kind: "global",  value: 1.25, need: 50e3,  desc: "All income +25%." },
  { id: "closer",  name: "The Closer",        cost: 2e6,    kind: "tapPct",  value: 0.02, need: 700e3, desc: "Hustling pays 2% more of your income per second." },
  { id: "nego2",   name: "Hard Bargainer",    cost: 8e6,    kind: "price",   value: 0.9,  need: 2.5e6, desc: "Everything you buy or expand costs 10% less again." },
  { id: "cfo",     name: "Hire a CFO",        cost: 80e6,   kind: "global",  value: 1.5,  need: 25e6,  desc: "All income +50%." },
  { id: "press",   name: "Press Agent",       cost: 400e6,  kind: "eventRate", value: 0.25, need: 120e6, desc: "Offers and events come 25% more often." },
  { id: "rain",    name: "Rainmaker",         cost: 3e9,    kind: "tapPct",  value: 0.03, need: 1e9,   desc: "Hustling pays 3% more of your income per second." },
  { id: "lobby",   name: "Lobbyist",          cost: 40e9,   kind: "global",  value: 1.5,  need: 12e9,  desc: "All income +50%." },
  { id: "media",   name: "Own a TV Network",  cost: 2e12,   kind: "global",  value: 2,    need: 6e11,  desc: "All income doubled." },
];
// Sector upgrades: when your businesses in one sector add up to 10, 50 and
// 150 levels, you can buy a "double that sector" upgrade.
const SECTOR_STEPS = [
  { levels: 10,  label: "Know-How",  costMult: 40 },
  { levels: 50,  label: "Network",   costMult: 4000 },
  { levels: 150, label: "Dominance", costMult: 400000 },
];
const UPGRADES = [...OWNER_UPGRADES];
for (const [sid, sector] of Object.entries(SECTORS)) {
  const cheapest = Math.min(...INDUSTRIES.filter(i => i.sector === sid).map(i => i.cost));
  for (const step of SECTOR_STEPS) {
    UPGRADES.push({
      id: `sec_${sid}_${step.levels}`, name: `${sector.name} ${step.label}`, kind: "sector", sector: sid, levels: step.levels,
      cost: roundNice(cheapest * step.costMult),
      desc: `${sector.name} income doubled. (Needs ${step.levels} levels across your ${sector.name.toLowerCase()} businesses.)`,
    });
  }
}
UPGRADES.sort((a, b) => a.cost - b.cost);
const UPG = Object.fromEntries(UPGRADES.map(u => [u.id, u]));


