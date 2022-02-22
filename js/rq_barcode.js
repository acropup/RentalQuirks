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
  //Provide a dummy printer entry so that people can practice with the UI without sending prints by accident.
  const dry_run_printer = {
    name: "Dry run - print disabled",
    uid: -1,
    send: (zpl_command) => notify_user("info", "Pretend send: " + zpl_command),
    read: () => notify_user("info", "Pretend read.")
  };
  RQ.barcode.barcodeTypes = [
    {
      name: "Small",
      description: "0.5in x 1.0in",
      validate: (code) => { return /^\d{5}$/.test(code); }, //TODO: validation should be for 6 digits, but it's currently 5 for debugging purposes
      setup_command: () => "", //TODO: Fill this out
      print_command: (code, quantity = 1) => `^XA^XFE:BWL1IN.GRF^FN1^FD${code}^FS^PQ${quantity}^XZ`
    },
    {
      name: "Large",
      description: "1.0in x 2.0in",
      validate: (code) => { return /^\d{6}$/.test(code); },
      setup_command: () => "^XA^SS,,,214^PW430~TA-012^LT12^LS12^LH0,0~JSN^MNW^MTT^MMT^PON^PMN^JMA^PR2,2~SD15^JUS^LRN^CI28^XZ",
      print_command: (code, quantity = 1) => `^XA
      ^FT24,48^A0,36,36^FB358,1,0,C^FDBetter Way Lighting\\&^FS
      ^FT67,146^BY4,3,80^BCN,,N,N^FD>;${code}^FS
      ^FT24,182^FP,2^FB358,1,,C^AS^FD${code}\\&^FS
      ^PQ${quantity}
      ^XZ`
    }
  ];

  //TODO: Remove this after debugging. This opens barcode utility automatically when page loads.
  RQ.runOnAppLoad.push(init);

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
    btn.addEventListener('click', init);
    return btn;
  }

  function init() {
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
  <div class="fwpopupbox fwconfirmationbox rq-draggable">
  <div class="popuptitle rq-draghandle">Barcode Print Utility</div>
  <div class="close-modal"><i class="material-icons"></i>
    <div class="btn-text">Close</div>
  </div>
  <div class="flexpage">
    <div class="flexrow">
      <div class="flexcolumn">
        <div class="fwcontrol fwcontainer fwform-section" data-control="FwContainer">
          <div id="barcode-picker-btn" class="fwformcontrol" data-type="button">Picker</div>
          <div class="fwform-section-title">Print Queue</div>
          <div class="fwform-section-body" style="display: flex; flex-direction: row; gap: 5px;">
            <div style="flex-direction: column;">
              <div class="fwformfield" data-type="text"><div class="fwformfield-control">
              <input id="text-entry" type="text" class="fwformfield-value" autocomplete="off" list="autocompleteOff"></div></div>
              <ul id="barcode-queue"></ul>
              <div id="print-one-btn" class="fwformcontrol" data-type="button" title="[Ctrl+Click] to print just one copy while leaving the barcode in the queue.">Print Next</div>
              <div id="print-all-btn" class="fwformcontrol" data-type="button">Print All</div>
            </div>
            <div style="display: flex; flex-direction: column; gap: 6px; width: 4em;">
              <div id="queue-btn" class="fwformcontrol" data-type="button" title="[Enter]&#009; Add to queue&#013;[Ctrl+Enter] Print immediately">Add</div>
              <div style="letter-spacing: 0.8px;font-size: 10px; text-transform: uppercase; text-align: center; padding-top: 0.5em; border-top: 1px #e0e0e0 solid;">Activate / Deactivate Barcodes</div>
              <div id="activate-btn" class="fwformcontrol" data-type="button" title="Activate Barcodes"></div>
              <div id="deactivate-btn" class="fwformcontrol" data-type="button" title="Deactivate Barcodes"></div>
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
            <div>To do: Halt printing, stop on invalid code</div>
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
    byId[barcode_ui.id.replaceAll('-', '_')] = barcode_ui;
    Array.from(document.querySelectorAll('#rq-barcode [id]')).forEach(elem => byId[elem.id.replaceAll('-', '_')] = elem);

    let close_btn = barcode_ui.querySelector('.close-modal');
    close_btn.addEventListener('click', () => barcode_ui.classList.toggle('hidden'));
    byId.text_entry.addEventListener('keydown', text_entry_keydown);
    byId.queue_btn.addEventListener('click', click_queue_btn);
    byId.print_one_btn.addEventListener('click', (e) => print_next_barcode(undefined, e.ctrlKey));
    byId.print_all_btn.addEventListener('click', (e) => print_all_barcodes());
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

    add_radio_change_event("print-copies", (e) => {
      RQ.barcode.selectedPrintCopies = e.target.value;
    });
    // Set default print copies
    RQ.barcode.selectedPrintCopies = barcode_ui.querySelector('input[type="radio"][name="print-copies"]:checked').value;

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

  function update_queue_count() {
    let barcode_button = document.querySelector('.app-usercontrols > .barcodebutton');
    barcode_button.dataset.queueCount = RQ.barcode.byId.barcode_queue.childElementCount;
  }

  function click_queue_btn() {
    let textbox = RQ.barcode.byId.text_entry;
    let next_barcode = textbox.value;
    // If a barcode is submitted manually, we don't have immediate access to the ItemId
    queue_barcode({ Barcode: next_barcode, ItemId: undefined });
    textbox.value = "";
    textbox.focus();
  }

  /**Within text_entry field, Enter key submits value to queue, 
   * and Ctrl+Enter prints value immediately.
   * @param {KeyboardEvent} e 
   */
  function text_entry_keydown(e) {
    if (e.key == 'Enter') {
      if (e.ctrlKey) {
        print_next_barcode(e.target.value);
        e.target.value = "";
        e.target.focus();
      }
      else {
        click_queue_btn();
      }
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
      if (RQ.barcode.selectedPrinter != dry_run_printer) {
        let cmd_string = barcode_type.print_command(next_barcode, print_copies);
        send_command(cmd_string);
      }
      if (!print_one_copy) {
        next_item?.remove();
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

  function print_all_barcodes() {
    ///////////////////////////////////////////////////////
  }

  function refresh_printer_list() {
    let printer_select = RQ.barcode.byId.printer_select;
    printer_select.replaceChildren();
    RQ.barcode.selectedPrinter = null;
    RQ.barcode.printerList = [];

    let add_printer_option = function (printer) {
      RQ.barcode.printerList.push(printer);
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
  };
  RQ.barcode.commands = {
    getConfiguration: () => send_receive_command("^XA^HH^XZ"),
    getPrinterStatusCode: () => send_receive_command("~HS"),
    resetPrinter: () => send_command("~JR"),
    read: () => read_from_printer(),
    send: send_command,
    sendThenRead: send_receive_command,
  }

  function send_receive_command(zpl_command) {
    let printer = RQ.barcode.selectedPrinter;
    if (!printer) return;
    let log_entry;
    if (printer != dry_run_printer) {
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
    if (printer != dry_run_printer) {
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
      let log_entry = document.createElement('div');
      log_entry.className = class_list + ' logentry ' + log_type;
      log_entry.textContent = message;
      log_entry.dataset.timestamp = (new Date).toLocaleTimeString();

      // In CSS with log_list style="display: flex; flex-direction: column-reverse;"
      // prepend() looks like append, and scrolling sticks to bottom like you'd want for a log.
      log_list.prepend(log_entry);
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
        if (click_target.tagName == "INPUT") {
          click_target = click_target.closest(qs_barcode_input);
          if (!click_target) return;
          // User clicked an editable barcoded text field, like on Asset forms

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
              let header_cell = header.querySelector(`td > .field[data-browsedatafield="${column_name}"]`)
              let column_number = header_cell.parentElement.cellIndex + 1;  //query selector :nth-child() is 1-indexed
              return table_elem.querySelectorAll(`tbody > tr > td:nth-child(${column_number}) div.field`);
            };

            let barcode_cells = get_column('BarCode');
            let item_id_cells = get_column('ItemId');
            for (let i = 0; i < barcode_cells.length; i++) {
              select_callback({ Barcode: barcode_cells[i].textContent, ItemId: item_id_cells[i]?.textContent });
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
    function loggit(e) {
      let t = e.target.closest('li');
      let ti = Array.from(t?.parentElement.children || []).indexOf(t);
      let f = e.fromElement?.closest('li');
      let fi = Array.from(f?.parentElement.children || []).indexOf(f);
      console.log(e.type, e.target.tagName + '[' + ti + ']', e.fromElement?.tagName + '[' + fi + ']');
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