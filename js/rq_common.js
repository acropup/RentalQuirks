/* rq_common.js stores functions that are common across all the other modules.
   These functions are defined in the global context of this file, which equates
   to the global context of all files included with Tampermonkey @require tags.
   It is not, however, global to the context of the webpage it is running on, so
   it is not polluting the page's window namespace.
*/

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
    let exceptions = ['m', 'in', 'ft', 'KIT', 'RGB', 'RGBW', 'RGBA', 'LED', 'BWL', 'x', 'mAh', 'AC', 'DC', 'PHX', 'XLR', 'DMX', 'QC', 'w'];
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