/* rq_common.js stores functions that are common across all the other modules.
   These functions are defined in the global context of this file, which equates
   to the global context of all files included with Tampermonkey @require tags.
   It is not, however, global to the context of the webpage it is running on, so
   it is not polluting the page's window namespace.
*/
/** Boolean value for any features that should only be run on the test/training domain */
const IS_TEST_SITE = location.pathname == "/training/";
/** The current RentalWorks URL up until (but excluding) the pound sign (#) */
const RW_URL = window.applicationConfig?.apiurl ?? location.origin + location.pathname;

/**
 * Fires a change event on an element so that the website's other scripts
 * know to act on the data as they would have if a user entered it.
 * @param {HTMLElement} elem The Element whose value has changed.
 */
function doChangeEvent(elem) {
    elem.dispatchEvent(new Event('change', { "bubbles": true }));
}

/**
 * Converts a string to Title Case, taking into account common exceptions in capitalization
 * for units, acronyms, etc. Also enforces single spacing.
 * @param {String} inputText The text to convert to Title Case
 * @returns The inputText converted to Title Case, taking into account certain exceptions.
 */
function toTitleCase(inputText) {
    let exceptions = ['m', 'in', 'ft', 'KIT', 'RGB', 'RGBW', 'RGBA', 'UV', 'LED', 'BWL', 'x', 'mAh', 'AC', 'DC', 'PHX', 'XLR', 'DMX', 'QC', 'w'];
    let exlow = exceptions.map(x => x.toLowerCase());
    // Match all words (sequences of letters) and replace with properly cased words
    let result = inputText.replace(/[a-z]+/gi, match => {
        let mlow = match.toLowerCase();
        let i = exlow.indexOf(mlow);
        return i == -1 ? mlow[0].toUpperCase() + mlow.substring(1) : exceptions[i];
    });
    //Remove extra spaces
    result = result.replace(/\s\s+/g, " ");
    return result;
}

/**
 * Call this on any containing Element to allow descendants of class 'rq-draggable' to be moved 
 * by the mouse when an Element of class 'rq-draghandle' within them is clicked and dragged.
 * @param {Element} container the context in which mouse events are monitored for dragging elements. Defaults to document.body.
 */
let WindowDragger = function (container) {
  if (!container) {
    container = document.body;
  }
  container.addEventListener("mousedown", on_drag_start, false);
  container.addEventListener("mouseup", on_drag_end, false);
  container.addEventListener("mousemove", on_drag, false);

  let drag_item = null;
  let currentX, currentY;
  let initialX, initialY;
  let offsetX = 0, offsetY = 0;

  function on_drag_start(e) {
    initialX = e.clientX - offsetX;
    initialY = e.clientY - offsetY;
    if (e.target.classList.contains('rq-draghandle')) {
      drag_item = e.target.closest('.rq-draggable');
    }
  }
  function on_drag(e) {
    if (drag_item) {
      e.preventDefault();
      currentX = e.clientX - initialX;
      currentY = e.clientY - initialY;
      offsetX = currentX;
      offsetY = currentY;
      //https://www.kirupa.com/html5/drag.htm
      drag_item.style.transform = "translate3d(" + currentX + "px, " + currentY + "px, 0)";
    }
  }
  function on_drag_end(e) {
    //TODO: https://stackoverflow.com/questions/442404/retrieve-the-position-x-y-of-an-html-element
    //      If dragged out of bounds, snap to an edge.
    initialX = currentX;
    initialY = currentY;
    drag_item = null;
  }
};

const LOG = console.log.bind(console);