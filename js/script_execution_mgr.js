'use strict';
// window.RentalQuirks is where RentalQuirks saves any shared global context
window.RentalQuirks = {};
RentalQuirks.runAlways = [];
RentalQuirks.runOnPage = [];
RentalQuirks.pollRateMS = 1000;
RentalQuirks.navTimestamp = 0;

(function (runAlways, runOnPage, intervalPollRate) {
  'use strict';
  let oldScriptCount = runOnPage.length;
  // Since RentalWorks (dbwcloud.com) acts as a single-page application, we need to make
  // an extra effort to apply javascript to new pages as we navigate to them.
  let oldLocation = "";
  let pageScripts,
      runningPageScripts,
      numRunningPageScripts;
  let currentPollRate = intervalPollRate();
  let intervalID = setInterval(function runPollScripts () {
    // Run all runAlways functions in order. If any one of them returns true,
    // all subsequent scripts are skipped (including the remainder of runAlways).
    let shortCircuit = runAlways.some((item)=>item());
    if (shortCircuit) return;
    
    // Run all runOnPage scripts that match the current URL path.
    // If a script was successful and need not run again, runScript() returns true.
    let resetScripts = (location.href != oldLocation);
    if (runOnPage.length !== oldScriptCount) {
      // Rerun all scripts if new ones are added. Only happens as the page and scripts are loading.
      oldScriptCount = runOnPage.length;
      resetScripts = true;
    }
    if (resetScripts) {
      oldLocation = location.href;
      RentalQuirks.navTimestamp = Date.now();
      let path = location.pathname.slice(1) + location.search + location.hash; //Remove the leading slash
      pageScripts = runOnPage.filter(script => script.testPath(path));
      numRunningPageScripts = pageScripts.length;
      runningPageScripts = true;
    }
    
    if (runningPageScripts) {
      if (pageScripts.length) {
        if (numRunningPageScripts != pageScripts.length) {
          numRunningPageScripts = pageScripts.length;
          console.log('Running ' + numRunningPageScripts + ' active page scripts');
        }
      }
      else {
        console.log('All page scripts completed');
      }
    }

    if (pageScripts.length) {
      // Run all scripts and keep the ones that are not finished (return false)
      pageScripts = pageScripts.filter(script => !script.runScript());
    }
    else {
      runningPageScripts = false;
    }

    // Change polling rate if it's been adjusted, limit to no less than 30ms
    let newPollRate = intervalPollRate();
    if (newPollRate != currentPollRate && newPollRate > 30) {
      currentPollRate = newPollRate;
      clearInterval(intervalID);
      intervalID = setInterval(runPollScripts, currentPollRate);
    }

  }, currentPollRate);
})(RentalQuirks.runAlways, RentalQuirks.runOnPage, getSetPollRate);

function getSetPollRate (newValue) {
  return RentalQuirks.pollRateMS = newValue ?? RentalQuirks.pollRateMS;  
}
function msSincePageNav() {
  return Date.now() - RentalQuirks.navTimestamp;
}

/*
  //TODO: We could potentially use this MutationObserver to watch for when modules change,
  //      rather than polling to see if location.href has changed.
  
let moduleContainer = document.querySelector('#fw-app-body');
let onModuleChange = function (mutations, observer) {
    let addedModuleNames = mutations.map(mut => Array.from(mut.addedNodes).map(node => node.dataset.module)).flat();
    console.log(addedModuleNames);
    moduleObservers.filter(mo => addedModuleNames.includes(mo.name)).forEach(mo => mo.action());
};
let moduleChangeObserver = new MutationObserver(onModuleChange);
moduleChangeObserver.observe(moduleContainer, { childList: true });
*/