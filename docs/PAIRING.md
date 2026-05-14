# PAIRING.md — Pairing Module Spec

ระบบ pairing ใช้ pattern **"admin ออก ticket → user ใช้ ticket แลก"**

ทุก decision ใน module นี้ **ล็อคไว้แล้ว** (ดู section "Locked Defaults")
ห้ามแก้โดยไม่ re-evaluate กับเจ้าของระบบ

---

## 1. Lifecycle

```
pending ──┬──> consumed   (user redeem สำเร็จ)
          ├──> expired    (TTL · daily trigger sweep)
          └──> revoked    (admin · รวม reissue + brute force auto-revoke)
```

เปลี่ยน state แล้ว **ไม่กลับ** — ทำให้ audit ดูง่าย

---

## 2. Locked Defaults

| Decision | Value | ทำไม |
|---|---|---|
| Code/employee | 1 active เท่านั้น | ไม่สับสน · reissue = revoke เก่า |
| Code format | 6 หลัก ตัวเลขล้วน | กรอกใน mobile ง่าย · 1M combos + rate limit = พอ |
| TTL | configurable · default 24h | ตั้งใน Settings.PAIRING_TTL_HOURS |
| Storage | Sheet primary + Cache opt | restart ไม่หาย · audit trail |
| Brute force | rate limit user + invalidate code | per LINE userId + per code |
| Max fail | configurable · default 5 ครั้งใน 15 นาที | Settings.PAIRING_MAX_FAIL_ATTEMPTS |
| Pending visibility | HR + Owner เห็นหมด | transparency |
| Reissue | revoke เก่า auto · gen ใหม่ | atomic operation |
| Pairing key | emp_code อย่างเดียว | admin verify ตอน onboard แล้ว |
| Pre-filled link | Level 2 + confirmation step | UX ดี + ป้องกัน accidental pair |
| Re-pair | self-service + admin approval | ใช้ Pending_Changes pattern |

---

## 3. Three Flows

### Flow 1 — Initial Pairing

```
[Admin]  onboard.html → กรอกข้อมูลพนักงาน → submit
   ↓
Backend onboardEmployee_()
   - validate
   - append Employees row (line_user_id = ว่าง)
   - call generatePairingCode_(empCode)
   - return code + pre-filled LIFF link
   ↓
[Admin]  เห็นหน้า success → ปุ่ม "คัดลอกข้อความ" → ส่ง LINE พนักงาน
   ↓
[User]   แตะลิงก์ liff.line.me/<id>?p=pair&emp=EMP006&c=482719
   ↓
[Frontend] pair.html อ่าน query → แสดงหน้า "ยืนยันตัวตน"
   ↓
[User]   กดยืนยัน → POST redeemPairingCode
   ↓
Backend redeemPairingCode_()
   - rate limit check
   - find code in Sheet (source of truth)
   - validate (match emp_code, not expired, not used)
   - append User_Map row
   - mark code consumed
   - switch rich menu (if configured)
   - audit log
   ↓
[User]   เห็นหน้า "ผูกสำเร็จ"
```

### Flow 2 — Re-pair (เปลี่ยน LINE account)

```
[User]   เปิด LIFF จาก LINE account ใหม่
   ↓
[Frontend] เห็นว่า not_paired → แสดง repair.html ใน visitor menu
   ↓
[User]   เปิด repair.html → กรอก emp_code เดิม + reason → submit
   ↓
Backend requestRepair_()
   - validate
   - check ไม่ใช่ already_paired
   - check ไม่มี pending repair_request ของ emp_code นี้
   - proposeChange_({ type: 'repair_request', ... })
   - PendingChanges จะ push Flex หา owners
   ↓
[Owner]  เห็น Flex card ใน LINE → กด "อนุมัติ"
   ↓
LINE webhook → approvePendingChange_
   - call registered handler: applyRepairApproval_
     - unpair old (delete User_Map row by emp_code)
     - generatePairingCode_ → ได้ code ใหม่
     - push Flex หา user พร้อม code ใหม่
   ↓
[User]   ได้ Flex card "รหัสผูกใหม่" → แตะลิงก์ → Flow 1 ต่อ
```

### Flow 3 — Admin Code Lifecycle Management

```
admin.html → tab "รหัสผูก"
   ↓
listPairingCodes_() → list ทุก code ที่ status=pending
   ↓
แต่ละ row มี 3 actions:
   - ส่งซ้ำ      → คัดลอกข้อความเดิม (ไม่ gen ใหม่)
   - Revoke      → status=revoked
   - (auto) Reissue เกิดเมื่อ admin onboard ซ้ำคน → revoke เก่า + gen ใหม่
```

**Daily sweep:**

```
expirePairingCodes()  — trigger 00:00 ทุกวัน
   - find ทุก row status=pending + expires_at < now
   - update status=expired
   - clear cache
```

---

## 4. Sheet Schema · Pairing_Codes

| Column | Type | Description |
|---|---|---|
| `code` | string | 6 หลัก ตัวเลข (primary key) |
| `emp_code` | string | FK → Employees.emp_code |
| `created_by` | string | LINE userId ของ admin ที่ออก |
| `created_at` | datetime | ISO 8601 +07:00 |
| `expires_at` | datetime | created_at + TTL hours |
| `consumed_at` | datetime | when redeemed (null if not yet) |
| `consumed_by_user_id` | string | LINE userId of user who redeemed |
| `status` | enum | pending / consumed / expired / revoked |
| `fail_attempts` | number | count ของ wrong code attempts |
| `revoked_reason` | string | manual / reissue / brute_force / auto |

---

## 5. API Endpoints

| Endpoint | Role | Description |
|---|---|---|
| `generatePairingCode` | HR | สร้าง code ใหม่ (auto revoke เก่า) |
| `listPairingCodes` | HR | ดูทุก pending code |
| `revokePairingCode` | HR | ยกเลิก code |
| `redeemPairingCode` | VISITOR | ใช้ code ผูก LINE |
| `requestRepair` | VISITOR | ขอผูกใหม่ (สร้าง pending_change) |

(approve repair ใช้ generic `approvePendingChange` — routed by change_type)

---

## 6. Settings (configurable per tenant)

```
PAIRING_TTL_HOURS              default 24
PAIRING_MAX_FAIL_ATTEMPTS      default 5
```

แก้ได้ใน Sheet `Settings` โดยไม่ต้อง re-deploy

---

## 7. Security Notes

### Rate Limit

- **Per LINE userId**: max 5 fail attempts ใน 15 นาที → throw `rate_limit_exceeded`
- **Per code**: max 5 fail attempts → invalidate code (status=revoked, reason=brute_force)

### Pre-filled Link Risk

Level 2 link `?emp=EMP006&c=482719` ถ้า leak → ใครเปิดก่อนได้ก่อน

**Mitigations:**
1. Confirmation step ใน pair.html — แสดง emp_code + LINE display name ก่อน redeem
2. Admin ต้องส่งใน private chat กับพนักงานเท่านั้น
3. TTL 24h จำกัด window

ถ้าเห็นว่า code ถูก leak → admin revoke + reissue

### Bootstrap Owner

ก่อนระบบมี user — ใส่ LINE userId ของ owner ใน Script Property `OWNER_USER_IDS`
(comma-separated) → คนเหล่านี้ pair เป็น `owner` role อัตโนมัติ

---

## 8. ไฟล์ที่เกี่ยวข้อง

```
apps-script/Pairing.gs                  หลัก
apps-script/Onboarding.gs::onboardEmployee_ → ใช้ generatePairingCode_
apps-script/PendingChanges.gs           registered handler 'repair_request'
apps-script/Setup.gs                    daily trigger + Sheet schema
frontend/src/pair.html                  Flow 1 redeem
frontend/src/repair.html                Flow 2 request
frontend/src/onboard.html               Flow 1 admin side
frontend/src/admin.html                 Flow 3 management
```
