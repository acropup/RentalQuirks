/** 
 * Some nomenclature for RentalWorks
 * "Record Browser" is the kind of table in which you view and search for lists of records. Found on Rental Inventory, Sales Inventory, Customer tab, etc.
 * https://support.dbworks.com/hc/en-us/articles/360057454273-The-Records-Browser
 * "Record Form" is the tab in which you view and edit a particular record (say, a rental inventory item).
 * "Grid" is a table, usually within a record form, in which records are added, removed, and edited within the grid. For example, the "Grid" of kit items.
 * https://support.dbworks.com/hc/en-us/articles/360057454273-The-Records-Browser
 * 
 */
(function (RQ) {
    'use strict';
    addGlobalApplicationButtons();
    setTimeout(addPopupButtons, 5000); //setTimeout to ignore all the initial DOM modifications upon page load 
    RQ.runOnPage.push({
        testPath: (path) => true,
        runScript: injectBrowseTableUI
    });
	RQ.runAlways.push(showRQVersionNumber); //TODO: This doesn't need to run continuously, it just needs to succeed once.
	
    RQ.rentalInventory ??= {};
    RQ.rentalInventory.browse = 
    {
        injectUI: injectBrowseTableUI
    };

	function showRQVersionNumber() {
		let logoElem = document.querySelector(".app-title .bgothm");

		if (logoElem && window.applicationConfig?.version) {
			// The CSS takes this data attribute and applies to a pseudo-element
			logoElem.dataset.rwver = window.applicationConfig.version;
		}
	}

    function injectBrowseTableUI() {
        let table = document.querySelector('.tabpage.active[data-tabtype="BROWSE"] .tablewrapper > table');
        if (!table) return;
        let headerRow = table.querySelector('thead > tr.fieldnames');
        let tableBody = table.querySelector('tbody');

        /**
         * Ctrl+click a table body cell to filter table to show only rows with that value.
         * @param {MouseEvent} clickEvent listening on tbody element of table 
         */
        function clickSortableTable(clickEvent) {
            if (clickEvent.type == "click" && clickEvent.ctrlKey) {
                let cell = clickEvent.target;
                let cellVal = cell.innerText;
                if (cellVal) {
                    let colName = cell.dataset.caption;
                    let colHead = headerRow.querySelector(`td.column .field[data-caption="${colName}"]`);
                    let filterColField = colHead?.querySelector('.search input[type="text"]');
                    if (filterColField) {
                        filterColField.value = cellVal;
                        doChangeEvent(filterColField);
                    }
                }
            }
        }
        tableBody.addEventListener('click', clickSortableTable);

        // --- Header row click functionality ---
        // Left click toggles between sort up and sort down, and also removes sort on any existing columns.
        // Ctrl + left click to maintain existing sort columns.
        // Right click brings up menu, just like default RentalWorks left click behaviour.
        
        headerRow.addEventListener('click', e => {
            if (e.button != 0) return true;
            let iHeaderMenu = e.path.findIndex(x => x.classList?.contains('columnoptions'));
            if (iHeaderMenu >= 0) {
                // Clicked within the header sort/filter menu
                // Let the event get handled as usual
                return true;
            }
            else {
                let headerCaption = e.path.find(x => x.classList?.contains('fieldcaption'));
                if (headerCaption) { // Clicked on the header (not on the menu, not on the search field)
                    // Prevent menu from being opened
                    e.stopPropagation();
                    // Click a menu item based on its innerText
                    const clickHeaderMenuItem = function (fieldCaption, menuItemText) {
                        let menuItems = Array.from(fieldCaption.querySelectorAll('.columnoptions > .columnoptions-button'));
                        let itemToClick = menuItems.find(x => x.innerText.includes(menuItemText));
                        // Do not bubble, to prevent the menu from opening unnecessarily
                        return itemToClick?.dispatchEvent(new Event('click', { bubbles: false }));
                    };
                    // Left-clicking the header toggles column sort direction, defaults to Asc if not yet sorted
                    let sort = headerCaption.parentElement.dataset.sort;
                    let sortText = (sort != "asc") ? "Sort Ascending" : "Sort Descending";
                    if (clickHeaderMenuItem(headerCaption, sortText)) {
                        // Clicking while holding Ctrl key keeps existing sorted columns sorted
                        if (!e.ctrlKey) {
                            // Get all headers where sorting is turned on (data-sort="asc" or data-sort="desc")
                            // and turn sorting off for those columns (excluding the one we just clicked)
                            let sortedHeaders = Array.from(headerRow.querySelectorAll('td.column[data-visible="true"] > .field[data-sort$="sc"] > .fieldcaption'));
                            sortedHeaders.forEach(hCap => {
                                if (hCap != headerCaption) {
                                    clickHeaderMenuItem(hCap, "Sort Off");
                                }
                            })
                        }
                    }
                }
            }

        }, { capture: true });

        // This is how right click is handled, not through 'click' or 'auxclick' events
        headerRow.addEventListener('contextmenu', e => {
            if (e.button == 2) { // Only handle contextmenu events caused by right clicking (as opposed to Shift+F10 or the context menu key)
                let headerCaption = e.path.find(x => x.classList?.contains('fieldcaption'));
                if (!headerCaption || headerCaption.classList.contains('active')) {
                    // Header menu is already active, so do nothing and let the browser's right click menu come up.
                    return true;
                }
                else {
                    // Activate header menu and call preventDefault() to suppress browser context menu.
                    const headerRow = headerCaption.closest('thead > tr.fieldnames');
                    // Dismiss any existing header menus
                    let openMenus = Array.from(headerRow.querySelectorAll('.column[data-visible="true"] > .field > .fieldcaption.active'));
                    openMenus.forEach(fc => {
                        fc.classList.remove('active');
                        fc.querySelector('.columnoptions').style.zIndex = 0;
                    });
                    // Activate this header's sort/filter menu
                    let maxZ = FwFunc?.getMaxZ('*') || 999; // FwFunc should be available globally through RentalWorks
                    let menu = headerCaption.querySelector('.columnoptions')
                    menu.style.zIndex = maxZ + 1;
                    headerCaption.classList.add('active');
                    // Close this menu if the user clicks outside of it
                    document.addEventListener('click', function clickAway(e) {
                        if (!e.path.includes(menu)) {
                            headerCaption.classList.remove('active');
                            menu.style.zIndex = 0;
                        }
                    }, { once: true, capture: true });
                    e.preventDefault();
                }
            }
        });
        return true;
    }

    function addGlobalApplicationButtons() {
        const onPageLoad = function (mutations, observer) {
            if (mutations.find((mut) => mut.addedNodes.length)) {
                if (addTitleCaseButton(getAppToolbar(), 'afterbegin')) {
                    observer.disconnect();
                }
            }
        }
        let root = document.querySelector("#application");
        const obs = new MutationObserver(onPageLoad);
        obs.observe(root, { childList: true });
    }

    /**
     * Add buttons to popup UI (where a window overlays the page, leaving the previous page mostly visible, but darkened and unclickable), as opposed to the regular tabbed UI.
     */
    function addPopupButtons() {
        const onPopup = function (mutations, observer) {
            let newPopup = mutations.find((mut) => mut.addedNodes[0]?.classList.contains('fwpopup'));
            if (newPopup) {
                let popupHeader = newPopup.addedNodes[0].querySelector('.fwpopupbox .fwform-menu .buttonbar');
                let btn = addTitleCaseButton(popupHeader, 'beforeend');
                if (btn) {
                    btn.classList.add('btn');
                    btn.style.marginLeft = 'auto';
                    btn.insertAdjacentHTML('beforeend', '<div class="btn-text">To Title Case</div>');
                }
            }
        }
        let root = document.querySelector("#application");
        const obs = new MutationObserver(onPopup);
        obs.observe(root, { childList: true });
    }

    function getAppToolbar() {
        return document.querySelector("#fw-app-header .app-usercontrols");
    }

    function addTitleCaseButton(toolbar, position) {
        if (!toolbar) return false;

        let titleCaseBtn = document.createElement('div');
        titleCaseBtn.className = 'titlecasebutton';
        titleCaseBtn.innerHTML = `<i class="material-icons" title="Title Case - Convert a selected field's text to title case">text_fields</i>`; //From https://fonts.google.com/icons
        toolbar.insertAdjacentElement(position, titleCaseBtn);
        // Prevent this button from taking focus, so the existing field with focus can remain focused
        titleCaseBtn.addEventListener('mousedown', e => e.preventDefault());
        // Convert the active (editable) field to Title Case when this button is clicked
        titleCaseBtn.addEventListener('click', activeFieldToTitleCase);
        return titleCaseBtn;
    }

    function activeFieldToTitleCase() {
        let textField = document.getSelection().anchorNode?.querySelector('input[type="text"]');
        let oldText = textField?.value;
        if (oldText) {
            let newText = toTitleCase(oldText);
            if (newText != oldText) {
                textField.value = newText;
                textField.dispatchEvent(new Event('change', { "bubbles": true }));
            }
        }
    }

})(window.RentalQuirks);