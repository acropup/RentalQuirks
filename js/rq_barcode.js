/* This code depends on the Zebra Browser Print library. Files to include are:
   - BrowserPrint-3.0.216.min.js
   - BrowserPrint-Zebra-1.0.216.min.js
   Global variables created from these files:
   - window.BrowserPrint
   - window.Zebra
   Note that both RentalWorks code (ex. script1-2019.1.2.206.js) and the Zebra Browser Print library use
   Closure Compiler, which creates the global window.$jscomp variable. I don't know if there's any risk 
   of one file clobbering the other, but that's something to keep in mind.

  The Zebra Browser Print utility must be running on the user's system, and the barcode printer must be
  connected in order for this barcode print integration to work. See the utility's user guide here:
  https://www.zebra.com/content/dam/zebra_new_ia/en-us/solutions-verticals/product/Software/Printer%20Software/Link-OS/browser-print/zebra-browser-print-user-guide-v1-3-en-us.pdf
   */
(function (RQ) {
  'use strict';
  RQ.barcode = {};
  RQ.barcode.byId = {}; //Will contain references to all DOM elements that have ID specified.
  RQ.barcode.addBarcodeButton = addBarcodeButton;
  RQ.barcode.printerList = []; //These properties are all assigned values during init_ui_elements()
  RQ.barcode.selectedPrinter;
  RQ.barcode.selectedBarcodeType;
  RQ.barcode.selectedPrintCopies;
  const sample_good_host_status = '\x02014,0,0,0214,000,0,0,0,000,0,0,0\x03\r\n\x02001,0,0,0,1,2,3,0,00000000,1,000\x03\r\n\x021234,0\x03\r\n';
  //Provide a dummy printer entry so that people can practice with the UI without sending prints by accident.
  const dry_run_printer = {
    name: "Dry run - print disabled",
    uid: -1,
    send: (zpl_command) => notify_user("info", "Pretend send: " + zpl_command),
    read: () => notify_user("info", "Pretend read."),
    sendThenRead: (zpl_command, yah, nah) => {
      if (zpl_command == '~HS') { // Fake a response after 1 second
        setTimeout(() => yah(sample_good_host_status), 1000);
      }
    },
    // Configuration responses start with \x02 (STX), end with \x03 (ETX), and every line reserves
    // the first 20 chars for the value, and the rest for the name. Acutal configuration responses
    // have many more properties (Send ^XA^HH^XZ for an example), but as of Zebra library v1.0.216,
    // the library doesn't parse any more than what's specified below.
    fake_configuration: String.fromCharCode(2) + `
25.0                DARKNESS
0 IPS               PRINT SPEED
0                   PRINT WIDTH
0                   LABEL LENGTH
0                   LINK-OS VERSION
0.0.0.0 <-          FIRMWARE` + String.fromCharCode(3)
  };
  RQ.barcode.barcodeTypes = [
    {
      name: "Small",
      description: "0.5in x 1.0in",
      validate: (code) => { return /^\d{5}$/.test(code); }, //TODO: validation should be for 6 digits, but it's currently 5 for debugging purposes
      setup_command: () => "^XA^SS,,,127^PW228~TA-012^LT-7^LS28^LH0,0~JSN^MNW^MTT^MMT,N^PON^PMN^FWN,0^JMA^PR2,2~SD20^JUS^LRN^CI28^XZ",
      print_command: (code, quantity = 1) => `^XA^XFE:BWL1IN.GRF^FN1^FD${code}^FS^PQ${quantity}^XZ`
    },
    {
      name: "Large",
      description: "1.0in x 2.0in",
      validate: (code) => { return /^\d{6}$/.test(code); },
      setup_command: () => "^XA^SS,,,214^PW430~TA-012^LT12^LS12^LH0,0~JSN^MNW^MTT^MMT,N^PON^PMN^FWN,0^LRN^JMA^PR2,2~SD15^JUS^CI28^XZ",
      print_command: (code, quantity = 1) => `^XA
      ^FT24,48^A0,36,36^FB358,1,0,C^FDBetter Way Lighting\\&^FS
      ^FT67,146^BY4,3,80^BCN,,N,N^FD>;${code}^FS
      ^FT24,182^FP,2^FB358,1,,C^AS^FD${code}\\&^FS
      ^PQ${quantity}
      ^XZ`
    },
    {
      name: "Test",
      description: "1.0in x 2.0in simple test",
      validate: (code) => { return /^\d{1,8}$/.test(code); },
      setup_command: () => "^XA^SS,,,214^PW430~TA-012^LT12^LS12^LH0,0~JSN^MNW^MTT^MMT,N^PON^PMN^FWN,0^LRN^JMA^PR2,2~SD15^JUS^CI28^XZ",
      print_command: (code, quantity = 1) => `^XA
      ^FWR^FT360,16^FB180,1,,L^AS^FD${code}^FS
      ^PQ${quantity}
      ^XZ`
    }
  ];

  //For testing, this opens barcode utility automatically when page loads.
  //RQ.runOnAppLoad.push(click_barcode_button);

  function addBarcodeButton(toolbar, position) {
    if (!toolbar) return false;

    let btn = document.createElement('div');
    btn.className = "barcodebutton";
    btn.innerHTML = `
<svg viewBox="0 0 20 12" xmlns="http://www.w3.org/2000/svg"><g>
<rect x="0" width="2" height="12"/>
<rect x="3" width="1" height="12"/>
<rect x="6" width="2" height="12"/>
<rect x="8" width="1" height="12"/>
<rect x="11" width="2" height="12"/>
<rect x="14" width="3" height="12"/>
<rect x="19" width="1" height="12"/>
</g></svg>
`; //SVG barcode icon
    toolbar.insertAdjacentElement(position, btn);
    btn.addEventListener('click', click_barcode_button);
    RQ.barcode.byId.barcode_button = btn;
    update_queue_count();
    return btn;
  }

  function click_barcode_button() {
    if (RQ.barcode.ui) {
      RQ.barcode.ui.classList.toggle('hidden');
      return;
    }

    let toggle_item_html_string = function (group_name, text, value, selected) {
      return `<label class="togglebutton-item">
        <input type="radio" class="fwformfield-value" name="${group_name}" value="${value}"${selected ? 'checked="true"' : ""}>
        <span class="togglebutton-button">${text}</span>
      </label>`;
    }

    let barcode_ui = document.createElement('div');
    barcode_ui.className = 'fwpopup fwconfirmation';
    barcode_ui.id = "rq-barcode";
    barcode_ui.innerHTML = `
  <div class="fwpopupbox fwconfirmationbox rq-draggable" data-print-state="ready">
  <div class="popuptitle rq-draghandle">Barcode Print Utility</div>
  <div class="close-modal"><i class="material-icons"></i>
    <div class="btn-text">Close</div>
  </div>
  <div class="flexpage">
    <div class="flexrow">
      <div class="flexcolumn">
        <div class="fwcontrol fwcontainer fwform-section" data-control="FwContainer">
          <div id="barcode-picker-btn" class="fwformcontrol" data-type="button" title="From within RentalWorks, click on any Barcode field to add it to the print queue">Picker</div>
          <div class="fwform-section-title">Print Queue</div>
          <div class="fwform-section-body" style="display: flex; flex-direction: row; gap: 5px;">
            <div style="flex-direction: column;">
              <div class="fwformfield" data-type="text"><div class="fwformfield-control">
              <input id="text-entry" type="text" class="fwformfield-value" autocomplete="off" list="autocompleteOff" placeholder="Enter Barcode #"></div></div>
              <ul id="barcode-queue"></ul>
              <div id="print-one-btn" class="fwformcontrol" data-type="button" title="[Ctrl+Click] to print just one copy while leaving the barcode in the queue.">Print Next</div>
              <div id="print-all-btn" class="fwformcontrol" data-type="button" title="Prints all barcodes in the queue, starting at the bottom, and stopping at the first invalid queue entry.">Print All</div>
            </div>
            <div style="display: flex; flex-direction: column; gap: 6px; width: 4em;">
              <div id="queue-btn" class="fwformcontrol" data-type="button" title="[Enter]&#009; Add to queue&#013;[Ctrl+Enter] Print immediately">Add</div>
              <div title="(De)activation can only be done to queue items added with the Picker tool" style="letter-spacing: 0.8px;font-size: 10px; text-transform: uppercase; text-align: center; padding-top: 0.5em; border-top: 1px #e0e0e0 solid;">Activate / Deactivate Barcodes</div>
              <div id="activate-btn" class="fwformcontrol" data-type="button" title="Activate Barcodes"></div>
              <div id="deactivate-btn" class="fwformcontrol" data-type="button" title="Deactivate Barcodes"></div>
              <div style="letter-spacing: 0.8px;font-size: 10px;text-transform: uppercase;text-align: center;margin-top: 11.9em;padding-top: 0.5em;border-top: 1px #e0e0e0 solid;">Print Controls</div>
              <div id="pause-btn" class="fwformcontrol" data-type="button" title="Pause printing"></div>
              <div id="cancel-btn" class="fwformcontrol" data-type="button" title="Cancel printing"></div>
              <div id="clear-btn" class="fwformcontrol" data-type="button" title="Clear printed items from queue"></div>
            </div>
          </div>
        </div>
      </div>
      <div class="flexcolumn">
        <div class="fwcontrol fwcontainer fwform-section" data-control="FwContainer">
          <div class="fwform-section-title">Configuration</div>
          <div class="fwform-section-body">
            <div id="printer-refresh-btn" class="fwformcontrol" data-type="button"
              style="padding: unset; margin: 0 5px; height: 2.2em; min-width: 2.2em; float: right; margin-top: 20px;">
              <span class="material-icons" style="transform: translateY(4px) rotate(45deg);">autorenew</span>
            </div>
            <div data-control="FwFormField" data-type="text" class="fwcontrol fwformfield">
              <div class="fwformfield-caption">Printer</div>
              <div class="fwformfield-control">
                <select id="printer-select" class="fwformfield-value"></select>
              </div>
            </div>

            <div data-control="FwFormField" data-type="togglebuttons" class="fwcontrol fwformfield">
              <div class="fwformfield-caption">Barcode Type</div>
              <div class="fwformfield-control">
                ${toggle_item_html_string("barcode-type", "Small", 0)}
                ${toggle_item_html_string("barcode-type", "Large", 1, true)}
                ${" " || "this test option is disabled" || toggle_item_html_string("barcode-type", "Test", 2, true)}
              </div>
            </div>

            <div data-control="FwFormField" data-type="togglebuttons" class="fwcontrol fwformfield">
              <div class="fwformfield-caption">Print Copies</div>
              <div class="fwformfield-control">
                ${toggle_item_html_string("print-copies", 1, 1)}
                ${toggle_item_html_string("print-copies", 2, 2)}
                ${toggle_item_html_string("print-copies", 3, 3, true)}
                ${toggle_item_html_string("print-copies", 4, 4)}
                ${toggle_item_html_string("print-copies", 5, 5)}
              </div>
            </div>
          </div>
        </div>
        <div class="fwcontrol fwcontainer fwform-section" data-control="FwContainer">
          <div class="fwform-section-title">Logging</div>
          <div id="barcode-log" class="fwform-section-body">
            <div>To do: Disable UI while printing</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>`;


    let app_elem = document.getElementById('application');
    app_elem.appendChild(barcode_ui);

    init_ui_elements(barcode_ui);
    // Put focus on the textbox whenever the barcode UI is opened
    barcode_ui.addEventListener('animationend', (e) => {
      if (e.animationName == "fadeIn") {
        RQ.barcode.byId.text_entry.focus();
      }
    });

    RQ.barcode.ui = barcode_ui;
    WindowDragger();
  }

  function init_ui_elements(barcode_ui) {
    let byId = RQ.barcode.byId;
    // Populate byId with references to all DOM elements within barcode_ui that have an ID.
    Array.from(document.querySelectorAll('#rq-barcode [id]')).forEach(elem => byId[elem.id.replaceAll('-', '_')] = elem);
    byId[barcode_ui.id.replaceAll('-', '_')] = barcode_ui; // and the barcode_ui itself
    byId.barcode_button = document.querySelector('.app-usercontrols > .barcodebutton'); // and the barcode button on the main app toolbar

    let close_btn = barcode_ui.querySelector('.close-modal');
    close_btn.addEventListener('click', () => barcode_ui.classList.toggle('hidden'));
    byId.text_entry.addEventListener('keydown', text_entry_keydown);
    byId.queue_btn.addEventListener('click', click_queue_btn);
    byId.print_one_btn.addEventListener('click', (e) => print_next_barcode(undefined, e.ctrlKey));
    byId.print_all_btn.addEventListener('click', (e) => feed_printer());
    byId.printer_select.addEventListener('change', update_printer_selected);
    byId.printer_refresh_btn.addEventListener('click', refresh_printer_list);

    add_radio_change_event("barcode-type", (e) => {
      RQ.barcode.selectedBarcodeType = RQ.barcode.barcodeTypes[e.target.value];
      validate_print_queue();
      // Run setup so we're ready to print the newly-selected type of barcodes
      send_command(RQ.barcode.selectedBarcodeType.setup_command());
    });
    // Set default barcode type
    let default_barcode_type = barcode_ui.querySelector('input[type="radio"][name="barcode-type"]:checked');
    default_barcode_type.dispatchEvent(new Event('change'));

    // Set default print copies
    RQ.barcode.selectedPrintCopies = barcode_ui.querySelector('input[type="radio"][name="print-copies"]:checked').value;
    // Update selected print copies when user changes it
    add_radio_change_event("print-copies", (e) => {
      RQ.barcode.selectedPrintCopies = e.target.value;
    });

    let barcode_selector = BarcodePicker(queue_barcode);
    byId.barcode_picker_btn.addEventListener('click', () => barcode_selector.toggle_enabled());
    byId.activate_btn.addEventListener('click', () => {
      // If any queue items are selected, operate on selected elements only
      let has_selection = !!byId.barcode_queue.querySelector('li.selected');
      let queue_items = byId.barcode_queue.querySelectorAll(`li${has_selection ? '.selected' : ''} > [data-itemid][data-is-valid=false]`);
      activate_barcodes([...queue_items]);
    });
    byId.deactivate_btn.addEventListener('click', () => {
      // If any queue items are selected, operate on selected elements only
      let has_selection = !!byId.barcode_queue.querySelector('li.selected');
      let queue_items = byId.barcode_queue.querySelectorAll(`li${has_selection ? '.selected' : ''} > [data-itemid][data-is-valid=true]`);
      deactivate_barcodes([...queue_items]);
    });
    byId.pause_btn.addEventListener('click', (e) => {
      if (byId.rq_barcode.dataset.printState == "print" && !e.target.classList.toggle('paused')) {
        RQ.barcode.commands.resumePrinting();
      }
      else {
        RQ.barcode.commands.pausePrinting();
      }
    });
    byId.cancel_btn.addEventListener('click', (e) => {
      if (byId.rq_barcode.dataset.printState == "print") {
        byId.rq_barcode.dataset.printState = "abort";
        byId.pause_btn.classList.remove('paused');
      }
      RQ.barcode.commands.cancelAllPending();
    });
    byId.clear_btn.addEventListener('click', (e) => {
      if (byId.rq_barcode.dataset.printState == "ready") {
        byId.barcode_queue.querySelectorAll('li[data-print-status="done"]').forEach(item => item.remove());
      }
    });
    refresh_printer_list();


    let encode_li = function (elems) {
      return Array.from(elems).map(elem => {
        let barcode = elem.textContent;
        let item_id = elem.dataset.itemid;
        if (item_id) {
          barcode += '[' + item_id + ']';
        }
        return barcode;
      }).join('\n');
    };
    let decode_li = function (encode_string) {
      let validate = RQ.barcode.selectedBarcodeType.validate;

      let entries = encode_string.split(/\s+/).filter(Boolean);
      return entries.map(str => {
        let m = str.match(/([^[]+)(?:\[([^\]]*)])?/);
        let div = document.createElement('div'); //TODO: This is very similar to queue_barcode()
        div.setAttribute('draggable', true);
        div.textContent = m[1];      //Barcode
        div.dataset.isValid = validate(m[1]);
        if (m[2]) {
          div.dataset.itemid = m[2]; //Asset ItemId
        }
        return div;
      });
    };
    DragDropList(byId.barcode_queue, encode_li, decode_li);
    DragDropList(byId.barcode_log, encode_li, decode_li);
  }

  function add_radio_change_event(radio_name, change_event_handler) {
    let radio_options = Array.from(document.querySelectorAll(`input[type="radio"][name="${radio_name}"]`));
    radio_options.forEach(radio => radio.addEventListener('change', change_event_handler));
  }

  function validate_print_queue() {
    let validate = RQ.barcode.selectedBarcodeType.validate;
    Array.from(RQ.barcode.byId.barcode_queue.children).forEach(list_item => {
      let div = list_item.firstElementChild;
      div.dataset.isValid = validate(div.textContent);
    });
  }

  /**Takes an array of (presumably deactivated) items from the barcode queue, and 
   * calls the RW API to update each item's barcode with the 'X' identifier removed.
   * Barcodes are activated when an Asset without a barcode is recovered, so that
   * we can print and apply barcode stickers to that asset.
   * @param {[Element]} queue_items the DOM Elements in the barcode queue that need their barcodes activated
   */
  function activate_barcodes(queue_items) {
    let validate = RQ.barcode.selectedBarcodeType.validate;
    queue_items.forEach(queue_item => {
      // Validate and package updates for each item
      let barcode = queue_item.textContent;
      let item_id = queue_item.dataset.itemid;
      let deactivated_identifier = barcode.slice(-1).toUpperCase();
      let active_barcode = barcode.slice(0, -1);
      // Ignore any items that failed validation
      if (item_id && deactivated_identifier == 'X' && validate(active_barcode)) {
        // Update each asset with activated barcode values
        RQ.update_asset(item_id, { BarCode: active_barcode })
          .then(json_or_error => {
            if (typeof json_or_error == 'string' || !(json_or_error['BarCode'])) {
              console.log("update_asset failed: " + json_or_error, queue_item);
            }
            else {
              // Update the barcode value in the queue list once the update is confirmed by the backend
              queue_item.textContent = json_or_error['BarCode'];
              queue_item.dataset.isValid = true; // Value validated above
              console.log('updated', json_or_error);
            }
          });
      }
    });
  }

  /**Takes an array of items from the barcode queue, and calls the RW API to update
   * each item's barcode with an 'X' appended to it. The 'X' serves an identifier
   * to mark that this barcode is deactivated. Barcodes are deactivated when they
   * have been assigned to an asset, but the asset is not yet available to apply a
   * barcode sticker to. This way, we know which barcodes haven't been printed or used yet.
   * @param {[Element]} queue_items the DOM Elements in the barcode queue that need their barcodes deactivated
   */
  function deactivate_barcodes(queue_items) {
    let validate = RQ.barcode.selectedBarcodeType.validate;
    queue_items.forEach(queue_item => {
      let barcode = queue_item.textContent;
      let item_id = queue_item.dataset.itemid;
      // Only deactivate barcodes that appear to be valid
      if (item_id && validate(barcode)) {
        // Update each asset's barcode values with an 'X' appended, to identify the barcode as deactivated
        RQ.update_asset(item_id, { BarCode: barcode + "X" })
          .then(json_or_error => {
            if (typeof json_or_error == 'string' || !(json_or_error['BarCode'])) {
              console.log("update_asset failed: " + json_or_error, queue_item);
            }
            else {
              queue_item.textContent = json_or_error['BarCode'];
              queue_item.dataset.isValid = false; // Value is invalid because of 'X', the deactivated identifier
              console.log('updated', json_or_error);
            }
          });
      }
    });
  }

  function queue_barcode(barcode_info) {
    let validate = RQ.barcode.selectedBarcodeType.validate;
    let new_item = document.createElement('li');
    let inner_div = document.createElement('div');
    inner_div.setAttribute('draggable', 'true');
    inner_div.textContent = barcode_info.Barcode;
    inner_div.dataset.isValid = validate(barcode_info.Barcode);
    if (barcode_info.ItemId) {
      inner_div.dataset.itemid = barcode_info.ItemId;
    }
    new_item.appendChild(inner_div);
    RQ.barcode.byId.barcode_queue.prepend(new_item);
    update_queue_count();
  }

  function dequeue_barcode(list_item) {
    let queue = RQ.barcode.byId.barcode_queue;
    if (list_item?.parentElement === queue) {
      queue.removeChild(list_item);
      update_queue_count();
    }
  }

  function update_queue_count() {
    RQ.barcode.byId.barcode_button.dataset.queueCount = RQ.barcode.byId.barcode_queue?.childElementCount || 0;
  }

  function click_queue_btn(e) {
    let textbox = RQ.barcode.byId.text_entry;
    let next_barcode = textbox.value;
    let success = true;
    if (e.ctrlKey) {
      // Ctrl+Click or Ctrl+Enter prints the next barcode while skipping the queue
      success = print_next_barcode(next_barcode);
    }
    else {
      // If a barcode is submitted manually like this, we don't have immediate access to the ItemId
      queue_barcode({ Barcode: next_barcode, ItemId: undefined });
    }
    if (success) {
      textbox.value = "";
    }
    textbox.focus();
  }

  /**Within text_entry field, Enter key submits value to queue, 
   * and Ctrl+Enter prints value immediately.
   * @param {KeyboardEvent} e 
   */
  function text_entry_keydown(e) {
    if (e.key == 'Enter') {
      click_queue_btn(e);
    }
  }

  /**Prints the barcode value in next_barcocde, or if none supplied,
   * prints and removes the next barcode in the queue. If event.ctrlKey is passed
   * to print_one_copy, a Ctrl+Click will only print one copy, and will not remove
   * the barcode from the queue.
   * @param {String} next_barcode the next barcode to print, or undefined
   * @param {Boolean} print_one_copy indicates whether only one copy should be printed.
   *                                 If true, the printed barcode stays in the queue.
   * @returns true if print succeeds, false if print failed or if barcode was invalid
   */
  function print_next_barcode(next_barcode = undefined, print_one_copy = false) {
    let next_item;
    if (!next_barcode) {
      next_item = RQ.barcode.byId.barcode_queue.lastElementChild;
      next_barcode = next_item?.textContent;
    }

    let print_copies = print_one_copy ? 1 : RQ.barcode.selectedPrintCopies;
    let barcode_type = RQ.barcode.selectedBarcodeType;
    if (barcode_type.validate(next_barcode)) {
      notify_user(`Printing ${print_copies} of ${next_barcode} in style ${barcode_type.name}`);
      if (RQ.barcode.selectedPrinter.uid != dry_run_printer.uid) {
        let cmd_string = barcode_type.print_command(next_barcode, print_copies);
        send_command(cmd_string);
      }
      if (!print_one_copy) {
        dequeue_barcode(next_item);
      }
      return true;
    }
    else {
      if (next_barcode) {
        notify_user('error', `Value ${next_barcode} is invalid for ${barcode_type.name} barcodes.`);
      }
      else {
        notify_user('error', "No barcode to print.");
      }
      return false;
    }
  }

  // Prints all queued barcodes of the selected type and quantity.
  // Once a barcode is printed, it is removed from the queue.
  // Printing halts on the first barcode value that is invalid.
  // NOTE: This function uses the Zebra library's command queue. This is safe, but not optimal because 
  //       it only sends one command at a time, and in between commands, the printer has time to stop
  //       and wait. This is being left here as a fallback in case feed_printer() is found to be unreliable.
  //       This function is not made to work with the pause/cancel buttons.
  /*
  function print_all_barcodes() {
    let printer = RQ.barcode.selectedPrinter;
    let validate = RQ.barcode.selectedBarcodeType.validate;
    let print_command = RQ.barcode.selectedBarcodeType.print_command;
    let print_copies = RQ.barcode.selectedPrintCopies;

    let recv_fn = (queue_item) => {
      return function (response) {
        notify_user('warning', `I didn't think we should receive anything after printing a barcode, but I was wrong. As a result of printing "${queue_item.textContent}", we received "${response}"`);
        dequeue_barcode(queue_item);
        printer.executeNextRequest();
      }
    };
    let success_fn = (queue_item) => {
      return function (response) {
        notify_user('info', `Success printing "${queue_item.textContent}", response is "${response}"`);
        dequeue_barcode(queue_item);
        printer.executeNextRequest();
      }
    };
    let err_fn = (queue_item) => {
      return function (response) {
        notify_user('error', `Printing halted at "${queue_item.textContent}" due to error "${response}"`);
        printer.clearRequestQueue();
      }
    };

    let queue = RQ.barcode.byId.barcode_queue;
    let queued_barcodes = [];
    // Starting from the last in the queue, validate each barcode and queue it to print
    for (let queue_item = queue.lastElementChild; queue_item != null; queue_item = queue_item.previousElementSibling) {
      let barcode_value = queue_item.textContent;
      if (!validate(barcode_value)) {
        notify_user('warning', `Stopped at "${barcode_value}" because it is not a valid barcode.`);
        break;
      }
      let req = new printer.Request("print", print_command(barcode_value, print_copies), recv_fn(queue_item), success_fn(queue_item), err_fn(queue_item));
      printer.queueRequest(req);
      queued_barcodes.push(barcode_value);
      // The printer.queueRequest feature sends items one at a time, so the printer always pauses momentarily between print commands.
      // This is not good, too slow and noisy. If we just sent all the barcode print commands at once, it works ok. I'm hesitant to do
      // this, though, because I don't know how large the receive buffer is, or what happens if it gets full. All I know is there's
      // a "buffer full flag" in the ~HS Host Status Return for when the receive buffer is full. 
      //send_command(print_command(barcode_value, print_copies));
    }
    if (queued_barcodes.length == 0) {
      notify_user('error', "No barcodes to print.");
    }
    else if (queued_barcodes.length == 1) {
      notify_user("1 barcode queued to print: " + queued_barcodes[0]);
    }
    else {
      notify_user(queued_barcodes.length + " barcodes queued to print:\n" + queued_barcodes.join(', '));
    }
  }
  */

  /**Starting from the last in the queue, send each item to print. Each barcode is
   * validated, and printing stops at the first invalid barcode.
   * The printer is continuously queried for status updates, and barcodes are sent
   * periodically in order to maintain an optimal buffer of commands on the printer.
   * If everything works as intended, the printer will print all the required labels
   * while maintaining continuous motion of its media. If the printer stops and starts
   * between items, then the 'buffer_target' should be increased to accommodate. We
   * don't just send all format commands at once, because the printer's command buffer
   * is of limited size and could be filled to capacity. Zebra documentation does not
   * specify what happens when the buffer is filled.
   */
  function feed_printer() {
    // I apologize to my future self and anyone else who ever needs to work on this, but
    // this effort put into printing barcodes is already borderline unjustifiable, given
    // that only one person is likely to ever use it.
    // This routine can run (asynchronously) for an extended period of time, and it
    // makes certain assumptions about the state of the program that are not necessarily
    // guaranteed. An effort should be made to prevent the user from changing settings
    // and rearranging the barcode queue while barcodes are being printed. It should
    // properly handle pausing and cancelling the print queue, though.
    //  
    //TODO: Handle situations where user clicks on things while this process is happening (ex. disable UI)
    let barcode_utility = RQ.barcode.byId.rq_barcode;
    let printer = RQ.barcode.selectedPrinter;
    let validate = RQ.barcode.selectedBarcodeType.validate;
    let print_command = RQ.barcode.selectedBarcodeType.print_command;
    let print_copies = RQ.barcode.selectedPrintCopies;
    let queue = RQ.barcode.byId.barcode_queue;

    let total_sent_to_printer = 0;
    let started_sending = false;
    let done_sending = false;
    // Clear print status if left from previous runs
    queue.querySelectorAll('li[data-print-status]').forEach(x => delete x.dataset.printStatus);

    let on_error = function (e) {
      notify_user('error', "Oopsies, something happened: " + e);
      //TODO: Cleanup whatever might have happened to the queue prior to the error. For now,
      //      I'm leaving it because the mess left after an error will help identify the problem.
    };
    let update_buffer_status = function (remaining_buffer_size) {
      let sent_items = [...queue.querySelectorAll('li[data-print-status="sent"]')];
      // Skip the ones that are still in the buffer, and mark the rest as done
      sent_items.slice(remaining_buffer_size).forEach(x => x.dataset.printStatus = "done");
    };

    let got_host_status = function (host_status_return) {
      let hs = parse_host_status(host_status_return);

      // Check buffer status and update UI to reflect it
      let num_in_buffer = hs.num_formats_in_buffer // Number of format commands in the command buffer
      console.log('number of formats and labels', num_in_buffer, hs.num_labels_remaining_in_batch);

      // Aim to have enough format commands in the buffer to exceed 'buffer_target'
      const buffer_target = Math.ceil(8 / print_copies);
      let buffer_short = buffer_target - num_in_buffer;
      if (buffer_short > 0) {
        // Unless just starting, the printer must have processed (printed) one or more commands (set of barodes)
        update_buffer_status(num_in_buffer);

        if (done_sending) {
          // Here we're just waiting until printer's buffer is empty (everything's finished printing)
          if (num_in_buffer == 0) {
            let total_finished_printing = total_sent_to_printer - hs.num_formats_in_buffer;
            notify_user('info', `Printed ${total_finished_printing} queue items.`);
            RQ.barcode.byId.pause_btn.classList.remove('paused');
            barcode_utility.dataset.printState = "ready";
            return;
          }
        }
      }

      // Handle any error conditions in the printer status
      if (!hs.is_ready() || barcode_utility.dataset.printState == "abort") {
        let abort = true;
        if (hs.head_up) notify_user('error', "Print head is open. Close print head and try again.");
        if (hs.paper_out) notify_user('error', "Printer thinks label paper is missing from feeder.");
        if (hs.ribbon_out) notify_user('error', "Printer thinks thermal transfer ribbon is missing from feeder.");
        if (hs.under_temp) notify_user('error', "Printer thinks it's too cold!");
        if (hs.over_temp) notify_user('error', "Printer thinks it's too hot!");
        if (hs.corrupt_ram) {
          notify_user('error', "Printer claims that RAM is corrupt. Attempting to reboot...");
          RQ.barcode.commands.resetPrinter();
        }
        if (hs.buffer_full) {
          abort = false;
          notify_user('warning', "Printer's command buffer is full! Retrying...");
        }
        if (hs.paused) {
          abort = false;
          // Normally the user should press the Pause button on the printer, but this will hopefully make that unnecessary
          // started_sending ensures that we only do this the first time around so that we don't interfere with the user choosing to pause during printing
          if (!started_sending) {
            notify_user('warning', "Printer is paused, attempting to resume...");
            RQ.barcode.commands.resumePrinting();
          }
          else {
            notify_user('warning', "Printer is paused. Press the PAUSE button on the printer's control panel to resume.");
          }
        }

        if (abort || barcode_utility.dataset.printState == "abort") {
          RQ.barcode.commands.cancelAllPending();
          let total_finished_printing = total_sent_to_printer - hs.num_formats_in_buffer;
          notify_user('info', `Action aborted. Printed ${total_finished_printing} queue items.`);
          // Mark any printed as "done", and remove any marked "sent" because we cancelled them
          update_buffer_status(hs.num_formats_in_buffer);
          queue.querySelectorAll('li[data-print-status="sent"]').forEach(x => delete x.dataset.printStatus);
          RQ.barcode.byId.pause_btn.classList.remove('paused');
          barcode_utility.dataset.printState = "ready";
          return; // Do not query ~HS again because we are done!
        }
        // !abort means we will query ~HS again
      }
      else if (buffer_short > 0 && !done_sending) { // If printer status is ok, keep the command buffer topped up
        started_sending = true;
        // If there is room in the printer command buffer, add next in queue to printer command buffer
        // Starting from last, choose x items where x = buffer_short
        let queue_items = [...queue.querySelectorAll('li:not([data-print-status])')].slice(-buffer_short).reverse();
        if (queue_items.length == 0) {
          notify_user('info', "Barcode queue is empty.");
          done_sending = true;
        }
        else {
          // When sending multiple commands, batch them. If we don't, sometimes they arrive out of order, and I think
          // there's little we can do about that because the BrowserPrint send() command uses TCP, and things might arrive
          // in the wrong order. At least that's all I can think of that might be causing the out-of-order prints.
          let command_batch = [];
          for (const queue_item of queue_items) {
            let barcode_value = queue_item?.textContent || "";
            if (validate(barcode_value)) {
              command_batch.push(print_command(barcode_value, print_copies));
              // The barcode command is sent to the printer, but won't print immediately if it gets buffered behind other commands
              // For now, just mark the item as "sent", and later we'll check if it's made it through the buffer
              queue_item.dataset.printStatus = "sent";
            }
            else {
              notify_user('warning', `Stopped at "${barcode_value}" because it is not a valid barcode.`);
              // Stop adding to the printer command buffer; we're at the end.
              done_sending = true;
              break;
            }
          }
          // Send all batched barcode commands
          if (command_batch.length) {
            send_command(command_batch.join('\n'));
            total_sent_to_printer += command_batch.length;
          }
        }
      }
      // Query Host Status again, to check the print buffer size
      printer.sendThenRead("~HS", got_host_status, on_error);
    };

    //TODO: It takes a while (~1sec) to query the printer state. It'd be nice if we could first try to start printing and
    //      then check the state later. If we find that the printer is in an error state, we then stop and recover from
    //      the false start.
    printer.sendThenRead("~HS", got_host_status, on_error);
    barcode_utility.dataset.printState = "print";

    // Kickstart the cycle by passing a pretend host status result that makes it look like the printer's buffer is empty and it is ready to print
    //TODO: This is disabled currently, because if the machine is paused, I don't know if it was paused from the start or if the user paused it. 
    //got_host_status(sample_good_host_status);

  }

  function parse_host_status(hs_data) {
    // Sample hs_data from ~HS command: '\x02014,0,0,0214,000,0,0,0,000,0,0,0\x03\r\n\x02001,0,0,0,1,2,3,0,00000000,1,000\x03\r\n\x021234,0\x03\r\n'
    //Split on control characters (we're expecting STX, ETX, CR, LF) to get the three status lines
    let lines = hs_data.split(/[\cA-\cZ]/).filter(Boolean).map(x => x.split(','));
    let line1 = lines[0];
    let line2 = lines[1];
    let line3 = lines[2];
    let flag = (zero_or_one_str) => zero_or_one_str == "1";
    let status = {
      comm_settings: line1[0],
      paper_out: flag(line1[1]),
      paused: flag(line1[2]),
      label_length: line1[3],
      num_formats_in_buffer: line1[4],
      buffer_full: flag(line1[5]),
      comm_diag_mode: flag(line1[6]),
      partial_format: flag(line1[7]),
      //line1[8] is unused
      corrupt_ram: flag(line1[9]),
      under_temp: flag(line1[10]),
      over_temp: flag(line1[11]),

      func_settings: line2[0],
      //line2[1] is unused
      head_up: flag(line2[2]),
      ribbon_out: flag(line2[3]),
      thermal_transfer_mode: flag(line2[4]),
      print_mode: line2[5],
      print_width_mode: line2[6], // No idea what this means
      label_waiting: flag(line2[7]),
      num_labels_remaining_in_batch: line2[8],
      //line2[9] always 1
      num_graphic_imgs_in_memory: line2[10],

      password: line3[0],
      static_ram_installed: flag(line2[1])
    };
    status.is_ready = () => !(status.paper_out || status.ribbon_out || status.head_up || status.paused || status.buffer_full || status.corrupt_ram || status.under_temp || status.over_temp);
    return status;
  }

  function refresh_printer_list() {
    let printer_select = RQ.barcode.byId.printer_select;
    printer_select.replaceChildren();
    RQ.barcode.selectedPrinter = null;
    RQ.barcode.printerList = [];

    let add_printer_option = function (printer) {
      // Upgrade to Zebra.Printer object, which is a superset of BrowserPrint.Device
      let zebra_printer = new Zebra.Printer(printer);
      if (printer.uid == -1) {
        // Since the dry_run_printer doesn't exist, it'll never respond to a configuration query.
        // The Zebra object will poll forever for it if we don't set the configuration ourselves.
        // We only do this for dry_run_printer, because real printers should respond when queried.
        zebra_printer.configuration = new Zebra.Printer.Configuration(printer.fake_configuration);
        // Recklessly clobber our new object to keep our fake send method and things
        Object.keys(printer).forEach(x => zebra_printer[x] = printer[x]);
        console.error('Please disregard a single 500 (Internal Server Error) with localhost. This occurs because the Zebra.Printer() initialization tries to contact the pretend "Dry Run" printer.');
      }

      RQ.barcode.printerList.push(zebra_printer);
      var opt = document.createElement("option");
      opt.text = printer.name;
      opt.value = printer.uid;
      printer_select.add(opt);
      // Select the first printer that's added
      if (!RQ.barcode.selectedPrinter) {
        update_printer_selected();
      }
      return opt;
    };

    //Get the default device from the application as a first step. Discovery takes longer to complete.
    BrowserPrint.getDefaultDevice("printer", function (default_device) {
      //Add device to list of printers and to html select element
      add_printer_option(default_device);
      let selected_uid = default_device.uid;

      //Discover any other devices available to the application
      BrowserPrint.getLocalDevices(function (device_list) {
        device_list.filter(d => d.uid != selected_uid).forEach(add_printer_option);
        add_printer_option(dry_run_printer); //Add a dry run entry last, whether or not any queries failed.
      }, function (e) { notify_user("error", "Unable to get local Zebra printers. Is the Zebra Browser Print service running?" + e); add_printer_option(dry_run_printer); }, "printer");
    }, function (e) { notify_user("error", "No printer found. Is the Zebra Browser Print service running? This is indicated by a Zebra logo icon in your Windows system tray." + e); add_printer_option(dry_run_printer); });
  }

  RQ.barcode.commands = {
    getConfiguration: () => send_receive_command("^XA^HH^XZ"),
    getConfigurationXML: () => send_receive_command("^XA^HZa^XZ"),
    getPrinterStatusCode: () => send_receive_command("~HS"),
    cancelAllPending: () => send_command("~JA"),
    pausePrinting: () => send_command("~PP"),
    resumePrinting: () => send_command("~PS"),
    resetPrinter: () => send_command("~JR"),
    printAllInQueue: feed_printer,
    printNextInQueue: print_next_barcode,
    read: read_from_printer,
    send: send_command,
    sendThenRead: send_receive_command
  }

  function send_receive_command(zpl_command) {
    let printer = RQ.barcode.selectedPrinter;
    if (!printer) return;
    let log_entry;
    if (printer.uid != dry_run_printer.uid) {
      // Send command of dry_run_printer does its own logging
      log_entry = notify_user("info", "Send command: " + zpl_command, "pending");
    }
    printer.send(zpl_command, function (success) {
      log_entry?.classList.remove("pending");
      printer.read(function (response) {
        notify_user("info", response || "No response");
      }, (error) => notify_user("error", error));
    }, (error) => notify_user("error", error));
  }
  function send_command(zpl_command) {
    let printer = RQ.barcode.selectedPrinter;
    if (!printer) return;
    let log_entry;
    if (printer.uid != dry_run_printer.uid) {
      // Send command of dry_run_printer does its own logging
      log_entry = notify_user("info", "Send command: " + zpl_command, "pending");
    }
    printer.send(zpl_command,
      (success) => log_entry?.classList.remove("pending"),
      (error) => notify_user("error", error));
  }
  function read_from_printer() {
    RQ.barcode.selectedPrinter.read(
      (response) => notify_user("info", response),
      (error) => notify_user("error", error));
  }


  function update_printer_selected() {
    let i = RQ.barcode.byId.printer_select.selectedIndex;
    if (i >= 0) {
      RQ.barcode.selectedPrinter = RQ.barcode.printerList[i];
      // Run setup on the new printer
      send_command(RQ.barcode.selectedBarcodeType.setup_command());
    }
  }

  function notify_user(/*optional*/ log_type, message, class_list = "") {
    switch (log_type) {
      case "info": console.log(message); break;
      case "warning": console.warn(message); break;
      case "error": console.error(message); break;
      default: //If only one parameter was provided, treat it as the message and log_type as "info".
        if (!message) {
          message = log_type;
        }
        else {
          console.log('Invalid log_type: ' + log_type);
        }
        log_type = "info";
        console.log(message);
        break;
    }

    let log_list = RQ.barcode.byId.barcode_log;
    if (log_list) {
      // Avoid sending the same message repeatedly
      let log_entry = log_list.firstElementChild;
      if (log_entry.textContent == message) {
        let count = Number(log_entry.dataset.repeatCount) || 1;
        log_entry.dataset.repeatCount = count + 1;
        log_entry.className = class_list + ' logentry ' + log_type;
      }
      else { // Create a new log entry
        log_entry = document.createElement('div');
        log_entry.className = class_list + ' logentry ' + log_type;
        log_entry.textContent = message;
        log_entry.dataset.timestamp = (new Date).toLocaleTimeString();

        // In CSS with log_list style="display: flex; flex-direction: column-reverse;"
        // prepend() looks like append, and scrolling sticks to bottom like you'd want for a log.
        log_list.prepend(log_entry);
      }
      return log_entry;
    }
  }

  /**BarcodePicker monitors clicks, allowing user to select barcode values directly from the UI. When user clicks
   * a barcode value, select_callback is called, passing the barcode value and Asset ItemId.
   * @param {function (code_string)} select_callback when a barcode is selected, the value and associated Asset ItemId 
   * is passed to this function as an object { Barcode: String, ItemId: String }
   */
  let BarcodePicker = function (select_callback) {
    const qs_barcode_input = '.fwformfield[data-datafield="BarCode"] input.fwformfield-value'; /* Editable barcode field on Asset forms */
    const qs_barcode_table = '.field[data-browsedatafield="BarCode"]' /* Header and data cells of barcode column in any table */
    let root = document.getElementById('application');

    /**
     * Call this in a 'click' event handler to prevent other click events from responding.
     * If handling 'mousedown' events, this prevents the element from gaining focus.
    * @param {Event} event the mouse 'click' or 'mousedown' event object
     */
    function mark_event_handled(event) {
      event.stopPropagation();
      event.preventDefault();
    }

    return {
      enabled: false,
      enable: function () {
        this.enabled = true;
        RQ.barcode.byId.barcode_picker_btn.classList.add('picking');
        root.classList.add('barcode-highlights');
        root.addEventListener('click', this.choose_barcodes_in_ui, { capture: true }); // Use capture to come before other event listeners
        root.addEventListener('mousedown', this.choose_barcodes_in_ui); // To prevent clicked fields from gaining focus
      },

      disable: function () {
        this.enabled = false;
        RQ.barcode.byId.barcode_picker_btn.classList.remove('picking');
        root.classList.remove('barcode-highlights');
        root.removeEventListener('click', this.choose_barcodes_in_ui, { capture: true });
        root.removeEventListener('mousedown', this.choose_barcodes_in_ui);
      },

      toggle_enabled: function () {
        this.enabled ? this.disable() : this.enable();
        return this.enabled;
      },

      /**
       * Click event handler that allows user to choose barcode fields to queue up.
       * Overrides any other click handlers when clicking on INPUT elements or table
       * elements that are known to store barcode values.
       * To prevent elements from getting focus during clicks, also register this as
       * a 'mousedown' event, as that is where focus is set. That way, even though no
       * selection is made during 'mousedown', it will get preventDefault() as well.
       * @param {Event} mouse_event the mouse 'click' or 'mousedown' event object
       */
      choose_barcodes_in_ui: function (mouse_event) {
        let click_target = mouse_event.target;

        // It turns out that a disabled input field returns no mouse events if clicked. None at all!
        // But I want to be able to choose a barcode in the UI, even from an input field that's disabled.
        // The workaround is to add an ::after pseudo-element to the input's parent, and then detect
        // the click on the parent itself. The following if-statement detects this scenario, and redefines
        // the click_target to the disabled input element that we were hoping to click in the first place.
        // Note: This depends on pseudo-elements defined in rentalquirks_styles.user.css (see :DisabledClickWorkaround:).
        if (click_target.classList.contains("fwformfield-control") &&
            click_target.parentElement.dataset["datafield"] == "BarCode") {
          click_target = click_target.firstElementChild; //This should be the (disabled) INPUT element
        }
        if (click_target.tagName == "INPUT") {
          click_target = click_target.closest(qs_barcode_input);
          if (!click_target) return;
          // User clicked an editable barcoded text field (or the parent::after of
          // a disabled field (:DisabledClickWorkaround:)), like on Asset forms.

          mark_event_handled(mouse_event);
          if (mouse_event.type == 'mousedown') return; // We only stop event propagation during 'mousedown'

          let code = click_target.value;
          // ItemId, an Asset's unique identifier, is in a hidden field on the Asset form tab
          let tabpage_body = click_target.closest('.fwform-body');
          let item_id = tabpage_body?.querySelector('.fwformfield[data-datafield="ItemId"] input.fwformfield-value')?.value;
          select_callback({ Barcode: code, ItemId: item_id });
          return;
        }
        else {
          click_target = click_target.closest(qs_barcode_table);
          if (!click_target) return;
          // User clicked within a barcode column in a browse table, either on a header element or a cell
          if (mouse_event.target.closest('.fieldcaption > .sort, .fieldcaption > .columnoptions')) {
            return; // Don't handle clicks on a header's sort icon or sort menu
          }

          mark_event_handled(mouse_event);
          if (mouse_event.type == 'mousedown') return; // We only stop event propagation during 'mousedown'

          let table_section = click_target.closest('thead, tbody');
          if (table_section.tagName == "TBODY") {
            // User clicked a data cell in a barcode column
            let code = click_target.textContent;
            // ItemId contains the Asset's unique identifier, and should be in the first (hidden) column of the table
            let item_id = click_target.closest('tr').querySelector('.field[data-browsedatafield="ItemId"]')?.textContent;
            select_callback({ Barcode: code, ItemId: item_id });
            return;
          }
          else {
            // User clicked a barcode column header, which counts as selecting the whole column of values
            let table_elem = table_section.parentElement;
            let get_column = function (column_name) {
              let header = table_elem.querySelector('thead > tr.fieldnames');
              let header_cell = header.querySelector(`td > .field[data-browsedatafield="${column_name}"]`);
              if (!header_cell) return null;
              let column_number = header_cell.parentElement.cellIndex + 1;  //query selector :nth-child() is 1-indexed
              return table_elem.querySelectorAll(`tbody > tr > td:nth-child(${column_number}) div.field`);
            };

            let barcode_cells = get_column('BarCode');
            let item_id_cells = get_column('ItemId');
            for (let i = 0; i < barcode_cells.length; i++) {
              // Some tables don't have an ItemId column. For example, in an Order -> Value Sheet -> Manifest Items -> Detail,
              // or Contract -> Rental Detail. For these tables, we only get the barcode, and ItemId is undefined.
              select_callback({ Barcode: barcode_cells[i].textContent, ItemId: item_id_cells?.[i]?.textContent });
            }
            return;
          }
        }
      },
    };

  };

  /**Attaches all event handlers for Drag and Drop functionality.
   * @param {Element} list_container the 'ul' or 'ol' DOM Element that contains the 'li' list elements
   * @param {function (NodeList)} encode_items encodes (as String) the DOM Elements within the 'li's that are being dragged
   * @param {function (String)} decode_items decodes String representation to DOM Elements that will each go into their own 'li' Element.
   */
  let DragDropList = (() => {

    return function attach_events(list_container, encode_items, decode_items) {
      list_container.rq_encode_list_items = encode_items;
      list_container.rq_decode_list_items = decode_items;
      list_container.rq_is_source = null; // Used to determine if dragging and dropping within the same list
      list_container.rq_is_source_and_dest = false;
      list_container.addEventListener('dragstart', on_drag_start, false);
      list_container.addEventListener('dragover', on_drag_over, false);
      list_container.addEventListener('dragenter', on_drag_enter, false);
      list_container.addEventListener('dragleave', on_drag_leave, false);
      list_container.addEventListener('drop', on_drop, false);
      list_container.addEventListener('dragend', on_drag_end, false);
      list_container.addEventListener('click', on_click, false);
      // In all future calls of event handlers, 'this' refers to list_container
    };

    // https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API/Drag_operations

    function on_drag_start(e) {
      // 'dragstart' only fires once, for the element where the drag was initiated.
      // 'this' is the drag source list, currently under the mouse cursor.
      console.log('on_drag_start ' + this.id);
      this.rq_is_source = true;
      this.rq_is_source_and_dest = false;
      let drag_target = e.target.closest('li');
      if (!drag_target.classList.contains('selected')) {
        // drag_target is not part of previous selection, so clear it
        this.querySelectorAll('.selected').forEach(elem => elem.classList.remove('selected'));
        this.querySelector('.active')?.classList.remove('active');
        drag_target.classList.add('selected');
        drag_target.classList.add('active');
      }
      let selected_items = this.querySelectorAll('li.selected > [draggable]');
      let encoded_string = this.rq_encode_list_items(selected_items);
      console.log(encoded_string);
      e.dataTransfer.setData('text/plain', encoded_string);
      e.dataTransfer.effectAllowed = "copyMove";
    }

    function validate_drag_contents(e) {
      const isText = e.dataTransfer.types.includes('text/plain');
      if (isText) {
        // calling preventDefault() signals that a drop is allowed
        e.preventDefault();
      }
    }
    function loggit(e) { //uncomment for debugging
      // let t = e.target.closest('li');
      // let ti = Array.from(t?.parentElement.children || []).indexOf(t);
      // let f = e.fromElement?.closest('li');
      // let fi = Array.from(f?.parentElement.children || []).indexOf(f);
      // console.log(e.type, e.target.tagName + '[' + ti + ']', e.fromElement?.tagName + '[' + fi + ']');
    }

    function on_drag_enter(e) {
      // 'dragenter' fires whenever the mouse enters the element or any of its descendants.
      // 'this' is the list that is currently under the mouse cursor.

      loggit(e);
      validate_drag_contents(e);
      if (e.ctrlKey) {
        e.dataTransfer.dropEffect = "copy";
      }
      if (e.shiftKey) {
        e.dataTransfer.dropEffect = "move";
      }
      let li_or_list = e.target.closest('li') ?? this;
      // Chrome doesn't activate :hover state when left mouse is down, such as when dragging.
      li_or_list.classList.add('draghover');
    }

    function on_drag_over(e) {
      // 'dragover' fires continuously whenever the mouse is overtop the element or any of its descendants.
      // 'this' is the list that is currently under the mouse cursor.
      validate_drag_contents(e);
      if (e.ctrlKey) {
        e.dataTransfer.dropEffect = "copy";
      }
      if (e.shiftKey) {
        e.dataTransfer.dropEffect = "move";
      }
    }

    function on_drag_leave(e) {
      // 'dragleave' fires whenever the mouse leaves the bounds of the element or any of its descendants.
      // 'dragleave' fires immediately after an associated 'dragenter' event.
      // 'this' is the list that the mouse cursor just left.
      loggit(e);
      // Remove any special styling on the drop target, taking care to not remove styling
      // when moving between a list item and its children, as the drop target is essentially the same.
      if (e.target === this) {
        this.classList.remove('draghover');
      }
      else {
        let entering_li = e.fromElement?.closest('li');
        let leaving_li = e.target.closest('li');
        if (leaving_li !== entering_li) {
          leaving_li?.classList.remove('draghover');
        }
      }
    }

    function on_drop(e) {
      // 'drop' only fires once, and only if the drop action (left mouse button released) occurs 
      // within the bounds of the element or any of its descendants.
      // 'this' is the drop target, the list that the mouse cursor is overtop of.
      console.log('on_drop ' + this.id);
      this.rq_is_source_and_dest = this.rq_is_source;
      let drop_target = e.target.closest('li');
      // Clear 'active' list item; we'll choose a new one later in the function
      this.querySelector('.active')?.classList.remove('active');
      // Use a DocumentFragment to insert many childitems in one operation
      let fragment = document.createDocumentFragment();
      // Check if we are dragging and dropping within the same list
      if (this.rq_is_source_and_dest) {
        // In which case, we should move items within the list, not delete and recreate them.
        // We want to insert the dropped items immediately above drop_target, but that doesn't
        // work if drop_target is a selected item, because all selected items are being moved.
        // Set drop_target to be the next item in the list that is not selected.
        while (drop_target?.classList.contains('selected')) {
          drop_target = drop_target.nextElementSibling;
        }
        fragment.replaceChildren(...this.querySelectorAll('li.selected'));
        // No need to change 'selected' list items in this case.
      }
      else {
        // Must cleanup .draghover here because 'dragend' will not necessarily be called because this isn't source
        RQ.barcode.byId.rq_barcode.querySelector('.draghover')?.classList.remove('draghover');

        const encoded_text = e.dataTransfer.getData("text/plain");

        let new_lis = this.rq_decode_list_items(encoded_text).map(item => {
          let li = document.createElement('li');
          li.classList.add('selected'); // All dropped items should be selected
          li.appendChild(item);
          return li;
        });
        // Deselect all previously selected  list items
        this.querySelectorAll('.selected').forEach(elem => elem.classList.remove('selected'));
        fragment.replaceChildren(...new_lis);
      }
      // Somewhat arbitrarily, we will choose the first dropped item as the active item in the list.
      fragment.firstElementChild?.classList.add('active');
      // if drop_target is null, elems is inserted at the end of the list
      this.insertBefore(fragment, drop_target);
      update_queue_count();
      e.preventDefault();
    }

    function on_drag_end(e) {
      // 'dragend' only fires once, and signals the end of the drag-drop operation. 
      // If 'drop' is handled by an element under the mouse cursor, 'dragend' fires immediately after.
      // 'this' is the drag source list, the same as was in 'dragstart'.
      console.log('on_drag_end ' + e.dataTransfer.dropEffect + ' ' + this.id);

      RQ.barcode.byId.rq_barcode.querySelector('.draghover')?.classList.remove('draghover');
      let de = e.dataTransfer.dropEffect;
      if (de == "move") {
        // If we are moving items within the same list, do not delete them
        if (!this.rq_is_source_and_dest) {
          // Otherwise, if a move command has succeeded, delete the items that were moved.
          this.querySelectorAll('li.selected').forEach(x => x.remove());
          update_queue_count();
        }
      }
      // Reset flags in preparation for next drag and drop operation
      this.rq_is_source = false;
      this.rq_is_source_and_dest = false;
      if (de == "none" || de == "copy") { //drag was cancelled
        return;
      }
    }

    function on_click(e) {
      console.log('on_click ' + this.id);
      let clicked_item = e.target.closest("li");
      if (clicked_item) {
        let active_item = this.querySelector('.active');
        if (active_item && e.shiftKey) { // Select all items inclusive and between active_item and clicked_item
          let cur_item = undefined;
          let stop_item = undefined;
          // Figure out which element comes first in the list
          for (cur_item = this.firstElementChild; cur_item; cur_item = cur_item.nextElementSibling) {
            if (cur_item == active_item) {
              stop_item = clicked_item;
              break;
            }
            else if (cur_item == clicked_item) {
              stop_item = active_item;
              break;
            }
          }

          if (stop_item) {
            // select all items until (and including) stop_item
            for (; cur_item; cur_item = cur_item.nextElementSibling) {
              cur_item.classList.add('selected');
              if (cur_item == stop_item) {
                break;
              }
            }
          }
        }
        else if (e.ctrlKey) {
          clicked_item.classList.toggle('selected');
        }
        else {
          this.querySelectorAll('.selected')
            .forEach(item => item.classList.remove('selected'));
          clicked_item.classList.toggle('selected');
        }
        // There is only ever one active item and it is the one that was clicked last, except for shift+click.
        if (!e.shiftKey) {
          active_item?.classList.remove('active');
          clicked_item.classList.add('active');
        }
      }
      else { // Clicked within the list element, but did not click on any particular item. Clear selection.
        this.querySelectorAll('.selected')
          .forEach(item => item.classList.remove('selected'));
      }
    }
  })();

})(window.RentalQuirks);

/*

https://stackoverflow.com/questions/9422974/createelement-with-id
https://stackoverflow.com/a/23899918/1392830

function createElement(element, attribute, inner) {
  if (typeof(element) === "undefined") {
    return false;
  }
  if (typeof(inner) === "undefined") {
    inner = "";
  }
  var el = document.createElement(element);
  if (typeof(attribute) === 'object') {
    for (var key in attribute) {
      el.setAttribute(key, attribute[key]);
    }
  }
  if (!Array.isArray(inner)) {
    inner = [inner];
  }
  for (var k = 0; k < inner.length; k++) {
    if (inner[k].tagName) {
      el.appendChild(inner[k]);
    } else {
      el.appendChild(document.createTextNode(inner[k]));
    }
  }
  return el;
}

*/