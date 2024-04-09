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
      //Find all first detail rows (ones that are not immediately preceded by detail rows)
      let first_detail_rows = document.querySelectorAll('tr:not([data-row="detail"]) + tr[data-row="detail"]');
      [...first_detail_rows].forEach(consolidate_rows_unsorted);
      setTimeout(() => {
        alert('Done! If the rows did not consolidate, make sure that you have no columns present whose values differ between rows. If there are, you should customize your report layout to delete those columns.');
      }, 200);
    });
    return true;
  }

  /**
   * Compare the text content of two table rows, ignoring the Quantity field.
   * @param {Element} tr_a first table row element to compare
   * @param {Element} tr_b second table row element to compare
   * @returns true if both rows are identical, Quantity column ignored.
   */
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

  /**
   * @param {Element} tr_a a <tr> table row element
   * @returns A string representation of the row, used for matching identical rows. Does not include row Quantity.
   */
  function row_as_string(tr_a) {
    let num_cells = tr_a.childElementCount;
    let row_a = tr_a.children;
    let result_string = "";
    //Convert each cell to text
    for (let i = 0; i < num_cells; i++) {
      let data_a = row_a[i].dataset;
      // Exclude the quantity column from the string output
      if (data_a.linkedcolumn == "Quantity") continue;
      if (data_a.hasOwnProperty('value')) {
        result_string += data_a.value + "🕯"; // Candle emoji as field delimeter
      }
      // If there's no value property, the value is probably within the text of the element
      else {
        result_string += row_a[i].innerText + "🕯";
      }
    }
    return result_string;
  }
  
  /**
   * Compares all consecutive detail rows, starting from first_row, and identical rows
   * are replaced with a single row, with a quantity totaling that of the individual rows.
   * Rows are compared against all other rows, so the table need not be sorted.
   * @param {Element} first_row the first tr element with data-row="detail" to start consolidating from
   */
  function consolidate_rows_unsorted(first_row) {
    const qty_index = [...first_row.children].findIndex(cell => cell.dataset.linkedcolumn == 'Quantity');
    const unique_rows = new Map();
    let next_row = first_row;
    // Iterate through all data rows in this section
    while (next_row?.dataset.row == "detail") {
      let row_key = row_as_string(next_row);
      let existing_row = unique_rows.get(row_key);
      if (existing_row) {
        // Add this row's quantity to the previous matching row's quantity
        let qty = Number(existing_row.children[qty_index].dataset.value);
        qty += Number(next_row.children[qty_index].dataset.value);
        existing_row.children[qty_index].dataset.value = qty;
        // Remove this row from the DOM
        let merged_row = next_row;
        next_row = next_row.nextElementSibling;
        merged_row.remove();
      }
      else {
        // Add to list of unique rows
        unique_rows.set(row_key, next_row);
        next_row = next_row.nextElementSibling;
      }

    }
  }

  /**
   * Compares all consecutive detail rows, starting from first_row, and identical rows
   * are replaced with a single row, with a quantity totaling that of the individual rows.
   * Only identical rows that are adjacent rows will be combined, so the table should be sorted first.
   * @param {Element} first_row the first tr element with data-row="detail" to start consolidating from
   */
  function consolidate_rows_sorted(first_row) {
    if (first_row?.dataset.row != "detail") return;

    const qty_index = [...first_row.children].findIndex(cell => cell.dataset.linkedcolumn == 'Quantity');
    const qty_total = Number(first_row.children[qty_index].dataset.value);
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
    return consolidate_rows_sorted(first_row.nextElementSibling);
  }
})(window.RentalQuirks);