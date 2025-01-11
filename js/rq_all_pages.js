/** 
 * Some nomenclature for RentalWorks
 * "Record Browser" is the kind of table in which you view and search for lists of records. Found on Rental Inventory, Sales Inventory, Customer tab, etc.
 * https://support.dbworks.com/hc/en-us/articles/360057454273-The-Records-Browser
 * "Record Form" is the tab in which you view and edit a particular record (say, a rental inventory item).
 * "Grid" is a table, usually within a record form, in which records are added, removed, and edited within the grid. For example, the "Grid" of kit items.
 * https://support.dbworks.com/hc/en-us/articles/360057454753-The-Record-Form
 * 
 */
(function (RQ) {
    'use strict';
    RQ.runOnAppLoad = [];
    RQ.runOnModuleChange = [];
    RQ.runOnNewTab = [];

    RQ.runOnAppLoad.push(showRWVersionNumber);
    RQ.runOnAppLoad.push(addGlobalApplicationButtons);
    RQ.runOnAppLoad.push(addAutoLoginMenuOption);
    RQ.runOnAppLoad.push(monitorModuleChange);
    RQ.runOnAppLoad.push(enableMultiModuleSupport);
    RQ.runOnAppLoad.push(interceptCtrl_S);
    RQ.runOnAppLoad.push(addPopupButtons);
    RQ.runOnAppLoad.push(addCodeMirrorExtensions);
    waitForAppLoad();
    RQ.runOnModuleChange.push({
        test: () => true,
        runScript: monitorModuleTabs
    });

    RQ.runOnNewTab.push({
        test: (type, controller) => type == 'BROWSE',
        runScript: injectBrowseTabUI
    });
    RQ.runOnNewTab.push({
        test: (type, controller) => type == 'FORM',
        runScript: injectFormTabUI
    });
    RQ.runOnNewTab.push({
        test: (type, controller) => true,
        runScript: allowCloseModuleTabs
    });

    function showRWVersionNumber() {
        let logoElem = document.querySelector(".app-title .bgothm");

        if (logoElem && window.applicationConfig?.version) {
            // The CSS takes this data attribute and applies to a pseudo-element
            logoElem.dataset.rwver = window.applicationConfig.version;
        }
    }

    function injectBrowseTabUI(browse_tab) {
        let table = browse_tab.querySelector('.tablewrapper > table');
        if (!table) {
            console.error('RQ Error: Table element not found within the browse tab.', browse_tab);
            return;
        }
        apply_table_click_overrides(table);
    }

    function injectFormTabUI(form_tab) {
        let sub_tabs = form_tab.querySelector('.tabcontainer');
        if (!sub_tabs || sub_tabs.childElementCount == 0) {
            //Some forms don't have sub_tabs; there is only one page. Example: many of the RW Utilities.
            let tables = form_tab.querySelectorAll('[data-control="FwBrowse"]');
            for (const table of tables) {
                apply_table_click_overrides(table);
            }
        }
        else {
            on_class_added('tabGridsLoaded', sub_tabs, (tab) => {
                let tabpageid = tab.dataset.tabpageid;
                let tabpage = form_tab.querySelector('#' + tabpageid);
                let tables = tabpage.querySelectorAll('[data-control="FwBrowse"]');
                for (const table of tables) {
                    apply_table_click_overrides(table);
                }
            });
            // The first active tab doesn't get tabGridsLoaded until you move away and back to it,
            // which doesn't make sense and is probably a harmless bug. I'm fixing it here
            // as an easy way to trigger on_class_added for the tables on the first tab.
            sub_tabs.querySelector('.tab.active').classList.add('tabGridsLoaded');
        }
    }

    let apply_table_click_overrides = (() => {
        return function (table) {
            let headerRow = table.querySelector('thead > tr.fieldnames');
            let tableBody = table.querySelector('tbody');
            tableBody.addEventListener('click', clickSortableTable);
            headerRow.addEventListener('click', leftClickHeaderRow, { capture: true });
            headerRow.addEventListener('contextmenu', rightClickHeaderRow);
        };

        /**
         * Ctrl+click a table body cell to filter table to show only rows with that value.
         * @param {MouseEvent} clickEvent listening on tbody element of table 
         */
        function clickSortableTable(clickEvent) {
            if (clickEvent.type == "click" && clickEvent.ctrlKey) {
                let cell = clickEvent.target.closest('.field');
                if (!cell) return;

                let cellVal = cell.textContent;
                const headerRow = cell.closest('table').querySelector('thead > tr.fieldnames');
                if (cellVal) {
                    let colName = cell.dataset.caption;
                    let colHead = headerRow.querySelector(`td.column .field[data-caption="${colName}"]`);
                    let filterColField = colHead?.querySelector('.search input[type="text"], .search input[type="search"]'); //Date columns have input type="search"
                    if (filterColField) {
                        filterColField.value = cellVal;
                        doChangeEvent(filterColField);
                    }
                }
            }
        }

        // Simulate click on a menu item based on its innerText
        function clickHeaderMenuItem(fieldCaption, menuItemText) {
            let menuItems = Array.from(fieldCaption.querySelectorAll('.columnoptions > .columnoptions-button'));
            let itemToClick = menuItems.find(x => x.innerText.includes(menuItemText));
            // Do not bubble, to prevent the menu from opening unnecessarily
            return itemToClick?.dispatchEvent(new Event('click', { bubbles: false }));
        };

        // --- Header row click functionality ---
        // Left click toggles between sort up and sort down, and also removes sort on any existing columns.
        // Ctrl + left click to maintain existing sort columns.
        // Right click brings up menu, just like default RentalWorks left click behaviour.
        function leftClickHeaderRow(clickEvent) {
            if (clickEvent.button != 0) return true;
            let iHeaderMenu = clickEvent.composedPath().findIndex(x => x.classList?.contains('columnoptions'));
            if (iHeaderMenu >= 0) {
                // Clicked within the header sort/filter menu
                // Let the event get handled as usual
                return true;
            }
            else {
                let headerCaption = clickEvent.composedPath().find(x => x.classList?.contains('fieldcaption'));
                if (headerCaption) { // Clicked on the header (not on the menu, not on the search field)
                    // Prevent menu from being opened
                    clickEvent.stopPropagation();
                    // Left-clicking the header toggles column sort direction, defaults to Asc if not yet sorted
                    let sort = headerCaption.parentElement.dataset.sort;
                    let sortText = (sort != "asc") ? "Sort Ascending" : "Sort Descending";
                    if (clickHeaderMenuItem(headerCaption, sortText)) {
                        // Clicking while holding Ctrl key keeps existing sorted columns sorted
                        if (!clickEvent.ctrlKey) {
                            // Get all headers where sorting is turned on (data-sort="asc" or data-sort="desc")
                            // and turn sorting off for those columns (excluding the one we just clicked)
                            const headerRow = headerCaption.closest('thead > tr.fieldnames');
                            let sortedHeaders = Array.from(headerRow.querySelectorAll('td.column[data-visible="true"] > .field[data-sort$="sc"] > .fieldcaption'));
                            sortedHeaders.forEach(hCap => {
                                if (hCap != headerCaption) {
                                    clickHeaderMenuItem(hCap, "Sort Off");
                                }
                            });
                        }
                    }
                }
            }
        }

        // This is how right click is handled, not through 'click' or 'auxclick' events
        function rightClickHeaderRow(clickEvent) {
            if (clickEvent.button == 2) { // Only handle contextmenu events caused by right clicking (as opposed to Shift+F10 or the context menu key)
                let headerCaption = clickEvent.composedPath().find(x => x.classList?.contains('fieldcaption'));
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
                        if (!e.composedPath().includes(menu)) {
                            headerCaption.classList.remove('active');
                            menu.style.zIndex = 0;
                        }
                    }, { once: true, capture: true });
                    clickEvent.preventDefault();
                }
            }
        }
    })();

    function addGlobalApplicationButtons() {
        // Add buttons to the existing toolbars
        let appToolbar = getAppToolbar();
        if (appToolbar) {
            addTitleCaseButton(appToolbar, 'afterbegin');
            RQ.barcode?.addBarcodeButton(appToolbar, 'afterbegin');
        }

        // Whenever the page is resized, the app-usercontrols element is deleted and re-added, so 
        // we have to monitor for when it's added, and customize it again every time.
        let onNewAppUsercontrols = function (mutations, observer) {
            mutations.forEach(mr => {
                let node = mr.addedNodes[0];
                if (node?.classList.contains('app-usercontrols')) {
                    addTitleCaseButton(node, 'afterbegin');
                    RQ.barcode?.addBarcodeButton(node, 'afterbegin');
                    return;
                }
            });
        };
        let header = document.querySelector("#fw-app-header > .header-wrapper");
        // Add buttons every time the app-usercontrols element is recreated by RW
        let header_obs = new MutationObserver(onNewAppUsercontrols);
        header_obs.observe(header, { childList: true });
    }

    function waitForAppLoad() {
        let root = document.querySelector("#application");
        if (!root) return; // There's no #application on pages such as report previews
        elementReady("#fw-app #fw-app-header", root).then(header => {
            RQ.runOnAppLoad.forEach(script => !script());
        });
    }


    function monitorModuleChange() {
        // Whenever the user navigates to a new module, such as by clicking almost anything in the main app left menu,
        // all existing open tabs are discarded, and in fact, the whole #moduleMaster node is deleted and recreated.
        // This function monitors for when that happens, so that scripts can be reapplied whenever #moduleMaster is recreated.
        let app_body = document.querySelector("#fw-app-body");
        for_child_added(app_body, '#moduleMaster', (new_module) => {
            let moduleName = new_module.dataset.module;
            let moduleScripts = RQ.runOnModuleChange.filter(script => script.test(moduleName));
            console.log(`Running ${moduleScripts.length} module scripts`);
            moduleScripts.forEach(s => s.runScript());
        });
    }

    function monitorModuleTabs() {
        // Find the tab container
        let module_tab_pages = document.querySelector("#moduleMaster-body > #moduletabs > .tabpages");
        if (!module_tab_pages) {
            console.log('no module tab container found');
            return;
        }
        let choose_and_run_tab_scripts = function (new_tab) {
            let tab_type = new_tab.dataset?.tabtype; //'BROWSE' or 'FORM'
            let controller_name = new_tab.firstElementChild?.dataset?.controller;
            let scripts = RQ.runOnNewTab.filter(script => script.test(tab_type, controller_name));
            if (scripts.length == 0) return;

            let run_tab_scripts = function () {
                console.log(`Running ${scripts.length} tab scripts`);
                scripts.forEach(s => s.runScript(new_tab));
            };
            run_tab_scripts();
            // If module tab is refreshed, the child element is replaced, so we need to reapply
            // the scripts to this tab. Currently only applies to FORM, not BROWSE tabs.
            if (tab_type == "FORM") {
                for_child_added(new_tab, ".fwcontrol.fwform", run_tab_scripts);
            }
        };
        // Run scripts for any existing tabs (there is usually one browse tab as soon as a module is created)
        module_tab_pages.querySelectorAll(':scope > .tabpage').forEach(choose_and_run_tab_scripts);

        // Run tab scripts for future tabs as they're created
        for_child_added(module_tab_pages, '#moduletabs > .tabpages > .tabpage', choose_and_run_tab_scripts);
    }

    // Allows the user to open the record browser of many modules in their own tabs.
    // Normal RW behaviour closes all existing tabs if one tries to navigate to a new module.
    function enableMultiModuleSupport() {

        /**Ctrl+click an option in the main menu to open that module browser without closing existing tabs.
         * @param {MouseEvent} clickEvent listening on tbody element of table 
         */
        let click_main_menu = function (clickEvent) {
            if (clickEvent.type == "click" && clickEvent.ctrlKey) {
                // .module is for all the sub-menu items. .menu-lv1object is for the root items that go directly to a page (Settings and Reports).
                let menu_item = clickEvent.target.closest('.module, .menu-lv1object');
                let module_data = jQuery(menu_item).data('module');
                if (module_data) {
                    // Get all the module information from this menu element
                    let url_path = module_data?.navigation; // RW stores the url hash path here
                    let module_name = module_data?.title;
                    if (url_path && module_name) {
                        // If this module is already open, navigate to that tab. Otherwise, open a new tab
                        if (find_tab_by_name(module_name, true)
                            || RQ.load_module_as_tab(url_path)) {
                            clickEvent.stopPropagation();
                        }
                    }
                }
            }
        };

        let app_menu = document.querySelector('#fw-app-menu');
        app_menu.addEventListener('click', click_main_menu, { capture: true });
    }

    // Opens a tab for the module chosen, specified by the url path that uniquely identifies
    // a module. All url paths can be found in the window.routes global variable.
    // Returns the loaded module screen if successful, null if not.
    RQ.load_module_as_tab = function (module_url_path) {
        // This code is based off of the RW function FwApplication.prototype.navigateHashChange
        module_url_path = module_url_path.toLowerCase();
        let moduleScreen = undefined; // This will contain the kind of object returned by functions like SalesInventoryController.getModuleScreen()
        let r = window.routes; // routes is a global variable provided by RW, containing the url path and a screen generator for every module.
        for (let i = 0; i < r.length; i++) {
            let match = r[i].pattern.exec(module_url_path);
            if (null != match) {
                // module_url_path matches route i, so get module screen
                moduleScreen = r[i].action(match);
                break;
            }
        }
        if (moduleScreen) {
            //TODO: investigate what these screens are about, and reconsider whether we should be unloading the current one or not.
            if (typeof program.screens?.[0]?.unload === "function") {
                program.screens[0].unload();
                program.screens = [];
            }
            program.screens[0] = moduleScreen;
            if (typeof moduleScreen?.load === "function") {
                moduleScreen.load();
                return moduleScreen;
            }
            //Is this necessary?
            //document.body.scrollTop = 0;
        }
        return null;
    };

    // Event handler for clicks on X close buttons that were added to tabs that normally don't have them.
    function click_close_tab(e) {
        let tab_to_close = e.target.closest('div[data-type="tab"]');
        let page_id = '#' + tab_to_close.dataset.tabpageid;
        let page_to_close = document.querySelector('#moduletabs > .tabpages > ' + page_id + ' > .fwcontrol');
        FwModule.closeForm(jQuery(page_to_close), jQuery(tab_to_close));
    }

    // The main tabs for modules (typically Record Browser tabs) don't normally come with X buttons to close them.
    // This function, called on a new tab, adds a close button if it doesn't already have one.
    function allowCloseModuleTabs(new_tabpage) {
        let new_tab = new_tabpage.closest('#moduletabs').querySelector(`.tabs > .tabcontainer > .tab[data-tabpageid="${new_tabpage.id}"]`);
        if (!new_tab.querySelector('.delete')) {
            let close_button = document.createElement('div');
            close_button.className = 'delete';
            close_button.innerHTML = '<i class="material-icons"></i>';
            new_tab.appendChild(close_button);
            close_button.addEventListener('click', click_close_tab);
        }
    }

    /**
     * Add buttons to popup UI (where a window overlays the page, leaving the previous page mostly visible, but darkened and unclickable), as opposed to the regular tabbed UI.
     */
    function addPopupButtons() {
        // All popups are inserted as children of #application
        let root = document.querySelector("#application");
        if (!root) return; // There's no #application on pages such as report previews

        const onPopup = function (mutations, observer) {
            let newPopup = mutations.find((mut) => mut.addedNodes[0]?.classList.contains('fwpopup'));
            if (newPopup) {
                let popupHeader = newPopup.addedNodes[0].querySelector('.fwpopupbox .fwform-menu .buttonbar');
                let btn = addTitleCaseButton(popupHeader, 'beforeend');
                if (btn) {
                    // Extra adjustments needed for where it's being inserted into the popup
                    btn.classList.add('btn');
                    btn.style.marginLeft = 'auto';
                    btn.insertAdjacentHTML('beforeend', '<div class="btn-text">To Title Case</div>');
                }
            }
        }
        const obs = new MutationObserver(onPopup);
        obs.observe(root, { childList: true });
    }

    function getAppToolbar() {
        return document.querySelector("#fw-app-header .app-usercontrols");
    }

    /**
     * Add checkbox in profile menu (top right corner of every screen) to enable and disable auto-login, because sometimes people don't want that feature.
     * Auto-login is enabled by default. Preference is remembered through localStorage['rentalquirks-autologin'].
     */
    function addAutoLoginMenuOption() {
        let profileMenu = document.querySelector("#fw-app-header .app-usermenu .app-menu-tray");
        
        let autoLoginOption = document.createElement('div');
        autoLoginOption.className = "staticinfo";
        autoLoginOption.innerHTML = `<input type="checkbox" id="autologin-checkbox"><label for="autologin-checkbox">Enable Auto-Login</label>`;
        let chkbx = autoLoginOption.firstElementChild;
        let chklbl = chkbx.nextElementSibling;

        // Keep track of autologin preference through localStorage. Default to true when undefined. Note that localStorage values are strings; be careful with conversion!
        let autoLoginPref = localStorage['rentalquirks-autologin'];
        autoLoginPref = autoLoginPref === undefined || autoLoginPref === 'true';
        chkbx.checked = autoLoginPref;

        // The profile menu hides itself in an annoying way if focus is changed while it's open. These listeners are necessary to make the checkbox interactive without
        // changing focus and causing the menu to disappear. Developed on Edge (Chromium), tested on Firefox, Jan 2025.
        chkbx.addEventListener('change', (e) => {
            localStorage['rentalquirks-autologin'] = e.target.checked;
        });
        chkbx.addEventListener('mousedown', (e) => { e.preventDefault(); });
        chklbl.addEventListener('click', (e) => { 
            chkbx.checked = !chkbx.checked;
            localStorage['rentalquirks-autologin'] = chkbx.checked;
            e.preventDefault();
        });
        //Insert into profile menu (top right corner of every screen)
        profileMenu.insertBefore(autoLoginOption, profileMenu.lastElementChild);
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
        let selectionNode = document.getSelection().anchorNode;
        if (!(selectionNode instanceof Element)) return;

        // Firefox behaviour selects the INPUT tag, Chromium behaviour selects the parent DIV.
        let textField = selectionNode.matches('input[type="text"]') ? selectionNode : selectionNode.querySelector('input[type="text"]');
        let oldText = textField?.value;
        if (oldText) {
            let newText = toTitleCase(oldText);
            if (newText != oldText) {
                textField.value = newText;
                textField.dispatchEvent(new Event('change', { "bubbles": true }));
            }
        }
    }
    function saveActive() {
        let allSaveButtons = document.querySelectorAll('.btn[data-type="SaveMenuBarButton"]:not(.disabled)');
        let visibleSaveButtons = Array.from(allSaveButtons).filter(b => b.offsetWidth != 0);
        if (visibleSaveButtons.length == 1) {
            visibleSaveButtons[0].click();
            return true;
        }
        return false;
        /* Alternative way to save form by calling saveForm from the module
        
        let activeForm = document.querySelector('#moduletabs > .tabpages > .tabpage.active > .fwform');
        let controllerName = activeForm.dataset['controller'];
        let controller = window[controllerName];
        controller.saveForm(jQuery(activeForm), {closetab: false});
        */
    }
    function interceptCtrl_S() {
        document.addEventListener('keydown', function (e) {
            if (navigator.platform.match("Mac") ? e.metaKey : e.ctrlKey) {
                if (e.code == 'KeyS') {
                    console.log('Ctrl+S intercepted, saving form.');
                    saveActive();
                    e.preventDefault();
                }
            }
        });
    }

    /**RentalWorks uses CodeMirror for report HTML editors. Searching for text
     * is a super pain without certain addons. This function includes the addons.
     */
    function addCodeMirrorExtensions() {
        // The codemirror.js script is included in RW like this:
        // <script type="text/javascript" src="./script2-2019.1.2.208.js"></script>
        // As of March 2022, this file includes CodeMirror 4.8.0, and addons for XML text formatting, 
        // code folding, and line numbering. All addons included below should be compatible with v4.8.0.

        // The following code enables the text search addon for CodeMirror text 
        // editors, such as the ones that make up the HTML View of RentalWorks reports. 
        // https://codemirror.net/demo/search.html
        // Keyboard shortcuts are at https://codemirror.net/doc/manual.html#commands
        // Most notably, use Ctrl+G to Find Next
        // Note: This doesn't appear to add search functionality to read-only CodeMirror editors. I'm not sure why this is and haven't looked into it.

        // Use githubraw.com as a proxy to satisfy the browser's CORB (cross-origin read blocking) restrictions
        let codemirror_host_url = "https://cdn.githubraw.com/codemirror/CodeMirror/4.8.0";

        ["/addon/dialog/dialog.js",
            "/addon/search/searchcursor.js",
            "/addon/search/search.js"].forEach(path => {
                var script = document.createElement('script');
                script.src = codemirror_host_url + path;
                document.body.appendChild(script);
            });

        ["/addon/dialog/dialog.css"].forEach(path => {
            var cssLink = document.createElement('link');
            cssLink.rel = "stylesheet";
            cssLink.href = codemirror_host_url + path;
            document.body.appendChild(cssLink);
        });

        // Main library is at:
        // "/lib/codemirror.js"
        // "/lib/codemirror.css"
        // The following addons aren't supported in CodeMirror 4.8, but should be included if RW ever upgrades to a newer version. 
        // "/addon/scroll/annotatescrollbar.js"
        // "/addon/search/jump-to-line.js"
        // "/addon/search/matchesonscrollbar.js"
        // "/addon/search/matchesonscrollbar.css"
    }

})(window.RentalQuirks);
