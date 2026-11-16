
/* =====================================================================
   INVESTMENT: REAL ESTATE  (not built yet)
   Planned: Buy property for rent. Pay cash or take a mortgage (20% down, a fixed
   payment per second that pays interest plus some of the loan). A
   property market number that rents and values follow, drifting up with
   swings. Fixer-upper / Dated / Good / Renovated condition; renovate to
   raise rent and value, then sell (6% fees, takes time). Foreclosure if
   cash runs out with payments due. A "tenant's offer" event.
   A half-built version written before the split is in the project files:
   self-made-tycoon/real-estate-wip.patch (+ its tests). It was written
   straight into the old single file, so port it into this module.

   To build it, replace this comment's "not built yet" and call
   registerInvestment() (see 20-invest.js for every hook), for example:

     registerInvestment({
       id: "real-estate", name: "Real estate", order: 10, unlockTier: 1,
       fresh: () => ({ }),
       validate: saved => ({ }),
       earn(seconds) { return 0; },
       render(card, full) { },
     });

   Keep everything for this investment in this file. Its tests go in
   tests/invest_real_estate.py and run on the built index.html.
   ===================================================================== */
