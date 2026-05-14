/**
 * Utils.gs — Common helpers (FOUNDATION)
 *
 * Sheet helpers, date math, ID generation.
 * All datetime operations use Asia/Bangkok timezone.
 */

const TIMEZONE = 'Asia/Bangkok';

/* ============================================================
 * Sheet access
 * ============================================================ */

function getPublicSheet_() {
  const id = getProperty_('PUBLIC_SHEET_ID');
  if (!id) throw new Error('public_sheet_id_not_configured');
  return SpreadsheetApp.openById(id);
}

function getSecretSheet_() {
  const id = getProperty_('SECRET_SHEET_ID');
  if (!id) return null; // secret sheet is optional per project
  return SpreadsheetApp.openById(id);
}

/**
 * Read a tab as array of plain objects keyed by header.
 */
function readTab_(spreadsheet, tabName) {
  const sheet = spreadsheet.getSheetByName(tabName);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  const headers = data[0].map(h => String(h));
  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = data[i][idx];
    });
    rows.push(obj);
  }
  return rows;
}

/**
 * Append rows (array of objects) to a tab, auto-mapping keys to columns.
 */
function appendRows_(spreadsheet, tabName, rows) {
  if (!rows || rows.length === 0) return;
  const sheet = spreadsheet.getSheetByName(tabName);
  if (!sheet) throw new Error('tab_not_found: ' + tabName);

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    .map(h => String(h));

  const values = rows.map(row => headers.map(h => {
    const v = row[h];
    return (v === undefined || v === null) ? '' : v;
  }));

  sheet.getRange(sheet.getLastRow() + 1, 1, values.length, headers.length).setValues(values);
}

/**
 * Update a specific row by primary key.
 */
function updateRowByKey_(spreadsheet, tabName, keyColumn, keyValue, updates) {
  const sheet = spreadsheet.getSheetByName(tabName);
  if (!sheet) throw new Error('tab_not_found: ' + tabName);

  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(h => String(h));
  const keyIdx = headers.indexOf(keyColumn);
  if (keyIdx < 0) throw new Error('key_column_not_found: ' + keyColumn);

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][keyIdx]) === String(keyValue)) {
      Object.keys(updates).forEach(col => {
        const colIdx = headers.indexOf(col);
        if (colIdx >= 0) {
          sheet.getRange(i + 1, colIdx + 1).setValue(updates[col]);
        }
      });
      return true;
    }
  }
  return false;
}

/**
 * Delete a row by primary key.
 */
function deleteRowByKey_(spreadsheet, tabName, keyColumn, keyValue) {
  const sheet = spreadsheet.getSheetByName(tabName);
  if (!sheet) throw new Error('tab_not_found: ' + tabName);

  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(h => String(h));
  const keyIdx = headers.indexOf(keyColumn);
  if (keyIdx < 0) return false;

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][keyIdx]) === String(keyValue)) {
      sheet.deleteRow(i + 1);
      return true;
    }
  }
  return false;
}

/* ============================================================
 * Date / Time
 * ============================================================ */

function nowBangkok() {
  return new Date();
}

function todayBangkok() {
  return formatDate_(new Date());
}

function formatDate_(d) {
  if (!d) return '';
  if (typeof d === 'string') d = new Date(d);
  return Utilities.formatDate(d, TIMEZONE, 'yyyy-MM-dd');
}

function formatDatetime_(d) {
  if (!d) return '';
  if (typeof d === 'string') d = new Date(d);
  return Utilities.formatDate(d, TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function formatThaiDateTime(d) {
  if (!d) return '';
  if (typeof d === 'string') d = new Date(d);
  const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.',
                  'ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  const day = Utilities.formatDate(d, TIMEZONE, 'd');
  const mon = months[parseInt(Utilities.formatDate(d, TIMEZONE, 'M'), 10) - 1];
  const year = Utilities.formatDate(d, TIMEZONE, 'yyyy');
  const time = Utilities.formatDate(d, TIMEZONE, 'HH:mm');
  return `${day} ${mon} ${year} ${time}`;
}

function addHours_(d, hours) {
  const out = new Date(d);
  out.setTime(out.getTime() + hours * 3600 * 1000);
  return out;
}

function isPast_(dateStr) {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
}

/* ============================================================
 * ID generation
 * ============================================================ */

/**
 * Generate ID with prefix and running number.
 * Examples:
 *   generateId_('EMP')  → 'EMP-0001'
 *   generateId_('CHK', true) → 'CHK-20260514-0001'
 */
function generateId_(prefix, includeDate) {
  const rand = Math.floor(1000 + Math.random() * 9000);
  if (includeDate) {
    const date = Utilities.formatDate(new Date(), TIMEZONE, 'yyyyMMdd');
    return `${prefix}-${date}-${rand}`;
  }
  return `${prefix}-${String(rand).padStart(4, '0')}`;
}

/**
 * Random numeric code of given length (e.g. for pairing codes).
 */
function randomNumericCode_(length) {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += Math.floor(Math.random() * 10);
  }
  return code;
}

/* ============================================================
 * Misc
 * ============================================================ */

function safeJsonParse_(str, fallback) {
  try { return JSON.parse(str); } catch (_) { return fallback; }
}

function safeJsonStringify_(obj) {
  try { return JSON.stringify(obj); } catch (_) { return '{}'; }
}
