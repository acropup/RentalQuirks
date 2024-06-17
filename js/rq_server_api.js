//TODO: move all front-end functions to a different file. server_api.js should only deal with server calls, updates, json queries, etc. it won't do things like open/close tabs.

(function (RQ) {
    'use strict';
    RQ.runOnAppLoad ||= [];
    RQ.api = {};

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
        RQ.api.get_asset = function (item_id) {
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
        RQ.api.update_asset = function (item_id, payload) {
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
        RQ.api.update_rental_inventory_item = function (inventory_id, payload) {
            // Payload requires InventoryId even though it's also specified in the URL
            payload.InventoryId = inventory_id;
            return fetch(RW_URL + "api/v1/rentalinventory/" + inventory_id, {
                ...standard_fetch,
                "body": JSON.stringify(payload),
                "method": "PUT"
            }).then(res => res.status === 200 ? res.json() : "Error: Update Rental Inventory Item failed with HTTP response " + res.status);
        };
        
        /**
         * Sets pricing information for an item in the active warehouse (selectable in top right corner of RW).
         * warehouse_pricing can include any of the (editable) columns in the item's Warehouse Pricing table.
         * For SalesInventory, you have: Price, Retail, DefaultCost, RestockingFee, RestockingPercent, MaximumDiscount.
         * For RentalInventory, you have: DailyRate, WeeklyRate, Week2Rate, MonthlyRate, MaximumDiscount, MinimumDaysPerWeek, UnitValue, ReplacementCost, NoChargePrint.
         * 
         * @param {string} module_name specify the item's module, such as "RentalInventory" or "SalesInventory"
         * @param {string} icode icode of the item to set pricing information
         * @param {{string:number}} warehouse_pricing an object containing key-value pairs of the pricing field names and their new amounts. Values are numbers or strings (without dollar signs).
         * @param {string} warehouse_id [optional] the Warehouse ID to apply pricing to, if different from the one that is selected in the top right corner of the RW UI
         */
        RQ.api.update_warehouse_pricing = function (module_name, icode, warehouse_pricing, warehouse_id) {
            // Payload requires InventoryId and WarehouseId even though they're also specified in the URL
            // The user's currently selected WarehouseId is available in session storage
            warehouse_id ||= JSON.parse(sessionStorage.getItem('userid'))?.warehouseid;
            if (warehouse_id === undefined) {
                throw new Error("Could not determine WarehouseId to update pricing.");
            }
            RQ.api.get_id_from_code(module_name, icode).then((item_id) => {
                let payload = {
                    "InventoryId": item_id,
                    "WarehouseId": warehouse_id,
                    ...warehouse_pricing
                };
        
                fetch(RW_URL + "api/v1/pricing/" + item_id + "~" + warehouse_id, {
                    ...standard_fetch,
                    "body": JSON.stringify(payload),
                    "method": "PUT"
                }).then(res => res.status === 200 ? res.json() : "Error: Update Pricing failed with HTTP response " + res.status);
            });
        };

        RQ.api.open_form_tab = function (module_name, id_value) {
            let controller = window[module_name + "Controller"];
            let field_names = RQ.api.module_identifier_names(module_name);

            // If the form is already open, switch to that tab
            if (!find_form_tab_by_id(field_names.id, id_value, true)) {
                let ident = {};
                ident[field_names.id] = id_value;
                let new_form = controller.loadForm(ident);
                FwModule.openModuleTab(new_form, new_form.attr("data-caption") + " (loading)", !0, "FORM", !0);
            }
        };

        RQ.api.new_record_tab = function (module_name) {
            if ("function" == typeof window[module_name + "Controller"].openForm) {
                let new_form = window[module_name + "Controller"].openForm("NEW");
                FwModule.openModuleTab(new_form, "New " + new_form.attr("data-caption"), !0, "FORM", !0);
            }
            else {
                throw Error(`You cannot create a new item in the ${module_name} module.`);
            }
        };

        /**Given a module name (ex. "RentalInventory" or "Quote"), returns an object with that module's item code name and id name.
         * @returns an object with two properties: code and id.
         *          code is the name of the mostly-unique identifier that users see, and that is printed on documents (ex. "ICode" or "QuoteNumber").
         *          id is the name of the actually-unique identifier that users don't see, but the system uses to specify and query particular records (ex. "InventoryId" or "QuoteId").
         * @returns undefined if module is unknown.
         */
        RQ.api.module_identifier_names = function (module_name) {
            let names = undefined;
            const conventional_names = [ "Contract", "Customer", "Deal", "Invoice", "Order", "PickList", "PurchaseOrder", "Quote", "Repair", "Vendor" ];
            const exceptional_names = {
                Asset:           { code: "BarCode",      id: "ItemId" },
                RentalInventory: { code: "ICode",        id: "InventoryId" },
                SalesInventory:  { code: "ICode",        id: "InventoryId" },
                Warehouse:       { code: "WarehouseCode",id: "WarehouseId"},
                RepairOrder:     { code: "RepairNumber", id: "RepairId" }, //@HACK: module/repair has caption "Repair Order", so conventional_names doesn't catch it above if using module captions.
                RetiredHistory:  { code: "BarCode",      id: "RetiredId" } 
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

        /**The module caption is the name of a module's root tab. The module name is what you find in 
         * the data-name attribute of module tabs, or in the module's hash navigation string.
         * Most often, module name is simply the caption with whitespace stripped, but there are
         * exceptions, which this function is meant to handle. These should not be confused with the
         * controller name, which is always `${module_name}Controller`, or the hash path, which
         * is usually `#/module/${module_name}`.
         * @param {String} module_info an object resembling those within window.masterController.navigation
         * @returns a string such as "RentalInventory" or "Repair"
         */
        RQ.api.get_module_name = function (module_info) {
            let module_name = module_info.caption;
            const exceptional_names = {
                'Asset': 'Asset',
                'Complete QC': 'CompleteQc',
                'Change I-Code': 'ChangeICodeUtility',
                'System Update': 'SystemUpdate',
                'Process Invoices': 'InvoiceProcessBatch',
                'Process Receipts': 'ReceiptProcessBatch',
                'Report Styling / CSS': 'CustomReportCss',
                'Process Vendor Invoices': 'VendorInvoiceProcessBatch',
            };
            let exceptional_name = exceptional_names[module_name];
            if (exceptional_name) {
                module_name = exceptional_name;
            }
            else {
                module_name = module_name.replaceAll(/[- \/]/g, '');
                // Even for the general case, we have special handling for things like 
                //   RepairController: has caption "Repair Order" and hash path #/module/repair
                //   PluginController: has caption "Plugins" and hash path #/module/plugin
                let module_name_length = module_info.nav.length - 'module/'.length;
                module_name = module_name.slice(0, module_name_length);
            }
            return module_name;
        };

        RQ.api.get_id_from_code = function (module_name, code) {
            let field_names = RQ.api.module_identifier_names(module_name);
            return RQ.api.lookup_item_by_code(module_name, field_names.code, code)
                .then(res => res?.[field_names.id]);
        };

        RQ.api.lookup_item_by_code = function (module_name, code_name, code_value) {
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