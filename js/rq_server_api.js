

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
            "sec-ch-ua": "\" Not;A Brand\";v=\"99\", \"Google Chrome\";v=\"97\", \"Chromium\";v=\"97\"",
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": "\"Windows\"",
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-origin",
            "x-requested-with": "XMLHttpRequest"
        };

        /**Gets a RW Asset (any item that is tracked individually, such as by barcode)
         * @param item_id The ItemID string that identifies the asset
         * @returns a Promise that resolves to a JSON representation of the Asset object, or
         *          a String describing an error that occurred.
         */
        RQ.get_asset = function (item_id) {
            return fetch(RW_URL + "api/v1/item/" + item_id, {
                "headers": standard_headers,
                "referrer": RW_URL,
                "referrerPolicy": "no-referrer-when-downgrade",
                "body": null,
                "method": "GET",
                "mode": "cors",
                "credentials": "include"
            }).then(res => res.status === 200 ? res.json() : "Error: Get Asset failed with HTTP response " + res.status);
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
            return fetch(RW_URL + "api/v1/item/" + item_id, {
                "headers": standard_headers,
                "referrer": RW_URL,
                "referrerPolicy": "no-referrer-when-downgrade",
                "body": JSON.stringify(payload),
                "method": "PUT",
                "mode": "cors",
                "credentials": "include"
            }).then(res => res.status === 200 ? res.json() : "Error: Update Asset failed with HTTP response " + res.status);
        };
    };
    // Wait until the user is logged in, otherwise there won't be a 'sessionStorage.apiToken'
    RQ.runOnAppLoad.push(init_server_api);
})(window.RentalQuirks);