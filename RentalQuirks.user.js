// ==UserScript==
// @name         RentalQuirks - Feature enhancements for RentalWorks Web
// @namespace    https://www.github.com/acropup/RentalQuirks/
// @version      1.3
// @description  RentalQuirks is a collection of Javascript and CSS customizations that improve usability, layout, and features of the web-based "RentalWorks" rental management software at rentalworksweb.com
// @homepageURL  https://www.github.com/acropup/RentalQuirks
// @author       Shane Burgess
// @match        *://*.dbwcloud.com/*
// @match        *://*.rentalworksweb.com/*
// @grant        none
// @noframes
// @require      https://raw.githubusercontent.com/acropup/RentalQuirks/master/js/script_execution_mgr.js
// @require      https://raw.githubusercontent.com/acropup/RentalQuirks/master/js/rq_p_login.js
// @require      https://raw.githubusercontent.com/acropup/RentalQuirks/master/js/rq_common.js
// @require      https://raw.githubusercontent.com/acropup/RentalQuirks/master/js/rq_all_pages.js
// @require      https://raw.githubusercontent.com/acropup/RentalQuirks/master/js/rq_server_api.js
// @require      https://raw.githubusercontent.com/acropup/RentalQuirks/master/js/rq_p_rentalinventory.js
// @require      https://raw.githubusercontent.com/acropup/RentalQuirks/master/js/lib/ZebraBrowserPrint/BrowserPrint-3.0.216.min.js
// @require      https://raw.githubusercontent.com/acropup/RentalQuirks/master/js/lib/ZebraBrowserPrint/BrowserPrint-Zebra-1.0.216.min.js
// @require      https://raw.githubusercontent.com/acropup/RentalQuirks/master/js/rq_barcode.js
// ==/UserScript==

// This is the root Tampermonkey script of RentalQuirks. All code is
// included via the @require tags above, to allow for easy development.
// https://stackoverflow.com/questions/49509874/how-to-update-tampermonkey-script-to-a-local-file-programmatically
(function() {
  'use strict';

  // This is the last command to run during the initialization phase of all the above @require scripts.
  // If this does not show in the Developer Console on page load, then one of the above scripts has
  // probably failed and caused the script to end prematurely. Check the console for any unhandled errors.
  console.log('--- RentalWorks - Quirks mode activated ---');
  // Everything that runs after this is a result of event listeners or setTimeout/setInterval events.
})();