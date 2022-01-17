(function (RQ) {
  'use strict';
  RQ.barcode = {};
  RQ.barcode.addBarcodeButton = addBarcodeButton;

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
  if (RQ.barcode.ui) return;
  let el = document.createElement('div');
  el.className = 'fwpopup fwconfirmation';
  el.id = "rq-barcode";
  el.innerHTML = `
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
            <div class="fwformcontrol" data-type="button"
              style="padding: unset; margin: 0 5px; height: 2.2em; min-width: 2.2em; float: right; margin-top: 20px;">
              <span class="material-icons" style="transform: translateY(4px) rotate(45deg);">autorenew</span>
            </div>
            <div data-control="FwFormField" data-type="text" class="fwcontrol fwformfield"
              style="width: calc(100% - 2em);">
              <div class="fwformfield-caption">Printer</div>
              <div class="fwformfield-control">
                <select class="fwformfield-value">
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
  app_elem.appendChild(el);

  WindowDragger();
}


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