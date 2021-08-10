
(function (RQ) {
    'use strict';

    RQ.runOnPage.push({
        testPath: (path) => !!path.match(/\/rentalworks\/#\/module\/rentalinventory$/),
        runScript: watchForNewModuleTabs
    });

    RQ.rentalInventory ??= {};
    RQ.rentalInventory.kit = 
    {
        //columns of interest list the 'data-caption' values of columns we care about
        coi: ['I-Code', 'Description', 'Quantity/%', 'Option', 'Charge'],
        scratchpad: [],
        injectUI: injectUI,
        copyTableData: copyTableData,
    };

    function getTableRowCount(tableContainer) {
        //rowText will be of the form "12 rows", or "1 to 15 of 26 rows" if table is split onto multiple pages
        let rowText = tableContainer.querySelector('.pager .count').innerText.split(' ').reverse()[1];
        return Number.parseInt(rowText);
    }

    function copyTableData() {
        let coi = RQ.rentalInventory.kit.coi;
        let tableBody = document.querySelector('#moduletabs > .tabpages > .tabpage.active div[data-name="InventoryKitGrid"] tbody');
        let kitRows = Array.from(tableBody.childNodes);
        // Find all the rows that are selected (leftmost checkbox checked)
        let selectedKitRows = kitRows.filter((row) => !!row.querySelector('.tdselectrow input[type="checkbox"]:checked'));
        // If any rows are selected, only copy those rows. If no rows are selected, copy all rows.
        kitRows = selectedKitRows.length ? selectedKitRows : kitRows;
        let result = kitRows.map((row) =>
            coi.map((columnName) => {
                let foundCell = Array.from(row.childNodes).find((cell) => cell?.firstChild.dataset.caption == columnName);
                let checkbox = foundCell.querySelector('input[type="checkbox"]');
                if (checkbox) return checkbox.checked ? columnName[0] : ''; // Identify a checked checkbox with the first letter of the column name
                else return foundCell.firstChild?.firstChild.textContent || '???';
            }));

        RQ.rentalInventory.kit.scratchpad = result;
        result.unshift(coi); //Add column names to result
        console.log(result);
        let resultAsText = result.map((row) => row.join(', ')).join('\n');
        console.log(resultAsText);
        //TODO: Maybe copy to user's clipboard https://www.30secondsofcode.org/blog/s/copy-text-to-clipboard-with-javascript
        return result;
    }

    /**
 * Checks to see if the value of inputField (presumably already set) should be validated
 * before continuing. This is specifically for fields within tables on RentalWorks. If the
 * field needs validation, we trigger the validation routine and wait for it to finish.
 * @param {HTMLElement} inputField The DOM element that data has been entered into.
 */
    async function maybeValidateTableField(inputField) {
        let fieldContainer = inputField.closest('.field');
        if (fieldContainer.dataset.formdatatype == "validation") {
            //hiddenField for I-Codes contains the item's InventoryId, and will be filled out as soon as the I-Code is validated
            let hiddenField = fieldContainer.querySelector('input.value[type="hidden"]');
            let oldHiddenValue = hiddenField.value;
            //Trigger the validation routine
            doChangeEvent(inputField);
            while (hiddenField.value == oldHiddenValue) {
                await new Promise(requestAnimationFrame);
            }
        }
    }

    /**
 * Inserts row data into a table's available input row.
 * @param {HTMLElement} inputRowElem The new (empty) row element (as a result of clicking the + button) to be filled out.
 * @param {string[]} coi Columns of Interest, names of columns that will be entered.
 * @param {string[]} rowData Array of row data to insert, with one value per column of interest.
 * @returns true if successful, in which the row's Save button should be clicked.
 * @returns false if failed, in which errors should be resolved, or the row's Cancel button should be clicked.
 */
    async function insertTableRow(inputRowElem, coi, rowData) {
        //Array.forEach() doesn't respect await the way you'd want it to, so we have to use oldschool for loops
        for (let icol = 0, value = rowData[icol]; icol < rowData.length; value = rowData[++icol]) {
            let inputField = inputRowElem.querySelector(`td.column .field[data-caption="${coi[icol]}"] input:not([type="hidden"])`);
            if (inputField) {
                if (inputField.type == "text") {
                    inputField.value = value;
                    await maybeValidateTableField(inputField);
                }
                else if (inputField.type == "checkbox") {
                    //Check as true if value is first letter of column title, or some other truthy value
                    inputField.checked = (value == coi[icol][0]
                        || value == 'true'
                        || value == 'checked'
                        || value == 1
                        || value == true);
                }
                else {
                    console.log(`Error: Input field '${coi[icol]}' is of type '${inputField.type}' and I didn't expect that.`);
                    return false;
                }
            }
            else {
                console.log(`Error: Input field '${coi[icol]}' not found.`);
                return false;
            }
        }
        //The input row is successfully filled out and ready to be saved
        return true;
    };

    /**
 * Bulk insert of table data.
 * @param {string[]} coi Columns of Interest, names of columns that will be entered.
 * @param {string[][]} dataset Array of row data, where row data is a string[] where values relate to Columns of Interest.
 */
    async function insertTableData(coi, dataset) {
        let successes = 0;
        let failures = 0;
        let tableContainer = document.querySelector('#moduletabs > .tabpages > .tabpage.active div[data-name="InventoryKitGrid"]');

        let initialItemCount = getTableRowCount(tableContainer);
        let oldRowCount = initialItemCount;
        console.log(`starting with ${initialItemCount} rows`);
        let plusBtn = tableContainer.querySelector('.gridmenu .buttonbar .btn[data-type="NewButton"]');

        //Remove the first row, if it's a header row
        if (dataset[0][0] == coi[0]) { //Naive header row detection
            dataset.shift(1);
        }
        for (let irow = 0, rowData = dataset[irow]; irow < dataset.length; rowData = dataset[++irow]) {
            if (plusBtn.style.display == "none") {
                console.log("Waiting for current row edit to finish...");
                do {
                    await new Promise(requestAnimationFrame);
                } while (plusBtn.style.display == "none");
            }

            plusBtn.click();
            let newRow = tableContainer.querySelector('tr.editrow.newmode');
            if (await insertTableRow(newRow, coi, rowData)) {
                console.log(newRow.querySelector(`td.column .field[data-caption="I-Code"] input:not([type="hidden"])`).value);
                successes++;
                newRow.querySelector('.divsaverow').click();
                //Wait for save to process
                do {
                    await new Promise(requestAnimationFrame);
                } while (plusBtn.style.display == "none"                       //'Add Item' button is hidden
                || tableContainer.querySelector('tr.editrow.newmode') //new row (undergoing submission) still exists
                    || oldRowCount == getTableRowCount(tableContainer));  //row count hasn't been updated
                oldRowCount = getTableRowCount(tableContainer);
                console.log('Row saved.');
            }
            else {
                failures++;
                newRow.querySelector('.divcancelsaverow').click();
            }
        }
        if (successes > 0) console.log('Done: ' + successes + ' rows inserted.');
        if (failures > 0) console.log('Error: ' + failures + ' row insertions failed.');
        let diff = initialItemCount + successes - getTableRowCount(tableContainer);
        if (diff) {
            console.log(`Warning! ${diff} of the rows were not added for some reason.`);
        }
        console.log(`started with ${initialItemCount} rows`);
        console.log(`ending with ${getTableRowCount(tableContainer)} rows`);
    };

    function watchForNewModuleTabs() {
        let newTabObserver = new MutationObserver((mutations, observer) => {
            let newTabAdded = mutations.find(mr => mr.addedNodes.length > 0);
            if (newTabAdded) {
                
                //TODO: We might need to handle more than one added node at a time in the future.
                if (newTabAdded.addedNodes.length > 1) {
                    console.error("Unhandled: Observed multiple tabs added simultaneously.");
                }
                let tabDiv = newTabAdded.addedNodes[0];
                if (tabDiv.dataset.tabtype == "FORM"
                    && tabDiv.firstElementChild.dataset.controller == "RentalInventoryController") {
                    //Whenever a new module tab is opened (one representing an item, kit, etc), inject our custom UI
                    RQ.rentalInventory.kit.injectUI();
                }
                else if (tabDiv.dataset.tabtype == "BROWSE") {
                    RQ.rentalInventory.browse.injectUI();
                }
            }
        });
        let tabPages = document.querySelector('#moduletabs > .tabpages');
        if (tabPages) {
            newTabObserver.observe(tabPages, { childList: true });
            return true; //Success
        }
    }

    function injectUI() {
        let gridToolbar = document.querySelector('#moduletabs > .tabpages > .tabpage.active div[data-name="InventoryKitGrid"] .gridmenu .buttonbar');

        let bulkAddBtn = document.createElement('div');
        bulkAddBtn.className = 'btn rquirks';
        bulkAddBtn.dataset.type = 'AddTable';
        bulkAddBtn.title = 'Insert table data from clipboard';
        bulkAddBtn.innerHTML = '<i class="material-icons">post_add</i>'; //From https://fonts.google.com/icons
        gridToolbar.insertBefore(bulkAddBtn, gridToolbar.firstChild);
        bulkAddBtn.addEventListener('click', () => insertTableData(RQ.rentalInventory.kit.coi, RQ.rentalInventory.kit.scratchpad));

        let copyBtn = document.createElement('div');
        copyBtn.className = 'btn rquirks';
        copyBtn.dataset.type = 'copyTableData';
        copyBtn.title = 'Copy table data to clipboard';
        copyBtn.innerHTML = '<i class="material-icons">content_copy</i>'; //From https://fonts.google.com/icons
        gridToolbar.insertBefore(copyBtn, gridToolbar.firstChild);
        copyBtn.addEventListener('click', copyTableData);

        //TODO: addUI should work for Completes as well as kits, and probably other tables as well.
        //      Unfortunately, copyTableData and insertTableData are hardcoded for kits, wherever it says div[data-name="InventoryKitGrid"]
        // let completeBtnBar = document.querySelector('#moduletabs > .tabpages > .tabpage.active div[data-name="InventoryCompleteGrid"] .gridmenu .buttonbar');
        // bulkAddBtn = bulkAddBtn.cloneNode(true);
        // copyBtn = copyBtn.cloneNode(true);
        // bulkAddBtn.addEventListener('click', bulkAdd);
        // copyBtn.addEventListener('click', copyTableData);
        // completeBtnBar.insertBefore(bulkAddBtn, completeBtnBar.firstChild);
        // completeBtnBar.insertBefore(copyBtn, completeBtnBar.firstChild);

        let tabToolbar = document.querySelector('#moduletabs > .tabpages > .tabpage.active > .fwform > .fwform-menu .buttonbar');
        let copyFieldsBtn = document.createElement('div');
        copyFieldsBtn.className = 'btn rquirks';
        copyFieldsBtn.dataset.type = 'CopyFormFieldsButton';
        copyFieldsBtn.title = 'Choose and copy form fields on this page';
        copyFieldsBtn.innerHTML = '<i class="material-icons">content_copy</i>Copy Fields'; //From https://fonts.google.com/icons
        tabToolbar.insertBefore(copyFieldsBtn, null);
        copyFieldsBtn.addEventListener('click', clickCopyFieldsButton);

        let pasteFieldsBtn = document.createElement('div');
        pasteFieldsBtn.className = 'btn rquirks';
        pasteFieldsBtn.dataset.type = 'PasteFormFieldsButton';
        pasteFieldsBtn.title = 'Paste copied data into form fields on this page';
        pasteFieldsBtn.innerHTML = '<i class="material-icons">content_paste</i>Paste Fields'; //From https://fonts.google.com/icons
        tabToolbar.insertBefore(pasteFieldsBtn, null);
        pasteFieldsBtn.addEventListener('click', clickPasteFieldsButton);
    };

    /**
     * Click event handler that allows user to choose fields to copy.
     * Overrides any other click handlers when clicking on INPUT elements.
     * If elements are getting focus during clicks, also register this as
     * a 'mousedown' event, as that is where focus is set. That way, 'mousedown'
     * will get preventDefault() as well.
     * @param {Event} clickEvent the mouse 'click' or 'mousedown' event object
     */
    function chooseInputFields(clickEvent) {
        if (clickEvent.target.tagName == 'INPUT') {
            if (clickEvent.type == "click") {
                let containingPage = this;
                let wrapperDiv = clickEvent.path.find((elem) => elem.classList.contains('fwformfield')); //TODO: classList is undefined sometimes???
                let fieldName = wrapperDiv.dataset.datafield;

                if (wrapperDiv.classList.toggle('rqselected')) {
                    containingPage.rqSelectedFieldNames.add(fieldName);
                    console.info("Select " + fieldName);
                }
                else {
                    containingPage.rqSelectedFieldNames.delete(fieldName);
                    console.info("Remove " + fieldName);
                }
            }
            // Prevent other click events from responding to the click event while we're choosing fields
            // Also, if handling mousedown events, this prevents the element from gaining focus
            clickEvent.stopPropagation();
            clickEvent.preventDefault();
        }
    }

    /**
    * Copying is a two-step process. The first click enables field selection mode,
    * where user can click all the fields they want to copy. When satisfied, the
    * user clicks again (runs this function a second time) and this simultaneously
    * disables field selection mode and copies the contents of each selected field.
    **/
    function clickCopyFieldsButton(event) {
        let copyBtn = event.target;
        let pasteBtn = event.target.parentElement.querySelector('[data-type="PasteFormFieldsButton"]');
        let targetTabPage = copyBtn.closest('.tabpage');
        if (copyBtn.classList.toggle('working')) {
            //Begin selection mode, where user can select and deselect any fields
            pasteBtn?.classList.add('disabled');
            targetTabPage.rqSelectedFieldNames ??= new Set();
            /////////////////////if (targetTabPage.rqSelectedFieldNames.size == 0) {
            let storedNames = localStorage.getItem("rqSelectedFieldNames")?.split(',');
            storedNames?.forEach(name => targetTabPage.rqSelectedFieldNames.add(name));
            /////////////////}

            targetTabPage.addEventListener('click', chooseInputFields);
            targetTabPage.addEventListener('mousedown', chooseInputFields); // To prevent clicked fields from gaining focus
            targetTabPage.rqSelectedFieldNames.forEach((name) => {
                let fieldWrapperDiv = targetTabPage.querySelector(`.fwformfield[data-datafield="${name}"`);
                fieldWrapperDiv?.classList.add('rqselected');
            });
        }
        else { //Finish selection mode, and copy the values of all selected fields
            targetTabPage.removeEventListener('click', chooseInputFields);
            targetTabPage.removeEventListener('mousedown', chooseInputFields);
            //Clear any copied data from before
            RQ.rentalInventory.copiedFields = new Map();
            let selectedFieldNames = Array.from(targetTabPage.querySelectorAll('.rqselected')).map((x) => x.dataset.datafield);
            //TODO: compare to targetTabPage.rqSelectedFieldNames -------but by querying
            //them explicitly like this, it will be more obvious if anything unexpected or undesirable happens.
            window.localStorage.setItem("rqSelectedFieldNames", selectedFieldNames.join(','));
            let info = 'Copying fields:\n';
            selectedFieldNames.forEach((name) => {
                let fieldWrapperDiv = targetTabPage.querySelector(`.fwformfield[data-datafield="${name}"`);
                fieldWrapperDiv?.classList.remove('rqselected');
                //Copy each field name and value into a Map/Dictionary
                let value = getFieldValue(fieldWrapperDiv);
                if (value) { // Protect from things like radio buttons that are entirely disabled or otherwise have no options selected
                    info += `  ${name} = ${value}\n`;
                    RQ.rentalInventory.copiedFields.set(name, value);
                }
                else {
                    info += `  (Ignoring ${name}, value is "${value}")\n`;
                }
            });
            console.info(info);
            pasteBtn?.classList.remove('disabled');
        }
    }

    function getFieldValue(fieldWrapperDiv) {
        switch (fieldWrapperDiv.dataset.type) {
            case "validation": //fallthrough - same as "text"
            case "text":
                return fieldWrapperDiv.querySelector('input[type="text"]')?.value;
                break;
            case "checkbox":
                return fieldWrapperDiv.querySelector('input[type="checkbox"]')?.checked;
                break;
            case "togglebuttons": //fallthrough - same as "radio"
            case "radio": //Return the name of the radio button that's selected
                return fieldWrapperDiv.querySelector('input[type="radio"]:checked')?.value;
                break;
            default:
                console.error('data-text attribute not recognized for this fwformfield div:');
                console.error(fieldWrapperDiv);
        }
    }

    async function setFieldValue(fieldWrapperDiv, value) {
        let field = undefined;
        switch (fieldWrapperDiv.dataset.type) {
            case "validation":
                fieldWrapperDiv.querySelector('input[type="text"]').value = value;
                await validateFormField(fieldWrapperDiv);
                break;
            case "text":
                field = fieldWrapperDiv.querySelector('input[type="text"]');
                field.value = value;
                doChangeEvent(field);
                break;
            case "checkbox":
                field = fieldWrapperDiv.querySelector('input[type="checkbox"]');
                field.checked = value;
                doChangeEvent(field);
                break;
            case "togglebuttons": //fallthrough - same as "radio"
            case "radio": //value is the name of the radio button that's selected
                field = fieldWrapperDiv.querySelector(`input[type="radio"][value="${value}"`);
                field.checked = true;
                doChangeEvent(field);
                break;
            default:
                console.error('data-text attribute not recognized for this fwformfield div:');
                console.error(fieldWrapperDiv);
        }
    }

    /**
 * Trigger the validation routine for the specified field, presumably because the
 * value was just changed through javascript. We wait for validation to finish
 * because some validation routines require another (earlier) field to be validated.
 * @param {HTMLElement} fieldWrapperDiv The .fwformfield element that contains the
 * visible input (textbox) field as well as a hidden input field (used for validation).
 */
    async function validateFormField(fieldWrapperDiv) {
        //hiddenField will be filled out as soon as the visible field is validated
        let hiddenField = fieldWrapperDiv.querySelector('input[type="hidden"]');
        let inputField = fieldWrapperDiv.querySelector('input:not([type="hidden"])');
        if (hiddenField && inputField) {
            let oldHiddenValue = hiddenField.value;
            //Trigger the validation routine
            doChangeEvent(inputField);
            while (hiddenField.value == oldHiddenValue) {
                await new Promise(requestAnimationFrame);
            }
        }
    }

    async function clickPasteFieldsButton(event) {
        let pasteBtn = event.target;
        if (pasteBtn.classList.contains('disabled')) return;
        let targetTabPage = pasteBtn.closest('.tabpage');
        let fieldMap = RQ.rentalInventory.copiedFields;
        if (fieldMap) {
            for (const kv of fieldMap) {
                let fieldName = kv[0];
                let value = kv[1];
                let fieldWrapperDiv = targetTabPage.querySelector(`.fwformfield[data-datafield="${fieldName}"]:not([disabled])`);
                if (fieldWrapperDiv) {
                    console.info(`Paste field ${fieldName} = ${value}`)
                    await setFieldValue(fieldWrapperDiv, value);
                }
                else {
                    console.log("Did not paste field " + fieldName);
                }
            }
        }
    }

})(window.RentalQuirks);


(() => {
    let textField = document.getSelection().anchorNode?.querySelector('input[type="text"]');
    let oldText = textField?.value;
    if (oldText) {
        let exceptions = ['m', 'in', 'ft', 'KIT', 'RGB', 'LED', 'BWL', 'x', 'mAh'];
        let exlow = exceptions.map(x => x.toLowerCase());
        let newText = oldText.replace(/[a-z]+/gi, match => {
            let mlow = match.toLowerCase();
            let i = exlow.indexOf(mlow);
            return i == -1 ? mlow[0].toUpperCase() + mlow.substring(1) : exceptions[i];
        });
        newText = newText.replace(/\s\s+/g, " ");
        if (newText != oldText) {
            textField.value = newText;
            textField.dispatchEvent(new Event('change', { "bubbles": true }));
        }
    }
})();

/*
(() => {
    let textField = document.getSelection().anchorNode.querySelector('input[type="text"]');
    let oldText = textField?.value;
    if (oldText) {
        let exceptions = ['m', 'in', 'ft', 'KIT', 'RGB', 'LED', 'BWL', 'x', 'mAh'];
        let exlow = exceptions.map(x => x.toLowerCase());
        let newText = oldText.replace(/[a-z]+/gi, match => {
            let mlow = match.toLowerCase();
            let i = exlow.indexOf(mlow);
            return i == -1 ? mlow[0].toUpperCase() + mlow.substring(1) : exceptions[i];
        });
        if (newText != oldText) {
            setFieldValue(textField.parentElement, newText);
        }
    }
})();
*/