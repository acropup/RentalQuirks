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
  RQ.barcode.deviceList = [];
  RQ.barcode.selectedDevice;
  //Provide a dummy printer entry so that people can practice with the UI without sending prints by accident.
  const dry_run_device = { name: "Dry run - print disabled", uid: -1 };
  RQ.barcode.barcodeTypes = [
    {
      name: "Small",
      description: "0.5in x 1.0in",
      validate: (code) => { return /^\d{6}$/.test(code); },
      command: (code, quantity = 1) => `^XA^XFE:BWL1IN.GRF^FN1^FD${code}^FS^PQ,,${quantity},Y^XZ`
    },
    {
      name: "Large",
      description: "1.0in x 2.0in",
      validate: (code) => { return /^\d{6}$/.test(code); },
      command: (code, quantity = 1) => `^XA^XFE:BWL2IN.GRF^FN1^FD${code}^FS^PQ,,${quantity},Y^XZ`
    }
  ];


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
            <div class="fwform-section-body"><div id="queue-btn" class="fwformcontrol" data-type="button" style="display: inline-flex; flex-wrap: wrap; align-content: center; height: 2.2em; margin: -1px 0 0 5px; float: right;">Add</div>
            <div class="fwformfield" data-type="text"><div class="fwformfield-control">
              <input id="text-entry" type="text" class="fwformfield-value">
            </div></div>
            <ul id="barcode-queue">
            </ul>
            <div id="print-btn" class="fwformcontrol" data-type="button">Print Next</div>
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
            <div>To do: Halt printing, drag drop, select, delete, stop on invalid code</div>
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
    // Populate byId with references to all DOM elements that have an ID.
    Array.from(document.querySelectorAll('#rq-barcode [id]')).forEach(elem => byId[elem.id.replaceAll('-', '_')] = elem);

    let close_btn = barcode_ui.querySelector('.close-modal');

    close_btn.addEventListener('click', () => barcode_ui.classList.toggle('hidden'));
    byId.text_entry.addEventListener('keydown', text_entry_keydown);
    byId.queue_btn.addEventListener('click', click_queue_btn);
    byId.print_btn.addEventListener('click', (e) => print_next_barcode());
    byId.printer_select.addEventListener('change', update_device_selected);
    byId.printer_refresh_btn.addEventListener('click', refresh_device_list);
    let barcode_selector = BarcodePicker(queue_barcode);
    byId.barcode_picker_btn.addEventListener('click', () => barcode_selector.toggle_enabled());
    refresh_device_list();

  }

  function queue_barcode(barcode_info) {
    let new_item = document.createElement('li');
    let inner_div = document.createElement('div');
    inner_div.setAttribute('draggable', 'true');
    inner_div.textContent = barcode_info.Barcode;
    if (barcode_info.ItemId) {
      inner_div.dataset.itemid = barcode_info.ItemId;
    }
    new_item.appendChild(inner_div);
    RQ.barcode.byId.barcode_queue.prepend(new_item);
    let barcode_button = document.querySelector('.app-usercontrols > .barcodebutton');
    barcode_button.dataset.queueCount = RQ.barcode.byId.barcode_queue.childElementCount;

  }

  function click_queue_btn() {
    let textbox = RQ.barcode.byId.text_entry;
    let next_barcode = textbox.value;
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
   * prints and removes the next barcode in the queue.
   * @param {String} next_barcode the next barcode to print, or undefined
   * @returns true if print succeeds, false if print failed or if barcode was invalid
   */
  function print_next_barcode(next_barcode = undefined) {
    let next_item;
    if (!next_barcode) {
      next_item = RQ.barcode.byId.barcode_queue.lastElementChild;
      next_barcode = next_item?.textContent;
    }

    let print_copies = Array.from(document.getElementsByName('print-copies')).filter(x => x.checked)[0].value;
    let type_index = Array.from(document.getElementsByName('barcode-type')).filter(x => x.checked)[0].value;
    let barcode_type = RQ.barcode.barcodeTypes[type_index];
    if (barcode_type.validate(next_barcode)) {
      notify_user(`Printing ${print_copies} of ${next_barcode} in style ${barcode_type.name}`);
      if (RQ.barcode.selectedDevice != dry_run_device) {
        let cmd_string = barcode_type.command(next_barcode, print_copies);
        send_receive_command(cmd_string);
      }
      next_item?.remove();
      return true;
    }
    else {
      notify_user('error', `Value ${next_barcode} is invalid for ${barcode_type.name} barcodes.`);
      return false;
    }
  }

  function refresh_device_list() {
    let printer_select = RQ.barcode.byId.printer_select;
    printer_select.replaceChildren();
    RQ.barcode.selectedDevice = null;
    RQ.barcode.deviceList = [];

    let add_device_option = function (device) {
      RQ.barcode.deviceList.push(device);
      var opt = document.createElement("option");
      opt.text = device.name;
      opt.value = device.uid;
      printer_select.add(opt);
      return opt;
    };

    //Get the default device from the application as a first step. Discovery takes longer to complete.
    BrowserPrint.getDefaultDevice("printer", function (default_device) {
      //Add device to list of devices and to html select element
      add_device_option(default_device);
      RQ.barcode.selectedDevice = default_device;
      let selected_uid = default_device.uid;

      //Discover any other devices available to the application
      BrowserPrint.getLocalDevices(function (device_list) {
        device_list.filter(d => d.uid != selected_uid).forEach(add_device_option);
        add_device_option(dry_run_device); //Add a dry run entry last, whether or not any queries failed.
      }, function (e) { add_device_option(dry_run_device); notify_user("error", "Unable to get local devices. Is the Zebra Browser Print service running?" + e); }, "printer");
    }, function (e) { add_device_option(dry_run_device); notify_user("error", "Unable to get default device. Is the Zebra Browser Print service running? This is indicated by a Zebra logo icon in your Windows system tray." + e); });
  };
  RQ.barcode.commands = {
    getConfiguration: () => send_receive_command("^XA^HH^XZ"),
    read: () => read_from_printer(),
    send: send_command,
    send_then_read: send_receive_command
  }
  
  function send_receive_command(zpl_command) {
    notify_user("info", "Send command: " + zpl_command);
    let dev = RQ.barcode.selectedDevice;
    dev.send(zpl_command, function (success) {
      notify_user("info", "Command succeeded");
      dev.read(function (response) {
        response ||= "No response";
        notify_user("info", response);
      }, (error) => notify_user("error", error));
    }, (error) => notify_user("error", error));
  }
  function send_command(zpl_command) {
    notify_user("info", "Send command: " + zpl_command);
    RQ.barcode.selectedDevice.send(zpl_command,
      (success) => notify_user("info", "Command succeeded"),
      (error) => notify_user("error", error));
  }
  function read_from_printer() {
    RQ.barcode.selectedDevice.read(
      (response) => notify_user("info", response),
      (error) => notify_user("error", error));
  }


  function update_device_selected() {
    let i = RQ.barcode.byId.printer_select.selectedIndex;
    if (i > 0) {
      RQ.barcode.selectedDevice = RQ.barcode.deviceList[i];
    }
  }

  function notify_user(/*optional*/ log_type, message) {
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
      log_entry.className = 'logentry ' + log_type;
      log_entry.textContent = message;
      log_entry.dataset.timestamp = (new Date).toLocaleTimeString();
      log_list.prepend(log_entry);
    }
  }
  
  /**
   * BarcodePicker monitors clicks, allowing user to select barcode values directly from the UI. When user clicks
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


  //TODO: WindowDragger doesn't belong here. Maybe put it in rq_common.
  let WindowDragger = function (container) {
    if (!container) {
      container = document.body;
    }
    container.addEventListener("mousedown", on_drag_start, false);
    container.addEventListener("mouseup", on_drag_end, false);
    container.addEventListener("mousemove", on_drag, false);

    let drag_item = null;
    let currentX, currentY;
    let initialX, initialY;
    let offsetX = 0, offsetY = 0;

    function on_drag_start(e) {
      initialX = e.clientX - offsetX;
      initialY = e.clientY - offsetY;
      if (e.target.classList.contains('rq-draghandle')) {
        drag_item = e.target.closest('.rq-draggable');
      }
    }
    function on_drag(e) {
      if (drag_item) {
        e.preventDefault();
        currentX = e.clientX - initialX;
        currentY = e.clientY - initialY;
        offsetX = currentX;
        offsetY = currentY;
        //https://www.kirupa.com/html5/drag.htm
        drag_item.style.transform = "translate3d(" + currentX + "px, " + currentY + "px, 0)";
      }
    }
    function on_drag_end(e) {
      //TODO: https://stackoverflow.com/questions/442404/retrieve-the-position-x-y-of-an-html-element
      //      If dragged out of bounds, snap to an edge.
      initialX = currentX;
      initialY = currentY;
      drag_item = null;
    }
  };



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