/**
 * Config.gs — Configuration layer (FOUNDATION)
 *
 * Two-tier config:
 *   1. Script Properties — secrets + immutable IDs
 *      LINE_CHANNEL_ID, LINE_CHANNEL_SECRET, LINE_CHANNEL_ACCESS_TOKEN
 *      PUBLIC_SHEET_ID, DRIVE_FOLDER_ID, LIFF_ID, OWNER_USER_IDS
 *   2. Sheet `Settings` — tenant-editable runtime config
 *      key-value pairs (e.g. PAIRING_TTL_HOURS=24)
 *
 * Use getProperty_ for secrets, getSetting_ for runtime config.
 */

/**
 * Read a Script Property. Returns '' if not set.
 */
function getProperty_(key) {
  try {
    return PropertiesService.getScriptProperties().getProperty(key) || '';
  } catch (err) {
    logError('getProperty_', err);
    return '';
  }
}

/**
 * Set a Script Property.
 */
function setProperty_(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, String(value));
}

/**
 * Read a row from the Settings sheet with fallback default.
 */
function getSetting_(key, defaultValue) {
  try {
    const sheet = getPublicSheet_().getSheetByName('Settings');
    if (!sheet) return defaultValue;
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(key)) {
        const val = data[i][1];
        return (val === '' || val === null || val === undefined) ? defaultValue : val;
      }
    }
  } catch (err) {
    logError('getSetting_', err);
  }
  return defaultValue;
}

/**
 * Write/update a Settings row.
 */
function setSetting_(key, value) {
  const sheet = getPublicSheet_().getSheetByName('Settings');
  if (!sheet) throw new Error('settings_sheet_missing');
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(key)) {
      sheet.getRange(i + 1, 2).setValue(value);
      return;
    }
  }
  sheet.appendRow([key, value, '']);
}

/**
 * Get OWNER user IDs as an array (comma-separated in Script Properties).
 * This is how the system knows who the owner(s) are on a fresh install
 * before the first user is paired.
 */
function getOwnerUserIds_() {
  const raw = getProperty_('OWNER_USER_IDS');
  if (!raw) return [];
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

/**
 * Is this LINE userId one of the bootstrap owners?
 * Used during early setup before User_Map has any rows.
 */
function isBootstrapOwner_(userId) {
  if (!userId) return false;
  return getOwnerUserIds_().includes(String(userId));
}

/**
 * Print all Script Properties (for setup verification).
 * Run from Apps Script editor; results in Logs.
 */
function printProperties() {
  const props = PropertiesService.getScriptProperties().getProperties();
  const keys = Object.keys(props).sort();
  console.log('Script Properties:');
  keys.forEach(k => {
    // Mask secret-looking values
    const isSecret = /SECRET|TOKEN|KEY/i.test(k);
    const val = isSecret ? props[k].substring(0, 8) + '...(masked)' : props[k];
    console.log('  ' + k + ' = ' + val);
  });
  return keys;
}
