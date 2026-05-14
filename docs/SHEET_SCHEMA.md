# SHEET_SCHEMA.md — Universal Tabs

ระบบ template สร้าง **8 tabs มาตรฐาน** ใน Public Sheet ผ่าน `setupAll()`

**Sheet ID** เก็บใน Script Property `PUBLIC_SHEET_ID`

---

## 1. Universal Tabs (created by setupAll)

### `Employees`

ทะเบียนพนักงาน

| Column | Type | Description |
|---|---|---|
| `emp_code` | string | primary key (UPPER) |
| `first_name` | string | ชื่อจริง |
| `last_name` | string | นามสกุล |
| `nickname` | string | ชื่อเล่น (optional) |
| `email` | string | (optional) |
| `phone` | string | (optional) |
| `department` | string | (optional) |
| `position` | string | (optional) |
| `intended_role` | enum | staff / hr / owner (default role on pair) |
| `status` | enum | active / inactive / probation |
| `start_date` | date | YYYY-MM-DD |
| `note` | string | (optional) |
| `created_at` | datetime | ISO 8601 +07:00 |
| `created_by` | string | LINE userId of admin |

### `User_Map`

LINE userId ↔ emp_code mapping (active mappings only)

| Column | Type | Description |
|---|---|---|
| `line_user_id` | string | Uxxx... (primary key) |
| `emp_code` | string | FK → Employees.emp_code |
| `role` | enum | staff / hr / owner |
| `display_name` | string | snapshot ของ name ตอน pair |
| `paired_at` | datetime | ISO 8601 +07:00 |
| `last_seen` | datetime | updated on each getMe |

### `Pairing_Codes`

Lifecycle ของ pairing codes (ดู docs/PAIRING.md)

| Column | Type | Description |
|---|---|---|
| `code` | string | 6 หลัก (primary key) |
| `emp_code` | string | FK → Employees |
| `created_by` | string | admin LINE userId |
| `created_at` | datetime | |
| `expires_at` | datetime | created_at + TTL |
| `consumed_at` | datetime | (if redeemed) |
| `consumed_by_user_id` | string | (if redeemed) |
| `status` | enum | pending / consumed / expired / revoked |
| `fail_attempts` | number | wrong attempts count |
| `revoked_reason` | string | manual / reissue / brute_force / auto |

### `Pending_Changes`

Universal propose-approve queue (ดู docs/APPROVAL_PATTERNS.md)

| Column | Type | Description |
|---|---|---|
| `change_id` | string | PC-YYYYMMDD-XXXX (primary key) |
| `proposed_by` | string | LINE userId ของ proposer |
| `proposed_role` | string | role ตอน propose |
| `proposed_at` | datetime | |
| `change_type` | string | registered type |
| `target_table` | string | optional |
| `target_id` | string | optional |
| `change_data` | string | JSON |
| `status` | enum | pending / approved / rejected |
| `approved_by` | string | LINE userId of decider |
| `decision_at` | datetime | |
| `decision_note` | string | optional |

### `Rate_Limit`

Brute force protection log

| Column | Type | Description |
|---|---|---|
| `timestamp` | datetime | |
| `user_id` | string | LINE userId |
| `action` | string | e.g. pair_attempt |
| `detail` | string | optional context |

> **Note:** ตาราง grows over time. Optional: trigger ทุกเดือนล้าง row เก่ากว่า 30 วัน

### `Audit_Log`

Append-only business event log

| Column | Type | Description |
|---|---|---|
| `timestamp` | datetime | |
| `actor` | string | LINE userId of actor |
| `actor_role` | string | role at time of action |
| `action` | string | e.g. EMPLOYEE_ONBOARDED, API_REDEEMPAIRINGCODE |
| `target_type` | string | e.g. employee, pairing_code |
| `target_id` | string | the entity affected |
| `before` | string | JSON (optional) |
| `after` | string | JSON (optional) |
| `note` | string | optional |

### `Logs`

System errors / warnings / info (debug)

| Column | Type | Description |
|---|---|---|
| `timestamp` | datetime | |
| `level` | enum | INFO / WARN / ERROR |
| `function` | string | which function logged |
| `message` | string | |
| `payload` | string | JSON |
| `stack` | string | (errors only) |

### `Settings`

Tenant-editable runtime config

| Column | Type | Description |
|---|---|---|
| `key` | string | uppercase, underscore (primary) |
| `value` | any | string/number/bool |
| `note` | string | description |

**Seeded keys:**
```
PAIRING_TTL_HOURS             24
PAIRING_MAX_FAIL_ATTEMPTS     5
BRAND_NAME                    [BRAND_NAME]
BRAND_COLOR_PRIMARY           #0F6E56
```

---

## 2. Conventions

### Datetime

- ISO 8601 with `+07:00` timezone offset
- Use `formatDatetime_(new Date())` from Utils.gs

### Primary Keys

- `emp_code`: UPPERCASE alphanumeric + `_`, `-` (e.g. EMP001)
- `change_id`: `PC-YYYYMMDD-XXXX`
- `code`: 6-digit numeric (e.g. 482719)

### Booleans

- Store as `TRUE` / `FALSE` string OR boolean — `String(val).toUpperCase() === 'TRUE'` check

### JSON in cells

- `before`, `after`, `change_data` columns store JSON as string
- Always use `safeJsonParse_(str, fallback)` to read

---

## 3. Project-specific Tabs

เพิ่มใน `<Domain>.gs` ตาม pattern เดียวกัน:

```javascript
// Setup function ของ project
function projectSetup_() {
  const customTabs = [
    {
      name: 'Checkins',
      headers: ['checkin_id', 'emp_code', 'timestamp', 'lat', 'lng', 'photo_url'],
    },
    {
      name: 'Leave_Records',
      headers: ['leave_id', 'emp_code', 'leave_type', 'start_date', 'end_date',
                'reason', 'status', 'approved_by', 'approved_at'],
    },
  ];
  customTabs.forEach(tab => _ensureTab_(getPublicSheet_(), tab.name, tab.headers));
}
```

---

## 4. Secret Sheet (optional)

ถ้า project มีข้อมูลที่ HR ไม่ควรเห็น (salary, financial), แยกเป็น Sheet ที่ 2

- เก็บ Sheet ID ใน `SECRET_SHEET_ID` property
- เปิด permission เฉพาะ owner Google account
- เข้าผ่าน `getSecretSheet_()` (returns null ถ้าไม่ configured)

**ตัวอย่าง tabs:**
```
Salary_Master         emp_code, base_salary, ot_rate, ...
Payroll_Run           run_id, period, status, ...
YTD_Accumulator       emp_code, year, ytd_amount, ...
```

ระบบ template **ไม่บังคับ** ใช้ Secret Sheet — ใช้เฉพาะ project ที่ต้อง privacy layer
