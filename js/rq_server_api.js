

(function (RQ) {
    'use strict';
    RQ.runOnAppLoad ||= [];


    let init_server_api = function () {
        // Standard headers for fetch() commands to RentalWorks
        const standard_headers = {
            "accept": "application/json, text/javascript, */*; q=0.01",
            "accept-language": "en-US,en;q=0.9",
            "authorization": "Bearer " + sessionStorage.apiToken,
            "cache-control": "no-cache",
            "content-type": "application/json",
            "pragma": "no-cache",
            "sec-ch-ua": '" Not;A Brand";v="99", "Google Chrome";v="97", "Chromium";v="97"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"Windows"',
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-origin",
            "x-requested-with": "XMLHttpRequest"
        };
        // Standard RequestInit object for fetch() commands to RentalWorks
        const standard_fetch = {
            "headers": standard_headers,
            "referrer": RW_URL,
            "referrerPolicy": "no-referrer-when-downgrade",
            "body": null,
            "method": "GET",
            "mode": "cors",
            "credentials": "include"
        };

        //TODO: this should probably be replaced by something more generic like get_id_from_code
        /**Gets a RW Asset (any item that is tracked individually, such as by barcode)
         * @param item_id The ItemID string that identifies the asset
         * @returns a Promise that resolves to a JSON representation of the Asset object, or
         *          a String describing an error that occurred.
         */
        RQ.get_asset = function (item_id) {
            return fetch(RW_URL + "api/v1/item/" + item_id, standard_fetch)
                   .then(res => res.status === 200 ? res.json() : "Error: Get Asset failed with HTTP response " + res.status);
        };

        /**
         * Updates the values of specified datafields in a RW Asset
         * @param item_id The ItemID string that identifies the asset
         * @param payload an object of {"key":"value"} pairs where the keys are datafield names, 
         *                and values are the new values for the field
         * @returns a Promise that resolves to a JSON representation of the updated Asset object, or
         *          a String describing an error that occurred.
         */
        RQ.update_asset = function (item_id, payload) {
            // Payload requires ItemId even though it's also specified in the URL
            payload.ItemId = item_id;
            return fetch(RW_URL + "api/v1/item/" + item_id, {
                ...standard_fetch,
                "body": JSON.stringify(payload),
                "method": "PUT"
            }).then(res => res.status === 200 ? res.json() : "Error: Update Asset failed with HTTP response " + res.status);
        };

        /**
         * Updates the values of specified datafields in a RW Rental Inventory Item
         * @param inventory_id The InventoryID string that identifies the rental item
         * @param payload an object of {"key":"value"} pairs where the keys are datafield names, 
         *                and values are the new values for the field
         * @returns a Promise that resolves to a JSON representation of the updated Inventory Item object, or
         *          a String describing an error that occurred.
         */
        RQ.update_rental_inventory_item = function (inventory_id, payload) {
            // Payload requires InventoryId even though it's also specified in the URL
            payload.InventoryId = inventory_id;
            return fetch(RW_URL + "api/v1/rentalinventory/" + inventory_id, {
                ...standard_fetch,
                "body": JSON.stringify(payload),
                "method": "PUT"
            }).then(res => res.status === 200 ? res.json() : "Error: Update Rental Inventory Item failed with HTTP response " + res.status);
        };

        //TODO: move all front-end functions to a different file. server_api.js will only deal with server calls, updates, json queries, etc. it won't do things like open/close tabs.
        //id_name is the name of the unique ID for this module. For example, InventoryId is the unique ID for RentalInventoryController, and ItemId is the unique ID for AssetController.
        RQ.search_form_tabs = function (id_name, id_value, activate_tab) {
            // search for already-open tabs of matching InventoryId, and switch to the first one that matches.
            let id_info = { datafield: id_name, value: id_value };
            let form_query = {};
            form_query[id_name] = id_info;
            let found_form = FwModule.getFormByUniqueIds(form_query);

            let found_tabpage = false;
            if (typeof found_form != "undefined" && found_form.length > 0) {
                found_tabpage = found_form.closest("div.tabpage");
                if (activate_tab) {
                    jQuery("#" + found_tabpage.attr("data-tabid")).click();
                }
            }
            return found_tabpage;
        };

        RQ.open_form_tab = function (module_name, id_value) {
            let controller = window[module_name + "Controller"];
            let field_names = RQ.module_identifier_names(module_name);
            
            // If the form is already open, switch to that tab
            if (!RQ.search_form_tabs(field_names.id, id_value, true)) {
                let ident = {};
                ident[field_names.id] = id_value;
                let new_form = controller.loadForm(ident);
                FwModule.openModuleTab(new_form, new_form.attr("data-caption") + " (loading)", !0, "FORM", !0);
            }
        };
        
        /**Given a module name (ex. "RentalInventory" or "Quote"), returns an object with that module's item code name and id name.
         * @returns an object with two properties: code and id.
         *          code is the name of the mostly-unique identifier that users see, and that is printed on documents (ex. "ICode" or "QuoteNumber").
         *          id is the name of the actually-unique identifier that users don't see, but the system uses to specify and query particular records (ex. "InventoryId" or "QuoteId").
         * @returns undefined if module is unknown.
         */
        RQ.module_identifier_names = function (module_name) {
            let names = undefined;
            const conventional_names = [ "Contract", "Customer", "Deal", "Invoice", "Order", "PickList", "PurchaseOrder", "Quote", "Repair", "Vendor" ];
            const exceptional_names = {
                Asset:           { code: "BarCode", id: "ItemId" },
                RentalInventory: { code: "ICode",   id: "InventoryId" },
                SalesInventory:  { code: "ICode",   id: "InventoryId" },
                RepairOrder:     { code: "RepairNumber", id: "RepairId" } //HACK: module/repair has caption "Repair Order", so conventional_names doesn't catch it above if using module captions.
            };
            if (conventional_names.includes(module_name)) {
                names = { code: module_name + "Number", id: module_name + "Id" };
            }
            else {
                names = exceptional_names[module_name];
            }
            names || console.warn(`Identifier field names are unknown for module "${module_name}"`);
            return names;
        };

        RQ.get_id_from_code = function (module_name, code) {
            let field_names = RQ.module_identifier_names(module_name);
            return RQ.lookup_item_by_code(module_name, field_names.code, code)
            .then(res => res?.[field_names.id]);
        };

        RQ.lookup_item_by_code = function (module_name, code_name, code_value) {
            let controller = window[module_name + "Controller"];
            if (!controller?.apiurl || !code_name) return null;
            let querystring = encodeURI(`filter={"Field":"${code_name}","Op":"=","Value":"${code_value}"}`);
            
            return fetch(RW_URL + controller.apiurl + "?" + querystring, standard_fetch)
            .then(res => {
                if (res.status == 200) return res.json();
                throw `Error: ${code_name} lookup failed with HTTP response ${res.status}`;
            })
            .then(res => res?.Items?.[0]);
            //TODO: Should we make sure that (res.TotalItems == 1)?
        };

    };
    // Wait until the user is logged in, otherwise there won't be a 'sessionStorage.apiToken'
    RQ.runOnAppLoad.push(init_server_api);
})(window.RentalQuirks);