/* This code depends on the Zebra Browser Print library. Files to include are:
   - BrowserPrint-3.0.216.min.js
   - BrowserPrint-Zebra-1.0.216.min.js
   Global variables created from these files:
   - window.BrowserPrint
   - window.Zebra
   Note that both RentalWorks code (ex. script1-2019.1.2.206.js) and the Zebra Browser Print library use
   Closure Compiler, which creates the global window.$jscomp variable. I don't know if there's any risk 
   of one file clobbering the other, but that's something to keep in mind.
*/
(function (RQ) {
  'use strict';
  RQ.barcode = {};
  RQ.barcode.addBarcodeButton = addBarcodeButton;
  RQ.barcode.deviceList = [];
  RQ.barcode.selectedDevice;

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

function init () {
  if (RQ.barcode.ui) {
    RQ.barcode.ui.classList.toggle('hidden');
    return;
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
          <div class="fwform-section-title">Print Queue</div>
          <div class="fwform-section-body">
            <div class="fwformcontrol" data-type="button" style="flex: 0 0 150px;">Add Items</div>
          </div>
        </div>
      </div>
      <div class="flexcolumn">
        <div class="fwcontrol fwcontainer fwform-section" data-control="FwContainer">
          <div class="fwform-section-title">Configuration</div>
          <div class="fwform-section-body">
            <div class="fwformcontrol" data-type="button" id="printer-refresh"
              style="padding: unset; margin: 0 5px; height: 2.2em; min-width: 2.2em; float: right; margin-top: 20px;">
              <span class="material-icons" style="transform: translateY(4px) rotate(45deg);">autorenew</span>
            </div>
            <div data-control="FwFormField" data-type="text" class="fwcontrol fwformfield"
              style="width: calc(100% - 2em);">
              <div class="fwformfield-caption">Printer</div>
              <div class="fwformfield-control">
                <select class="fwformfield-value" id="printer-select">
                  <option value="">--None found--</option>
                  <option value="">--Achilles--</option>
                </select>
              </div>
            </div>

            <div data-control="FwFormField" data-type="togglebuttons" class="fwcontrol fwformfield"
              style="flex: 0 1 250px;">
              <div class="fwformfield-caption">Barcode Type</div>
              <div class="fwformfield-control">
                <label class="togglebutton-item">
                  <input type="radio" class="fwformfield-value" name="barcode-type" value="1">
                  <span class="togglebutton-button">Small</span>
                </label>
                <label class="togglebutton-item">
                  <input type="radio" class="fwformfield-value" name="barcode-type" value="2" checked="true">
                  <span class="togglebutton-button">Large</span>
                </label>
              </div>
            </div>

            <div data-control="FwFormField" data-type="togglebuttons" class="fwcontrol fwformfield"
              style="flex: 0 1 250px;">
              <div class="fwformfield-caption">Print Copies</div>
              <div class="fwformfield-control">
                <label class="togglebutton-item">
                  <input type="radio" class="fwformfield-value" name="print-copies" value="1">
                  <span class="togglebutton-button">1</span>
                </label>
                <label class="togglebutton-item">
                  <input type="radio" class="fwformfield-value" name="print-copies" value="2">
                  <span class="togglebutton-button">2</span>
                </label>
                <label class="togglebutton-item">
                  <input type="radio" class="fwformfield-value" name="print-copies" value="3" checked="true">
                  <span class="togglebutton-button">3</span>
                </label>
                <label class="togglebutton-item">
                  <input type="radio" class="fwformfield-value" name="print-copies" value="4">
                  <span class="togglebutton-button">4</span>
                </label>
                <label class="togglebutton-item">
                  <input type="radio" class="fwformfield-value" name="print-copies" value="5">
                  <span class="togglebutton-button">5</span>
                </label>
              </div>
            </div>
          </div>
        </div>
        <div class="fwcontrol fwcontainer fwform-section" data-control="FwContainer">
          <div class="fwform-section-title">Logging</div>
          <div class="fwform-section-body">
            <span class="logitem">This is a hardcoded message. Please Disregard.</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>`;


  let app_elem = document.getElementById('application');
  app_elem.appendChild(barcode_ui);
  let close_btn = barcode_ui.querySelector('.close-modal');
  close_btn.addEventListener('click', () => barcode_ui.classList.toggle('hidden'));
  let refresh_btn = barcode_ui.querySelector('#printer-refresh');
  refresh_btn.addEventListener('click', refresh_device_list);
  refresh_device_list();

  RQ.barcode.ui = barcode_ui;
  WindowDragger();
}


function refresh_device_list () {
  let select_container = document.querySelector("#rq-barcode #printer-select");
  select_container.replaceChildren();
  let add_device_option = function (device) {
      RQ.barcode.selectedDevice = device;
      RQ.barcode.deviceList.push(device);
      var opt = document.createElement("option");
      opt.text = device.name;
      opt.value = device.uid;
      select_container.add(opt);
      return opt;
  };
  //Get the default device from the application as a first step. Discovery takes longer to complete.
  BrowserPrint.getDefaultDevice("printer", function(default_device) {
      //Add device to list of devices and to html select element
      add_device_option(default_device);
      RQ.barcode.selectedDevice = default_device;
      let selected_uid = default_device.uid;

      //Discover any other devices available to the application
      BrowserPrint.getLocalDevices(function(device_list) {
          device_list.filter(d => d.uid != selected_uid).forEach(add_device_option);
      }, function(){notifyUser("Error getting local devices")},"printer");
  }, function(error) { notifyUser(error); });
};


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

  function on_drag_start (e) {
    initialX = e.clientX - offsetX;
    initialY = e.clientY - offsetY;
    if (e.target.classList.contains('rq-draghandle')) {
      drag_item = e.target.closest('.rq-draggable');
    }
  }
  function on_drag (e) {
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
  function on_drag_end (e) {
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