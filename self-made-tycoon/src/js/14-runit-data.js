/* =====================================================================
   11. RUN IT: THE GAME INSIDE EACH BUSINESS  (data)
   Every business you own has its own small incremental game, in the
   spirit of Paper Jam Tycoon, themed to what that business actually does.
   It's how a real owner grows a business they just bought:

     1. At first YOU are the business: you do the work yourself
        (the big work button: mow the lawn, pull the shot, close the deal).
     2. You hire a crew. Each role you hire makes that business earn more,
        so it slowly stops needing you.
     3. You buy gear and systems (better tools, software, process).
     4. Now and then a rush order comes in while you're on site.
     5. Once the crew does the heavy lifting, the business "runs without
        you", and buyers pay more for a business like that.

   One shared engine (15-runit.js) runs all of them. This file is just
   the numbers and the words, so a new kind of business only needs a new
   entry in RUN_THEMES below.
   ===================================================================== */

// ---------------------------------------------------------------------
// Crew roles. Each business has four, cheapest first. All the numbers
// are RELATIVE to the business itself, so the game inside a lawn route
// plays exactly like the game inside an airline, just with bigger numbers.
//   price: what the first hire costs, in "levels" of that business: 1 =
//          the same as expanding it by one level right now (see runUnit()).
//   boost: how much each hire adds to that business's income (0.1 = +10%).
// Every hire of a role makes the next one CREW_GROWTH times pricier, and
// owning 10, 25 and 50 of a role doubles what that role adds (Paper Jam
// Tycoon's milestone idea).
//
// Why price in levels: expanding gets steadily dearer (UNIT_GROWTH), and
// a business at level L only grows by about 1/L per level. A hire adds a
// share of everything the business makes, so it's a poor deal on a
// brand-new business and a good one on a big business. Pricing hires in
// levels keeps them on the same price curve as expanding, so neither one
// runs away from the other. (These numbers were tuned with the pacing
// robot in tests/sim.py: see the README.)
// ---------------------------------------------------------------------
const CREW_ROLES = [
  { price: 1,   boost: 0.1 },
  { price: 6,   boost: 0.4 },
  { price: 40,  boost: 1.5 },
  { price: 300, boost: 6 },
];
// 1.2, not Paper Jam's 1.15: with 1.15 the robot that hires crew reached
// the global tier ~35% sooner than one that only expands; with 1.2 the
// crew alone is about 10% faster, and working inside your businesses
// (RUN_TAP_SECONDS) adds the rest for an active player.
const CREW_GROWTH = 1.2;
const CREW_MILESTONES = [10, 25, 50];
// A role shows up once you've hired this many of the role before it, so
// the list grows as you go instead of starting as a wall of buttons.
const CREW_REVEAL = 3;

// Gear and systems: three one-time upgrades per business.
//   price: in levels of the business (same as crew)
//   kind:  "tap"  = your own work pays double
//          "crew" = every crew role adds 50% more
//          "crew2"= every crew role adds double
const GEAR_SLOTS = [
  { price: 2,    kind: "tap",   mult: 2,   desc: "Your own work here pays double." },
  { price: 50,   kind: "crew",  mult: 1.5, desc: "Every crew role here adds 50% more." },
  { price: 500,  kind: "crew2", mult: 2,   desc: "Every crew role here adds double." },
];

// Your own work: one press of the work button pays what a Hustle would
// pay, PLUS this many seconds of the business's own income. A job takes
// STEPS_PER_JOB presses (same as Hustle) and finishing one pays JOB_BONUS
// presses extra. Kept small on purpose so working one business is a nice
// boost, not a reason to stop hustling or growing everything else.
const RUN_TAP_SECONDS = 0.2;

// Rush orders: while you have a business's game open, every RUSH_MIN to
// RUSH_MAX seconds a rush order flashes up for RUSH_VISIBLE seconds. Take
// it and you get RUSH_SECONDS of that business's income straight away.
const RUSH_MIN = 40, RUSH_MAX = 90, RUSH_VISIBLE = 12, RUSH_SECONDS = 30;

// What a business is like, judged by how much its crew adds. The last
// two count as "runs without you": buyers pay more (see runSaleMult()).
const RUN_STAGES = [
  { bonus: 0,   name: "You are the business", note: "Hire a crew so it doesn't need you every day." },
  { bonus: 0.25,name: "Small team",           note: "The crew covers the basics. Keep hiring." },
  { bonus: 1,   name: "Runs without you",     note: "Buyers pay more for a business that doesn't need its owner." },
  { bonus: 4,   name: "Well-oiled machine",   note: "Buyers pay the most for a business like this." },
];
const RUN_SALE_SHARE = 0.25;     // a sale counts this share of the crew bonus...
const RUN_SALE_CAP = 0.5;        // ...up to +50% on the sale price

// ---------------------------------------------------------------------
// THEMES: the words for each kind of business.
//   verb:  the work button ("what you do when you're the one doing it")
//   jobs:  the job you're on (shown above the button, one per job)
//   crew:  the four roles, cheapest first (see CREW_ROLES)
//   gear:  the three gear/system upgrades (see GEAR_SLOTS for effects)
//   rush:  rush orders that come in while you're on site
// All made up or generic: no real brands.
// ---------------------------------------------------------------------
const RUN_THEMES = {
  // --- tier 0: side hustles ---
  lawn: { verb: "Mow", jobs: ["Mow the Hendersons' front yard", "Edge the church lawn", "Bag leaves on Elm Street", "Trim the hedges at the dentist's"],
    crew: ["Neighbor kid", "Weekend helper", "Crew lead", "Second truck & trailer"],
    gear: ["Zero-turn mower", "Route-planning app", "Commercial contracts"],
    rush: ["The HOA wants every yard done before Saturday", "A wedding venue needs a cut by noon"] },
  detail: { verb: "Polish", jobs: ["Hand-wash a pickup", "Clay-bar a sedan", "Shampoo minivan seats", "Wax a classic convertible"],
    crew: ["Car-wash buddy", "Detailer", "Ceramic-coating pro", "Second mobile rig"],
    gear: ["Dual-action polisher", "Online booking", "Fleet accounts"],
    rush: ["A car dealer needs ten cars spotless by Monday", "A car show starts in an hour"] },
  courier: { verb: "Ride", jobs: ["Run legal papers downtown", "Rush a lab sample", "Deliver a cake (carefully)", "Drop contracts at the bank"],
    crew: ["Part-time rider", "Full-time rider", "Dispatcher", "Cargo e-bike fleet"],
    gear: ["Cargo e-bike", "Dispatch app", "Law-firm contracts"],
    rush: ["A law firm has twelve filings due in an hour", "The hospital lab needs samples across town, now"] },
  phonefix: { verb: "Repair", jobs: ["Swap a cracked screen", "Replace a tired battery", "Dry out a dropped-in-the-pool phone", "Fix a loose charging port"],
    crew: ["Counter helper", "Repair tech", "Micro-soldering whiz", "Second kiosk"],
    gear: ["Screen separator machine", "Parts by the case", "School district contract"],
    rush: ["A school just handed out 40 tablets with cracked screens", "A tour bus pulls up full of dead phones"] },
  // --- tier 1: small businesses ---
  foodtruck: { verb: "Serve", jobs: ["Work the lunch rush downtown", "Cater an office party", "Park outside the brewery", "Run the late-night window"],
    crew: ["Window cashier", "Line cook", "Prep cook", "Second truck"],
    gear: ["Second flat-top grill", "Online ordering", "Festival circuit"],
    rush: ["The food truck festival just called you in", "A film crew wants lunch for sixty"] },
  laundry: { verb: "Fold", jobs: ["Fold a wash-and-fold order", "Clear lint traps", "Collect quarters", "Run a hotel's sheets"],
    crew: ["Attendant", "Wash-and-fold staff", "Pickup driver", "Night shift"],
    gear: ["Card-reader machines", "Pickup & delivery app", "Hotel linen contracts"],
    rush: ["A hotel's laundry room flooded: 300 sheets need washing", "Move-in weekend at the college"] },
  vending: { verb: "Restock", jobs: ["Restock the gym's machines", "Fix a stuck snack coil", "Swap in cold drinks at the factory", "Collect from the hospital lobby"],
    crew: ["Restocker", "Route driver", "Machine tech", "Second van"],
    gear: ["Cashless card readers", "Telemetry (machines report what's low)", "Office micro-markets"],
    rush: ["A factory's night shift ran every machine dry", "The stadium wants machines filled for game day"] },
  copier: { verb: "Clear jam", jobs: ["Clear a jam in Tray 2", "Swap a fuser", "Install a new copier at a school", "Fix scan-to-email (again)"],
    crew: ["Intern", "Field tech", "Service van", "Dispatch office"],
    gear: ["Parts in every van", "Remote meter reads", "Managed print contracts"],
    rush: ["The courthouse copier died during a big trial", "A school district needs 30 copiers set up by Monday"] },
  coffee: { verb: "Pull shot", jobs: ["Pull espresso for the morning line", "Steam milk for a latte", "Dial in the grinder", "Bake the morning scones"],
    crew: ["Barista", "Shift lead", "In-house baker", "Roaster"],
    gear: ["Second espresso machine", "Mobile order-ahead", "Wholesale beans to offices"],
    rush: ["A conference next door wants 200 coffees by 8", "A bus of tourists just walked in"] },
  // --- tier 2: main street ---
  diner: { verb: "Flip", jobs: ["Flip pancakes for the breakfast rush", "Plate the blue-plate special", "Pour coffee refills", "Prep the pies"],
    crew: ["Server", "Short-order cook", "Manager", "Night shift"],
    gear: ["Bigger griddle", "Tablet ordering", "Catering menu"],
    rush: ["The high school team won state: they're all coming in", "A tour bus wants breakfast for fifty"] },
  carwash: { verb: "Wash", jobs: ["Prep cars at the entrance", "Hand-dry a line of SUVs", "Vacuum interiors", "Refill the soap tanks"],
    crew: ["Attendant", "Detail crew", "Site manager", "Second tunnel"],
    gear: ["Better brushes & dryers", "Unlimited-wash memberships", "Fleet washing contracts"],
    rush: ["Pollen season: every car in town is yellow", "A rental company needs 80 cars cleaned today"] },
  garage: { verb: "Wrench", jobs: ["Do an oil change", "Swap brake pads", "Diagnose a check-engine light", "Rotate tires"],
    crew: ["Lube tech", "Mechanic", "Master tech", "Second bay"],
    gear: ["Diagnostic scanner", "Online booking & texts", "Fleet maintenance contracts"],
    rush: ["A delivery company's whole fleet is due for brakes", "Snowstorm: everyone needs new tires"] },
  gym: { verb: "Train", jobs: ["Teach the 6 a.m. class", "Run a personal training session", "Wipe down the machines", "Sign up a new member"],
    crew: ["Front desk", "Trainer", "Class instructor", "Second location"],
    gear: ["New equipment", "Member app", "Corporate wellness deals"],
    rush: ["New Year's resolutions: the sign-up line is out the door", "A company wants memberships for 200 staff"] },
  hvac: { verb: "Service", jobs: ["Service an AC unit", "Swap a furnace filter", "Install a heat pump", "Clean ductwork"],
    crew: ["Apprentice", "Service tech", "Install crew", "Dispatcher"],
    gear: ["Fully stocked trucks", "Maintenance plans", "Commercial contracts"],
    rush: ["Heat wave: every AC in town is dying", "A school's boiler quit in January"] },
  hardware: { verb: "Help", jobs: ["Mix a gallon of paint", "Cut keys", "Find the right bolt", "Unload a lumber delivery"],
    crew: ["Cashier", "Floor associate", "Lumber yard hand", "Store manager"],
    gear: ["Paint-matching machine", "Online order pickup", "Contractor accounts"],
    rush: ["A storm is coming: everyone needs plywood", "A builder wants a whole house's worth of lumber"] },
  // --- tier 3: regional ---
  grocery: { verb: "Stock", jobs: ["Stock the produce", "Run a register", "Unload the truck", "Face the shelves"],
    crew: ["Bagger", "Cashier", "Department manager", "Second store"],
    gear: ["Self-checkout lanes", "Online grocery pickup", "Store-brand products"],
    rush: ["Snowstorm warning: bread and milk are flying", "Holiday weekend: everyone needs a turkey"] },
  insure: { verb: "Quote", jobs: ["Quote a car policy", "Renew a homeowner", "Help with a claim", "Review a business policy"],
    crew: ["Customer service rep", "Licensed agent", "Commercial specialist", "Second office"],
    gear: ["Quoting software", "Referral program", "Business insurance department"],
    rush: ["A big employer wants a group policy quoted this week", "Hurricane season: everyone wants flood cover"] },
  hotel: { verb: "Check in", jobs: ["Check in a family", "Turn over a room", "Fix the ice machine", "Set up a meeting room"],
    crew: ["Housekeeper", "Front desk agent", "Events coordinator", "General manager"],
    gear: ["Room refresh", "Online booking engine", "Wedding & conference business"],
    rush: ["A convention in town: every room's booked", "A wedding party needs 40 rooms tonight"] },
  storage: { verb: "Rent", jobs: ["Rent out a unit", "Walk the property", "Cut a lock (unpaid rent)", "Sell boxes and tape"],
    crew: ["Office clerk", "Site manager", "Maintenance tech", "Second site"],
    gear: ["Gate keypads & cameras", "Online rentals", "Climate-controlled units"],
    rush: ["The college lets out: students need storage for the summer", "A moving company needs 20 units today"] },
  brewery: { verb: "Brew", jobs: ["Brew a batch", "Clean the tanks", "Pour in the taproom", "Can a run of beer"],
    crew: ["Taproom server", "Assistant brewer", "Head brewer", "Distribution rep"],
    gear: ["Bigger brewhouse", "Canning line", "Grocery distribution"],
    rush: ["A festival wants 50 kegs by Friday", "Your seasonal beer won a medal: everyone wants some"] },
  trucking: { verb: "Haul", jobs: ["Haul a load of lumber", "Run produce to the city", "Back into a tight dock", "Do a pre-trip inspection"],
    crew: ["Driver", "Dispatcher", "Mechanic", "Second terminal"],
    gear: ["Newer trucks", "Load-matching software", "Contracts with big shippers"],
    rush: ["A retailer's holiday stock has to move this week", "A factory needs parts overnight or it shuts down"] },
  dealer: { verb: "Sell", jobs: ["Give a test drive", "Close a deal", "Detail the lot", "Take a trade-in"],
    crew: ["Lot porter", "Salesperson", "Finance manager", "Service department"],
    gear: ["Bigger showroom", "Online car shopping", "Fleet sales to companies"],
    rush: ["Year-end sale weekend: the lot is packed", "A rental company wants 40 cars"] },
  // --- tier 4: big business ---
  software: { verb: "Ship code", jobs: ["Fix a bug", "Ship a feature", "Answer a support ticket", "Demo for a customer"],
    crew: ["Support rep", "Engineer", "Sales team", "Product team"],
    gear: ["Cloud hosting", "Self-serve sign-up", "Enterprise plan"],
    rush: ["A huge customer wants a pilot by Friday", "You're on the front page: sign-ups are pouring in"] },
  resort: { verb: "Host", jobs: ["Greet a guest", "Set up the beach cabanas", "Run the spa desk", "Plan a beach wedding"],
    crew: ["Housekeeper", "Spa therapist", "Events team", "Resort manager"],
    gear: ["New villas", "All-inclusive packages", "Destination weddings"],
    rush: ["A celebrity wedding wants the whole resort", "Spring break: every room's taken"] },
  studio: { verb: "Shoot", jobs: ["Shoot a scene", "Edit a trailer", "Cast a lead", "Pitch a script"],
    crew: ["Production assistant", "Editor", "Director", "Sound stage"],
    gear: ["Visual effects house", "Streaming deal", "A film series"],
    rush: ["Your movie is a hit: the sequel needs to start now", "A streamer wants a show by summer"] },
  hospital: { verb: "Treat", jobs: ["See a patient", "Run labs", "Staff the ER", "Schedule surgeries"],
    crew: ["Nurse", "Doctor", "Specialist", "Clinic network"],
    gear: ["New imaging center", "Telehealth visits", "Specialty heart center"],
    rush: ["Flu season: the ER is full", "A big employer wants your clinics for its staff"] },
  team: { verb: "Practice", jobs: ["Run practice", "Sell season tickets", "Scout a prospect", "Host a home game"],
    crew: ["Ticket sales rep", "Coach", "Star player", "Training complex"],
    gear: ["Stadium upgrade", "TV deal", "Merch everywhere"],
    rush: ["Playoff game: every seat is gone", "A rival star wants to sign with you"] },
  port: { verb: "Unload", jobs: ["Unload a container ship", "Stack containers", "Clear customs paperwork", "Load the rail cars"],
    crew: ["Crane operator", "Dockworker crew", "Logistics team", "New berth"],
    gear: ["Bigger cranes", "Container tracking system", "Rail connection"],
    rush: ["A big ship rerouted to you: unload it fast", "Holiday season: every berth is full"] },
  // --- tier 5: global ---
  park: { verb: "Run rides", jobs: ["Run the roller coaster", "Greet guests at the gate", "Sell churros", "Host the night parade"],
    crew: ["Ride operator", "Costumed character", "Show team", "New themed land"],
    gear: ["New roller coaster", "Season passes", "Park hotel"],
    rush: ["Summer break: the gates are swamped", "A new ride opens: the line wraps the park"] },
  airline: { verb: "Fly", jobs: ["Turn a plane around", "Board a flight", "Sell tickets", "Load bags"],
    crew: ["Gate agent", "Flight crew", "Pilots", "New route"],
    gear: ["New fuel-sipping jets", "Loyalty program", "International routes"],
    rush: ["Holiday travel: every flight is full", "Another airline grounded: their passengers need you"] },
  bank: { verb: "Lend", jobs: ["Open accounts", "Approve a home loan", "Fund a small business", "Balance the vault"],
    crew: ["Teller", "Loan officer", "Investment advisor", "Branch network"],
    gear: ["Mobile banking app", "Business banking", "Wealth management"],
    rush: ["Rates dropped: everyone wants to refinance", "A big company wants a loan this week"] },
  chips: { verb: "Fab", jobs: ["Run a wafer batch", "Test chips", "Clean the clean room", "Ship an order"],
    crew: ["Technician", "Process engineer", "Chip designer", "Second fab"],
    gear: ["Newer machines", "Better yield software", "Custom chips for big customers"],
    rush: ["A phone maker needs ten million chips", "A shortage hit: every buyer is calling you"] },
  rocket: { verb: "Launch", jobs: ["Stack a rocket", "Test an engine", "Load a satellite", "Count down a launch"],
    crew: ["Technician", "Propulsion engineer", "Mission control", "Second launch pad"],
    gear: ["Reusable boosters", "Satellite internet", "Moon missions"],
    rush: ["A satellite company needs a launch next week", "A space agency wants a ride for its crew"] },
};
