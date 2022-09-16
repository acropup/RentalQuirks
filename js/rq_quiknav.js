//TODO: rq-kbd-shortcut becomes invisible when searchbox gains focus, but still exists and gets in the way of mouse clicks
//TODO: implement ! and + modifiers
//TODO: allow filter text before or after itemcode

(function (RQ) {
    'use strict';
    RQ.runOnAppLoad ||= [];
    RQ.quiknav = {};
    //RQ.quiknav.searchbox
    //RQ.quiknav.popup
    //RQ.quiknav.modules
    let create = document.createElement.bind(document);

    function initQuikNavUI () {
        let title_container = document.querySelector("#fw-app-header > .header-wrapper > .app-title");
        let quiknav_ui = create('div');
        title_container.appendChild(quiknav_ui);
        quiknav_ui.outerHTML =
            `<div data-control="FwFormField" style="flex: 0 1 200px;height: 1.6em;font-size: 1rem;" class="fwcontrol fwformfield" data-type="text">
  <div class="fwformfield-control" style="position: relative;">
    <input id="rq-quiknav" class="fwformfield-value" type="text" placeholder="QuikNav" autocomplete="off">
    <span class="rq-kbd-shortcut" style="position: absolute; right: 0;">Ctrl+/</i>
  </div>
  <div id="rq-quiknav-popup" class="hidden" data-query-text="">
    <div class="rq-help hidden">Type <span class="rq-kbd-shortcut">?</span> to show this help.
        <hr style="margin: 0.3em 0 0.2em;">
        <b>QuikNav</b> provides rapid keyboard access to any RentalWorks module. Type to filter through the module list (ignoring spaces). You may type entire words, or <b>just the beginnings</b> of each word in the module names. Play around with it if it's not clear!
        <br>Use the mouse or arrow keys <span class="rq-kbd-shortcut">&uarr;</span><span class="rq-kbd-shortcut">&darr;</span> to select within the filter list.
        <br><span class="rq-kbd-shortcut">Enter</span> or double-click opens the selected module as a new tab, alongside any open tabs.
        <br>The <span class="rq-kbd-shortcut">!</span> modifier opens the selected module, and closes all existing tabs.
        <br>The <span class="rq-kbd-shortcut">+</span> modifier creates a new item of the selected type.
        <br>For modules with an [ItemCode] indicated, type an ItemCode after the filter text to open it directly.
        <br><b>Examples:</b>
        <br><code>or&nbsp;&nbsp;&nbsp;</code> opens the Order browser in a new tab.
        <br><code>set!&nbsp;</code> to open the Settings module and close all others.
        <br><code>ri+&nbsp;&nbsp;</code> to create a new Rental Inventory item.
        <br><code>ri&nbsp;100123</code> to open the Rental Item with I-Code 100123.
        <hr style="margin: 0.5em 0 0.2em;"></div>
    <div class="rq-no-results hidden">No results. Type <span class="rq-kbd-shortcut">?</span> for help.</div>
  </div>
</div>`;
        let searchbox = document.getElementById("rq-quiknav");
        let popup = document.getElementById("rq-quiknav-popup");
        RQ.quiknav.searchbox = searchbox;
        RQ.quiknav.popup = popup;
        //RQ.quiknav.modules is not initialized until quiknav is first activated.
        searchbox.addEventListener('focus', quiknav_first_focus);
        searchbox.addEventListener('focus', quiknav_focus);
        searchbox.addEventListener('blur', quiknav_focus);
        searchbox.addEventListener('keydown', quiknav_keydown);
        searchbox.addEventListener('input', quiknav_input_handler);
        popup.addEventListener('mousedown', quiknav_popup_click);
        popup.addEventListener('dblclick', quiknav_popup_click);
        //Add global keyboard shortcut Ctrl+/ to access QuikNav at any point. Can also use "/" on its own if you're not in a textbox.
        document.addEventListener("keydown", quiknav_global_shortcut);
    }

    /**Global keydown event handler for keyboard shortcut "Ctrl+/" to access QuikNav
     * at any point. Can also use "/" on its own if you're not in a textbox. */
    function quiknav_global_shortcut (e) {
        if (e.key !== "/") return;
        if (["INPUT", "TEXTAREA"].includes(e.target.tagName) && !e.ctrlKey) return;

        e.preventDefault();
        let searchbox = RQ.quiknav.searchbox;
        searchbox.focus();
        searchbox.setSelectionRange(0, searchbox.value.length);
    }

    /**Deferred init procedure for when quiknav is first focused.
     * Initializes modules list from the RentalWorks global variable 'masterController'. */
    let quiknav_first_focus = function (e) {
        // init upon first use of quiknav
        e.target.removeEventListener('focus', quiknav_first_focus);

        // masterController.navigation has a lot of information, mainly module names and navigation paths. We use this to build our quiknav module list.
        // masterController.settings has a lot of settings information, but I'm not sure how to make use of it at this point.
        let all_module_data = [];
        window.masterController.navigation.forEach(root_menu_item => {
            if (root_menu_item.navigation) {
                all_module_data.push({ caption: root_menu_item.caption, nav: root_menu_item.navigation, icon: root_menu_item.icon });
            } else {
                root_menu_item.children.forEach(submenu_item => {
                    all_module_data.push({ caption: submenu_item.caption, nav: submenu_item.nav, icon: root_menu_item.icon });
                });
            }
        });
        all_module_data.sort((a, b) => a.caption.length - b.caption.length);
        all_module_data.forEach(module => {
            let names = RQ.module_identifier_names(module.caption.replaceAll(' ', ''));
            Object.assign(module, names);
        });

        let make_elem = function (tag_name, class_name, inner_html) {
            let elem = create(tag_name);
            elem.className = class_name;
            elem.innerHTML = inner_html;
            return elem;
        };
        // Make a div for every module, creating a list of modules in the popup
        let popup = RQ.quiknav.popup;
        let modules = all_module_data.map(module_info => {
            let module_row = create('div');
            module_row.className = "quiknav-list-item";
            let icon = make_elem('i', "material-icons", module_info.icon);
            let capt = make_elem('span', "caption", module_info.caption);
            module_row.append(icon, capt);
            if (module_info.code) {
                let code = make_elem('span', "item-code", '[' + module_info.code + ']');
                module_row.append(code);
            }
            Object.assign(module_row.dataset, module_info);
            return module_row;
        });
        modules[0].classList.add('selected');
        popup.append(...modules);
        // Save for use throughout this file, so that we need not call querySelectorAll for them.
        RQ.quiknav.modules = modules;
    };

    function quiknav_focus (e) {
        // To handle quiknav searchbox focus and blur events
        RQ.quiknav.popup.classList.toggle('hidden', e.type == 'blur');
    }

    /**quiknav keydown event handler handles non-text keyboard entry, such as Enter, Escape,
     * '?', and Up/Down Arrow keys. Text entry is handled by quiknav_input_handler(e). */
    function quiknav_keydown (e) {
        let searchbox = RQ.quiknav.searchbox;
        let x = create('asdf');
        let modules = RQ.quiknav.modules;
        if (!e.repeat && e.key == 'Enter') {
            for (let i = 0; i < modules.length; i++) {
                if (modules[i].classList.contains('selected')) {
                    let item_code_name = modules[i].dataset.code;
                    let item_code_value = RQ.quiknav.popup.dataset.itemCode;

                    let modifier_char = searchbox.value.trim().slice(-1);
                    if (modifier_char == '!') {
                        // Go to module, closing all currently open tabs
                        location.hash = "#/" + modules[i].dataset.nav;
                    }
                    else if (modifier_char == '+') {
                        //TODO: Open a new form page for the selected module. Will have to investigate for what kinds of modules this works.

                    }
                    else if (item_code_name && item_code_value) {
                        //open the item, specified by its code
                        let module_name = modules[i].dataset.caption.replace(' ', '');
                        //Special handling because RepairController has caption "Repair Order"
                        let module_name_length = modules[i].dataset.nav.length - 'module/'.length;
                        module_name = module_name.slice(0, module_name_length);
                        //Open the item in a tab, or switch to the tab if it's already opened
                        RQ.get_id_from_code(module_name, item_code_value)
                            .then(item_id_value => {
                                if (item_id_value) {
                                    RQ.open_form_tab(module_name, item_id_value);
                                }
                                else {
                                    console.warn(`${item_code_name} value ${item_code_value} doesn't exist.`);
                                    //TODO: notify user in a nicer way
                                    throw Error(`${item_code_name} value ${item_code_value} doesn't exist.`);
                                }
                            });
                    }
                    else {
                        //TODO: Open the module's browse page as a tab, preserving existing tabs
                        location.hash = "#/" + modules[i].dataset.nav;
                    }
                    searchbox.blur();
                    break;
                }
            }
            e.preventDefault();
        }
        else if (e.key == 'Escape') {
            if (searchbox.value.length) {
                searchbox.value = "";
            }
            else {
                searchbox.blur();
            }
            e.preventDefault();
        }
        else if (e.key == 'ArrowDown') {
            // Select the next visible module, with wrapping
            let select_index = undefined;
            let found_selected = false;
            for (let i = 0; i < modules.length; i++) {
                let cl = modules[i].classList;
                if (!cl.contains('hidden')) {
                    select_index ||= i; // Note the first match, in case we need to wrap around
                    if (found_selected) {
                        cl.add('selected');
                        select_index = i;
                        break;
                    }
                    else if (cl.contains('selected')) {
                        found_selected = true;
                        cl.remove('selected');
                    }
                }
            }
            let module = modules[select_index || 0];
            module.classList.add('selected');
            module.scrollIntoView({ block: "nearest" });
            e.preventDefault();
        }
        else if (e.key == 'ArrowUp') {
            // Select the previous visible module, with wrapping
            let select_index = undefined;
            let found_selected = false;
            //@CutnPaste ArrowUp and ArrowDown are identical except for the direction of the for loop
            for (let i = modules.length - 1; i >= 0; i--) {
                let cl = modules[i].classList;
                if (!cl.contains('hidden')) {
                    select_index ||= i; // Note the first match, in case we need to wrap around
                    if (found_selected) {
                        cl.add('selected');
                        select_index = i;
                        break;
                    }
                    else if (cl.contains('selected')) {
                        found_selected = true;
                        cl.remove('selected');
                    }
                }
            }
            let module = modules[select_index || 0];
            module.classList.add('selected');
            module.scrollIntoView({ block: "nearest" });
            e.preventDefault();
        }
        else if (e.key == '?') {
            // Show help
            RQ.quiknav.popup.querySelector('.rq-help').classList.remove('hidden');
            // Show all modules
            RQ.quiknav.modules.forEach(module => module.classList.remove('hidden'));
            e.preventDefault();
        }
    }

    function quiknav_popup_click (e) {
        let clicked_item = e.target.closest('.quiknav-list-item');
        if (clicked_item && !clicked_item.classList.contains('selected')) {
            RQ.quiknav.modules.forEach(module => module.classList.remove('selected'));
            clicked_item.classList.add('selected');
        }
        if (e.type == 'dblclick') {
            RQ.quiknav.searchbox.dispatchEvent(new KeyboardEvent('keydown', { 'key': 'Enter' }));
        }
        // Prevent taking focus away from searchbox
        e.preventDefault();
    }

    /**Handles any change of the quicknav searchbox text, whether made by typing, pasting, or deleting text.
     * Filters the module list based on the text entered, and sets selected module to the first item whenever
     * there is no current selection. */
    function quiknav_input_handler (e) {
        let modules = RQ.quiknav.modules;
        let quiktext = e.target.value.trim();

        //BUG: VendorNumber seems to be any sort of string, contains spaces and letters, so we're not properly identifying that here.
        // Distinguish between filter string and itemcode here
        // Assume that any word containing a digit is an item code, because currently there are no captions with digits in them.
        let match = /^(?<filter>[a-z]+\b)(?<mod>[!?+]?) *(?<code>\b[-a-z0-9 ]+)?$/i.exec(quiktext)?.groups;
        let query_text = match?.filter ?? "";
        let modifier = match?.mod ?? ""; //The modifiers '!' and '+' only matter when submitting (see quiknav_keydown()).
        RQ.quiknav.popup.dataset.itemCode = match?.code ?? "";

        let force_show_all = query_text.length == 0 || modifier == '?';
        if (force_show_all) {
            // Question mark is also checked in quiknav_keydown(), and is arguably unnecessary here
            // Show all modules and select the first item
            modules.forEach(module => module.classList.remove('hidden', 'selected'));
            modules[0].classList.add('selected');
            modules[0].scrollIntoView({ block: "nearest" });
        }
        RQ.quiknav.popup.querySelector('.rq-help').classList.toggle('hidden', modifier != '?');

        if (RQ.quiknav.popup.dataset.queryText == query_text) {
            return;
        }
        RQ.quiknav.popup.dataset.queryText = query_text;
        if (query_text.length == 0) {
            modules.forEach(module => module.children[1].innerHTML = module.dataset.caption);
            RQ.quiknav.popup.querySelector('.rq-no-results').classList.add('hidden');
            return;
        }

        let match_count = 0;
        modules.forEach(module => {
            let caption = module.dataset.caption;
            let match = multiword_match(caption, query_text);
            if (!match && !module.classList.contains('hidden')) {
                // Not strictly necessary to reset the caption when hiding it, but it doesn't hurt
                module.children[1].innerHTML = caption;
            }
            module.classList.remove('selected');
            module.classList.toggle('hidden', !(match || force_show_all));
            if (match) {
                if (match_count == 0) {
                    module.classList.add('selected');
                    module.scrollIntoView({ block: "nearest" });
                }
                match_count++;
                // Embolden the letters that were matched, using the match mask
                let builder = [];
                let bolding = false;
                while (match && caption.length > 0) {
                    if (bolding != (match & 1)) {
                        bolding = !bolding;
                        builder.push(bolding ? '<b>' : '</b>');
                    }
                    builder.push(caption[0]);
                    caption = caption.substring(1);
                    match >>= 1;
                }
                if (bolding) {
                    builder.push('</b>');
                }
                if (caption.length) {
                    builder.push(caption);
                }
                let bolded_match = builder.join('');
                module.children[1].innerHTML = bolded_match;
            }
        });
        RQ.quiknav.popup.querySelector('.rq-no-results').classList.toggle('hidden', match_count > 0);
    };

    // Wait until the user is logged in, or init won't work
    RQ.runOnAppLoad.push(initQuikNavUI);
})(window.RentalQuirks);