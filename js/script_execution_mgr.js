'use strict';
// window.RentalQuirks is where RentalQuirks saves any shared global context
window.RentalQuirks = {};
RentalQuirks.runAlways = []; // Scripts are run coninuously, at interval specified by pollRateMS. If any function returns true, all subsequent functions are skipped for that iteration.
RentalQuirks.runOnPage = []; // Scripts are validated on page navigation with testPath(path), and then valid scripts have runScript() run at interval, or until runScript returns true. 
RentalQuirks.pollRateMS = 1000;
RentalQuirks.navTimestamp = 0;

// Since RentalWorks (rentalworks.cloud) acts as a single-page application, we need to make
// an extra effort to apply javascript to new pages as we navigate to them.
// This will be sufficient for some scripts, but RentalWorks URLs are only as specific 
// as the Module name, so other strategies (like MutationObservers) are necessary (and 
// available further on in this file).
(function (runAlways, runOnPage, intervalPollRate) {
  'use strict';
  let oldScriptCount = runOnPage.length;
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


/**
 * For all nodes n added as children to parent, check if test_child(n) is true, and if so, run do_to_child(n).
 * @param test_child can be a function in which test_child(n) is true for valid child n, OR
 * test_child can be a querySelector string in which n.matches(test_child) is true for valid child n.
 * @param only_once If true, only the very first added node where test_child(n) is true will get do_to_child(n).
 * @param timeout_ms time in milliseconds after which monitoring stops and any newly added children will not get do_to_child(n).
 * If only_once = false and timeout_ms = 0 (default values), monitoring will contine for as long as parent exists in the DOM.
**/
function for_child_added(parent, test_child, do_to_child, only_once = false, timeout_ms = 0) {
  // test_child can be a function or a querySelector string
  let test_child_fn = test_child;
  if (typeof test_child == 'string') {
    test_child_fn = (child) => child.matches(test_child);

  }
  timeout_ms = Number.parseInt(timeout_ms) || 0;
  let timeout_id = 0; // Dummy value, real ID set later
  const when_observed = function (mutations, observer) {
    // Round up all the newly added nodes for which test_child(node) is true
    let good_children = mutations.flatMap((mut) => Array.from(mut.addedNodes).filter(test_child_fn));
    if (good_children.length) {
      if (only_once) {
        // Only do the thing to the first added child, and no others
        do_to_child(good_children[0]);
        // Our job is done, shut everything down
        observer.disconnect();
        if (timeout_ms > 0) {
          clearTimeout(timeout_id);
        }
      }
      else { // Do the thing to every newly added child
        good_children.forEach(do_to_child);
      }
    }
  };
  let obs = new MutationObserver(when_observed);
  obs.observe(parent, { childList: true });

  if (timeout_ms > 0) {
    timeout_id = setTimeout(() => {
      let remaining = obs.takeRecords(); // Sometimes there are unhandled MutationRecords
      obs.disconnect(); // It's okay to call this twice
      if (remaining.length) {
        when_observed(remaining);
      }
    }, timeout_ms);
  }
};

/**
 * Based on https://gist.github.com/jwilson8767/db379026efcbd932f64382db4b02853e
 * MIT Licensed
 * Author: jwilson8767
 * Waits for an element satisfying selector to exist, then resolves promise with the element.
 * This is most appropriate for waiting on a single element as the page loads.
 *
 * @param {String} selector querySelector string matching the Element that we're waiting for.
 * @param {Element} root the Element that the MutationObserver is attached to (defaults to document root).
 * @param {Object} observerOptions options passed directly to the MutationObserver (defaults to monitor subtree).
 * @returns {Promise} as soon as a match is found.
 */
function elementReady(selector, root = document.documentElement, observerOptions = { childList: true, subtree: true }) {
  return new Promise((resolve, reject) => {
    // Resolve immediately if a matching element already exists
    let el = root.querySelector(selector);
    if (el) {
      resolve(el);
      return;
    }
    // Monitor changes until a matching element is found
    new MutationObserver((mutationRecords, observer) => {
      let match = root.querySelector(selector)
      if (match) {
        resolve(match);
        //Once we have resolved we don't need the observer anymore.
        observer.disconnect();
      }
    })
      .observe(root, observerOptions);
  });
}

/**
 * Calls a function on a DOM Element when it is assigned a specific class. Can happen repeatedly.
 * @param {String} class_name the className to be added.
 * @param {Element} root the Element that the MutationObserver is attached to (defaults to document root).
 * @param {Function} do_to_elem the function to run when class_name is added, the target Element provided as a parameter.
 */
function on_class_added(class_name, root = document.documentElement, do_to_elem) {
  const observerOptions = {
    attributeFilter: ["class"], 
    attributeOldValue: true, 
    subtree: true
  };
  new MutationObserver((mutations, observer) => {
    // Round up all the newly added nodes which have just had class_name added to their classList
    mutations.filter((mut) => mut.target.classList.contains(class_name))
             .filter((mut) => !mut.oldValue.split(' ').includes(class_name))
             .forEach(m => do_to_elem(m.target));
  }).observe(root, observerOptions);
}