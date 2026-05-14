/**
 * Setup.gs — One-shot setup + health check + seed (FOUNDATION)
 *
 * All functions are idempotent — safe to run multiple times.
 *
 * Order of operations (first install):
 *   1. setupProperties()       — paste secrets/IDs (user must edit first)
 *   2. setupAll()              — create Sheet tabs + Drive folders + Settings + triggers
 *   3. seedSampleData()        — (optional) add 5 dummy employees
 *   4. healthCheck()           — verify everything works
 */

/* ============================================================
 * Universal tab schemas
 * ============================================================ */

const UNIVERSAL_TABS = [
  {
    name: 'Employees',
    headers: [
      'emp_code', 'first_name', 'last_name', 'nickname', 'email', 'phone',
      'department', 'position', 'intended_role', 'status', 'start_date',
      'note', 'created_at', 'created_by',
    ],
  },
  {
    name: 'User_Map',
    headers: [
      'line_user_id', 'emp_code', 'role', 'display_name',
      'paired_at', 'last_seen',
    ],
  },
  {
    name: 'Pairing_Codes',
    headers: [
      'code', 'emp_code', 'created_by', 'created_at', 'expires_at',
      'consumed_at', 'consumed_by_user_id', 'status', 'fail_attempts', 'revoked_reason',
    ],
  },
  {
    name: 'Pending_Changes',
    headers: [
      'change_id', 'proposed_by', 'proposed_role', 'proposed_at',
      'change_type', 'target_table', 'target_id', 'change_data',
      'status', 'approved_by', 'decision_at', 'decision_note',
    ],
  },
  {
    name: 'Rate_Limit',
    headers: ['timestamp', 'user_id', 'action', 'detail'],
  },
  {
    name: 'Audit_Log',
    headers: [
      'timestamp', 'actor', 'actor_role', 'action',
      'target_type', 'target_id', 'before', 'after', 'note',
    ],
  },
  {
    name: 'Logs',
    headers: ['timestamp', 'level', 'function', 'message', 'payload', 'stack'],
  },
  {
    name: 'Settings',
    headers: ['key', 'value', 'note'],
  },
];

const SETTINGS_DEFAULTS = [
  { key: 'PAIRING_TTL_HOURS',          value: 24,  note: 'Pairing code lifespan in hours' },
  { key: 'PAIRING_MAX_FAIL_ATTEMPTS',  value: 5,   note: 'Block user / invalidate code after N failed attempts in 15 min' },
  { key: 'BRAND_NAME',                 value: '[BRAND_NAME]', note: 'Display name in messages' },
  { key: 'BRAND_COLOR_PRIMARY',        value: '#0F6E56', note: 'Primary brand color (hex)' },
];

/* ============================================================
 * setupProperties — first step
 * ============================================================ */

/**
 * Paste your secrets here and run this from Apps Script editor ONCE.
 * After it runs, the values are stored in Script Properties.
 * You can then DELETE the values from this function for security.
 */
function setupProperties() {
  const props = {
    // LINE Channel (Messaging API)
    LINE_CHANNEL_ID:            '',  // ← paste here
    LINE_CHANNEL_SECRET:        '',  // ← paste here
    LINE_CHANNEL_ACCESS_TOKEN:  '',  // ← paste here

    // LIFF
    LIFF_ID:                    '',  // ← paste here

    // Bootstrap owners (comma-separated LINE userIds — these can pair as OWNER role)
    OWNER_USER_IDS:             '',  // ← paste here, e.g. 'Uxxx,Uyyy'

    // Sheets (set automatically by setupAll if you don't paste them)
    PUBLIC_SHEET_ID:            '',
    SECRET_SHEET_ID:            '',  // optional

    // Drive
    DRIVE_FOLDER_ID:            '',  // ← paste here (parent folder ID)

    // Rich menus (set after creating them)
    RICHMENU_VISITOR_ID:        '',
    RICHMENU_PAIRED_ID:         '',
  };

  const sp = PropertiesService.getScriptProperties();
  Object.keys(props).forEach(k => {
    if (props[k]) sp.setProperty(k, props[k]);
  });

  console.log('Properties set. Run printProperties() to verify.');
  return printProperties();
}

/* ============================================================
 * setupAll — creates Sheets, Drive, Settings, triggers
 * ============================================================ */

function setupAll() {
  console.log('=== setupAll START ===');

  // 1. Public Sheet — auto-create if PUBLIC_SHEET_ID not set
  let publicSheet;
  const publicId = getProperty_('PUBLIC_SHEET_ID');
  if (publicId) {
    try {
      publicSheet = SpreadsheetApp.openById(publicId);
      console.log('Using existing Public Sheet: ' + publicSheet.getName());
    } catch (err) {
      throw new Error('PUBLIC_SHEET_ID is set but cannot open: ' + err.message);
    }
  } else {
    publicSheet = SpreadsheetApp.create('[BRAND_NAME] · Public');
    setProperty_('PUBLIC_SHEET_ID', publicSheet.getId());
    console.log('Created new Public Sheet: ' + publicSheet.getId());
  }

  // 2. Create universal tabs (idempotent)
  UNIVERSAL_TABS.forEach(tab => {
    _ensureTab_(publicSheet, tab.name, tab.headers);
  });

  // 3. Seed Settings (only missing keys)
  _seedSettings_();

  // 4. Drive folder — auto-create subfolders if root exists
  const driveId = getProperty_('DRIVE_FOLDER_ID');
  if (driveId) {
    try {
      const root = DriveApp.getFolderById(driveId);
      DRIVE_SUBFOLDERS.forEach(name => {
        const existing = root.getFoldersByName(name);
        if (!existing.hasNext()) {
          root.createFolder(name);
          console.log('  Created Drive subfolder: ' + name);
        }
      });
    } catch (err) {
      logWarn('setupAll', 'Drive folder setup skipped: ' + err.message);
    }
  } else {
    console.warn('DRIVE_FOLDER_ID not set — skipping Drive folder setup');
  }

  // 5. Install daily trigger for expirePairingCodes
  _installDailyTrigger_('expirePairingCodes', 0); // run at 00:00

  console.log('=== setupAll DONE ===');
  console.log('Next: run healthCheck() to verify.');
  return { ok: true, public_sheet_id: publicSheet.getId() };
}

function _ensureTab_(spreadsheet, tabName, headers) {
  let sheet = spreadsheet.getSheetByName(tabName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(tabName);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
    console.log('  Created tab: ' + tabName);
  } else {
    // Verify headers match (don't overwrite existing data, just warn)
    const existing = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    const mismatches = [];
    headers.forEach((h, i) => {
      if (existing[i] !== h) mismatches.push(`col ${i + 1}: expected '${h}' got '${existing[i]}'`);
    });
    if (mismatches.length > 0) {
      console.warn(`Tab '${tabName}' header mismatch: ` + mismatches.join('; '));
    }
  }
}

function _seedSettings_() {
  const sheet = getPublicSheet_().getSheetByName('Settings');
  if (!sheet) return;
  const existing = readTab_(getPublicSheet_(), 'Settings');
  const existingKeys = new Set(existing.map(r => r.key));

  const toAdd = SETTINGS_DEFAULTS.filter(s => !existingKeys.has(s.key));
  if (toAdd.length > 0) {
    appendRows_(getPublicSheet_(), 'Settings', toAdd);
    console.log('  Seeded ' + toAdd.length + ' settings');
  }
}

function _installDailyTrigger_(functionName, hour) {
  // Check existing triggers
  const triggers = ScriptApp.getProjectTriggers();
  const existing = triggers.find(t => t.getHandlerFunction() === functionName);
  if (existing) {
    console.log('  Daily trigger already exists for: ' + functionName);
    return;
  }
  ScriptApp.newTrigger(functionName)
    .timeBased()
    .atHour(hour)
    .everyDays(1)
    .inTimezone(TIMEZONE)
    .create();
  console.log('  Installed daily trigger: ' + functionName + ' at ' + hour + ':00 ' + TIMEZONE);
}

/* ============================================================
 * Seed sample data (5 dummy employees)
 * ============================================================ */

function seedSampleData() {
  console.log('=== seedSampleData START ===');
  const samples = [
    { emp_code: 'EMP001', first_name: 'สมชาย',  last_name: 'ใจดี',     intended_role: 'owner', department: 'บริหาร',   position: 'CEO' },
    { emp_code: 'EMP002', first_name: 'สมหญิง', last_name: 'สวยงาม',   intended_role: 'hr',    department: 'HR',       position: 'HR Manager' },
    { emp_code: 'EMP003', first_name: 'สมศักดิ์', last_name: 'รักงาน',   intended_role: 'staff', department: 'Sales',    position: 'Sales Rep' },
    { emp_code: 'EMP004', first_name: 'สมปอง',  last_name: 'ขยันทำ',   intended_role: 'staff', department: 'Marketing', position: 'Marketing Officer' },
    { emp_code: 'EMP005', first_name: 'สมหมาย', last_name: 'อดทน',     intended_role: 'staff', department: 'Operations', position: 'Operations Officer' },
  ];

  const employees = readTab_(getPublicSheet_(), 'Employees');
  const existingCodes = new Set(employees.map(e => String(e.emp_code).toUpperCase()));

  const toAdd = samples.filter(s => !existingCodes.has(s.emp_code))
    .map(s => ({
      ...s,
      status: 'active',
      start_date: todayBangkok(),
      created_at: formatDatetime_(new Date()),
      created_by: 'SEED',
    }));

  if (toAdd.length > 0) {
    appendRows_(getPublicSheet_(), 'Employees', toAdd);
    console.log('  Seeded ' + toAdd.length + ' dummy employees');
    toAdd.forEach(e => console.log('    ' + e.emp_code + ' · ' + e.first_name + ' ' + e.last_name + ' · ' + e.intended_role));
  } else {
    console.log('  Sample employees already exist');
  }
  console.log('=== seedSampleData DONE ===');
  return { ok: true, added: toAdd.length };
}

/* ============================================================
 * healthCheck — verify everything works
 * ============================================================ */

function healthCheck() {
  console.log('=== healthCheck START ===');
  const results = [];

  // Check properties
  ['LINE_CHANNEL_ID', 'LINE_CHANNEL_SECRET', 'LINE_CHANNEL_ACCESS_TOKEN', 'LIFF_ID', 'PUBLIC_SHEET_ID']
    .forEach(key => {
      results.push(_check_(key, () => !!getProperty_(key)));
    });

  // Check sheets
  results.push(_check_('public_sheet_accessible', () => !!getPublicSheet_().getName()));
  UNIVERSAL_TABS.forEach(tab => {
    results.push(_check_('tab_' + tab.name, () => !!getPublicSheet_().getSheetByName(tab.name)));
  });

  // Check Drive (optional)
  if (getProperty_('DRIVE_FOLDER_ID')) {
    results.push(_check_('drive_folder', () => !!DriveApp.getFolderById(getProperty_('DRIVE_FOLDER_ID'))));
  }

  // Check triggers
  results.push(_check_('daily_trigger', () =>
    ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'expirePairingCodes')
  ));

  // Check bootstrap owners
  const owners = getOwnerUserIds_();
  results.push(_check_('bootstrap_owners_configured', () => owners.length > 0));

  // Print summary
  console.log('--- Health Check Results ---');
  results.forEach(r => console.log(`  ${r.ok ? '✅' : '❌'}  ${r.name}${r.error ? ' — ' + r.error : ''}`));

  const failed = results.filter(r => !r.ok);
  console.log(`\n${failed.length === 0 ? '✅ All checks passed' : '❌ ' + failed.length + ' checks failed'}`);
  console.log('=== healthCheck DONE ===');

  return { ok: failed.length === 0, results };
}

function _check_(name, fn) {
  try {
    const ok = !!fn();
    return { name, ok };
  } catch (err) {
    return { name, ok: false, error: String(err.message || err) };
  }
}
