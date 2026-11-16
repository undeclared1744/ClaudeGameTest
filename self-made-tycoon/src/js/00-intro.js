"use strict";
/* =====================================================================
   SELF-MADE TYCOON
   Start with nothing but your own two hands (the Hustle button). Buy
   small businesses from the Deals board, expand them, and work your way
   up from a lawn care route to an airline. Every business for sale is
   generated on the spot: a real kind of business with a made-up name,
   a city, a location rating and a quirk, so no two runs look the same.

   HOW THE CODE IS ORGANISED
   This page is built from the files in src/ by build.py (edit those, not
   index.html). All the .js files below end up in this one <script>, in
   this order, sharing one scope:
     00-intro.js        - this overview
     01-data.js         - industries, name parts, quirks, problems, Deal sense levels, upgrades
     02-state.js        - the one object that IS your save
     03-math.js         - income, prices, legacy stars, Deal sense
     04-deals.js        - the deal generator (businesses for sale)
     05-actions.js      - hustle, buy, expand, upgrades, events, retire
     06-fixsell.js      - due diligence, fixing problems, selling businesses
     07-time.js         - the main loop and away-from-game earnings
     08-save.js         - this browser + your Claude account (syncs devices)
     09-screen.js       - numbers, the Deals / Empire / Upgrades / Retire / Stats tabs
     10-sheet.js        - the Manage sheet for one business, and the fix-up mini games
     11-skyline.js      - the night skyline drawing
     12-controls.js     - touch/mouse, keyboard, game controller
     20-invest.js       - the plug-in point for every investment type, and the Invest tab
     30-investments/    - one file per investment type (real estate, stocks, ...)
     99-start.js        - start up, and handles for the automated tests
   ===================================================================== */


