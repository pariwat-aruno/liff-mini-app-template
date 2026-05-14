# ROLES.md — 4-Role System

ระบบมี role 4 ระดับ เรียงตามลำดับสิทธิ์น้อย → มาก:

```
VISITOR → STAFF → HR → OWNER
```

แต่ละ role **ทำได้ทุกอย่างที่ role ต่ำกว่าทำได้** (hierarchical, ไม่ใช่ flat)

---

## 1. Role Determination

```
ผู้ใช้เปิด LIFF
    ↓
verifyIdToken → ได้ LINE userId
    ↓
lookupEmpCodeByUserId(userId) → query User_Map
    ↓
ถ้าไม่เจอ row    → VISITOR
ถ้าเจอ row      → role ตาม column User_Map.role
```

**กรณีพิเศษ — Bootstrap Owner:**
ก่อนระบบมี user แรก ต้องระบุ owner ใน Script Property `OWNER_USER_IDS`
(comma-separated) — userId เหล่านี้จะถูก map เป็น `owner` role ตอน pair ครั้งแรก

---

## 2. Role Matrix

| Resource / Action | VISITOR | STAFF | HR | OWNER |
|---|:-:|:-:|:-:|:-:|
| เปิด LIFF / ดู profile | ✅ | ✅ | ✅ | ✅ |
| pair บัญชี LINE | ✅ | — | — | — |
| ขอ re-pair (LINE เปลี่ยน) | ✅ | — | — | — |
| ดูข้อมูลตัวเอง | — | ✅ | ✅ | ✅ |
| ส่งคำขอ (leave, OT, ฯลฯ) | — | ✅ | ✅ | ✅ |
| List พนักงาน + pending codes | — | — | ✅ | ✅ |
| สร้าง pairing code | — | — | ✅ | ✅ |
| Revoke pairing code | — | — | ✅ | ✅ |
| Onboard staff role | — | — | ✅ | ✅ |
| Onboard HR/Owner role | — | — | — | ✅ |
| Propose change | — | ✅ | ✅ | ✅ |
| Approve pending change | — | — | — | ✅ |
| Unpair employee | — | — | — | ✅ |
| ดู Audit Log | — | — | — | ✅ |
| รัน setup/heath check | — | — | — | ✅ |

> **Note:** HR เห็นรายการ pending changes ได้แต่ **กดอนุมัติไม่ได้** — เพราะ HR เป็นคนเสนอด้วย จะ approve ตัวเองไม่ได้

---

## 3. Capabilities Pattern

แต่ละ role มี array of capability keys ที่ frontend ใช้ render UI:

```javascript
visitor: ['pair', 'repair']
staff:   ['pair', 'repair', 'self.profile']
hr:      ['pair', 'repair', 'self.profile', 'hr.propose', 'hr.viewPending']
owner:   ['*']
```

**Project-specific extension** — เพิ่มใน `_projectCapabilities_(role)`:

```javascript
function _projectCapabilities_(role) {
  return {
    staff: ['checkin.submit', 'leave.submit'],
    hr:    ['checkin.review', 'leave.review'],
    owner: ['payroll.run', 'reports.view'],
  }[role] || [];
}
```

**Frontend usage:**

```javascript
if (hasCapability(me.capabilities, 'checkin.submit')) showCheckinButton();
if (hasCapability(me.capabilities, 'hr.*'))        showAdminPanel();
```

---

## 4. Authorization Enforcement

### Backend (authoritative)

ทุก handler ใน `Code.gs::HANDLERS` ระบุ `minRole`. Router บังคับเช็คอัตโนมัติ:

```javascript
const HANDLERS = {
  generatePairingCode: { fn: ..., minRole: ROLES.HR },
  approvePendingChange: { fn: ..., minRole: ROLES.OWNER },
};
```

ภายใน handler ก็ใช้ `requireRole_()` ได้สำหรับ check เพิ่มเติม:

```javascript
function onboardEmployee_(payload, ctx) {
  requireRole_(ctx, ROLES.HR);
  // HR can onboard staff, but only OWNER can onboard HR/Owner
  if (payload.intended_role === 'owner' || payload.intended_role === 'hr') {
    requireRole_(ctx, ROLES.OWNER);
  }
  // ...
}
```

### Frontend (UX only — never trust)

Frontend ซ่อน UI ตาม capabilities เพื่อ UX ที่ดี **แต่ต้องไม่พึ่ง frontend เป็น security:**

```javascript
// บน HTML
if (hasCapability(me.capabilities, 'hr.*')) {
  document.getElementById('admin-card').removeAttribute('hidden');
}
```

ถ้ามีคนยิง API ตรงโดยไม่ผ่าน UI ก็โดน `requireRole_()` reject อยู่ดี

---

## 5. Role Transitions

### Promote/Demote (Owner only)

ตอนนี้ไม่มี endpoint UI สำหรับเปลี่ยน role โดยตรง — แอดมินแก้ใน Sheet `User_Map.role` column

**Future:** เพิ่ม `changeRole` endpoint + admin UI ในเฟส 2

### Off-board

```javascript
unpairEmployee_(empCode, ctx)
```

- ลบ row ใน `User_Map`
- พนักงานเปิด LIFF อีกครั้ง → ระบบเห็นเป็น VISITOR
- ข้อมูลใน `Employees` ยังอยู่ (เปลี่ยน `status` เป็น `inactive` เอง)

### Re-pair (LINE account เปลี่ยน)

ดู `docs/PAIRING.md` ส่วน "Re-pair Flow" — visitor proposes → owner approves

---

## 6. ทำไมต้อง 4 roles ไม่ใช่ 3 หรือ 5

- **VISITOR** — แยกออกจาก STAFF เพราะมี capabilities ต่างกัน (pair vs. self-service)
- **STAFF** — base role สำหรับคนที่ผ่าน onboarding แล้ว
- **HR** — แยกออกจาก OWNER เพื่อให้ owner ไม่ต้องลงมาทำ operational ทุกครั้ง · HR ทำได้ แต่ owner approve
- **OWNER** — full access · cannot be locked out (bootstrap via Script Properties)

5 roles ขึ้นไป (เช่น Manager, Supervisor) ไม่ใช่ role — เป็น **relationship** (manager ของแผนกไหน)
ทำผ่าน `Employees.manager_emp_code` หรือ `Approval_Chain` table แทน

---

## 7. ไฟล์ที่เกี่ยวข้อง

```
apps-script/Roles.gs       ROLES enum + helpers
apps-script/Auth.gs        verifyIdToken + lookupEmpCodeByUserId
apps-script/Code.gs        HANDLERS registry with minRole
frontend/js/menu-config.js declarative menu items with `requires`
frontend/index.html        renderMenu() filters by capabilities
```
