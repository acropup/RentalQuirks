(function (RQ) {
  'use strict';

  RQ.runOnPage.push({
    testPath: (path) => !!path.match(/Reports\//),
    runScript: add_consolidate_button
  });

  // The request to consolidate rows on reports was made for Deal Reports - Deal Outstanding Items,
  // but it will likely apply to a number of reports that itemize items by barcode, when all we want
  // is an itemization by icode.

  function add_consolidate_button() {
    //TODO: Should wait until the report is generated before I can add anything
    let page = document.getElementById('pageContainer');

    let consolidateBtn = document.createElement('div');
    consolidateBtn.className = 'btn rquirks report-preview noprint';
    consolidateBtn.title = 'Consolidate Lines';
    consolidateBtn.innerHTML = 'Consolidate Lines';
    page.insertBefore(consolidateBtn, page.firstChild);
    consolidateBtn.addEventListener('click', () => {
      let first_detail_rows = document.querySelectorAll('tr:not([data-row="detail"]) + tr[data-row="detail"]');
      [...first_detail_rows].forEach(consolidate_rows);
      setTimeout(() => {
        alert('Done! If the rows did not consolidate, make sure that you have no columns present whose values differ between rows. If there are, you should customize your report layout to delete those columns.');
      }, 200);
    });
    return true;
  }

  function compare_rows(tr_a, tr_b) {
    let num_cells = tr_a.childElementCount;
    if (num_cells != tr_b.childElementCount) return false;
    let row_a = tr_a.children;
    let row_b = tr_b.children;
    //Compare each column of rows a and b
    for (let i = 0; i < num_cells; i++) {
      let data_a = row_a[i].dataset;
      let data_b = row_b[i].dataset;
      // Column name must match
      if (data_a.linkedcolumn != data_b.linkedcolumn) return false;
      // Rows still match even if Quantities differ
      if (data_a.linkedcolumn == "Quantity") continue;
      if (data_a.hasOwnProperty('value')) {
        if (data_a.value != data_b.value) {
          return false;
        }
      }
      // If there's no value property, the value is probably within the text of the element
      else if (row_a[i].innerText != row_b[i].innerText) {
        return false;
      }
    }
    // All cells matched!
    return true;
  }

  function consolidate_rows(first_row) {
    if (first_row?.dataset.row != "detail") return;

    let qty_index = [...first_row.children].findIndex(cell => cell.dataset.linkedcolumn == 'Quantity');
    let qty_total = Number(first_row.children[qty_index].dataset.value);
    let rows_matched = 0;
    while (true) {
      let next = first_row.nextElementSibling;
      if (next?.dataset.row != "detail") {
        break; // No more data rows in this section
      }
      if (compare_rows(first_row, next)) {
        rows_matched++;
        qty_total += Number(next.children[qty_index].dataset.value);
        // Remove this row from the DOM
        next.remove();
      }
      else {
        break;
      }
    }
    if (rows_matched) {
      // We reached a row that doesn't match; update the first row with the quantity summed from all matching rows
      first_row.children[qty_index].dataset.value = qty_total;
    }
    // Continue consolidating subsequent rows until we're through all the "detail" rows
    return consolidate_rows(first_row.nextElementSibling);
  }
})(window.RentalQuirks);