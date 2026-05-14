# APPROVAL_PATTERNS.md — Universal Approval Queue

ระบบมี **pending_changes pattern** ที่ใช้ซ้ำได้กับทุก mutation ที่ต้องการ 2-eyes approval

---

## 1. Core Concept

```
ใครๆ propose change → row added to Pending_Changes (status=pending)
                            ↓
                  push Flex card หา owners
                            ↓
              owner กดอนุมัติ/ปฏิเสธ ใน LINE chat
                            ↓
                   PendingChanges.gs apply change
                            ↓
                  notify proposer ของผลลัพธ์
```

**Exception:** Owner propose = direct apply (no approval queue)

---

## 2. Use Cases ที่ implemented

| Change Type | Proposer | Target | Approver |
|---|---|---|---|
| `repair_request` | Visitor (LINE ใหม่) | User_Map ของ emp_code เดิม | Owner |

(Project-specific change types เพิ่มได้ใน `<Domain>.gs` ผ่าน `registerChangeHandler_`)

---

## 3. Schema · Pending_Changes

| Column | Type | Description |
|---|---|---|
| `change_id` | string | PC-YYYYMMDD-XXXX (primary key) |
| `proposed_by` | string | LINE userId ของคน propose |
| `proposed_role` | string | role ตอน propose |
| `proposed_at` | datetime | ISO 8601 +07:00 |
| `change_type` | string | type registered ใน registry |
| `target_table` | string | ชื่อ Sheet (optional) |
| `target_id` | string | key ของ row ที่จะแก้ (optional) |
| `change_data` | string | JSON ของข้อมูลใหม่ |
| `status` | enum | pending / approved / rejected |
| `approved_by` | string | LINE userId ของ approver |
| `decision_at` | datetime | when decided |
| `decision_note` | string | optional reason |

---

## 4. Registration Pattern

แต่ละ change_type มี handler ที่ apply ตอน approved

```javascript
// ใน feature module (เช่น Pairing.gs, Leave.gs)
registerChangeHandler_('my_change_type', function(change, ctx) {
  const data = safeJsonParse_(change.change_data, {});
  // apply the change
  updateRowByKey_(...);
  return { ok: true, result: '...' };
});
```

**Built-in registrations:**
- `repair_request` → `applyRepairApproval_` (in Pairing.gs)

---

## 5. Propose API

ใช้ `proposeChange_` จาก feature module:

```javascript
function someUserAction_(payload, ctx) {
  // validate ...
  return proposeChange_({
    type: 'my_change_type',
    target_table: 'Some_Sheet',
    target_id: payload.target_id,
    data: {
      field1: payload.field1,
      field2: payload.field2,
      // ... any JSON-serializable data
    },
  }, ctx);
}
```

**Behavior:**
- ถ้า ctx เป็น OWNER → apply ทันที (no queue) + audit
- ถ้า ctx เป็น HR หรือต่ำกว่า → queue + notify owners

---

## 6. Approval Flow

```
LIFF /admin.html  →  POST listPendingChanges
                   ←  array of pending items

LIFF กด "อนุมัติ" → POST approvePendingChange { change_id, note? }
                  ↓
                PendingChanges._decideChange_
                  ↓
                handler(change, ctx)   ← from registry
                  ↓
                update Pending_Changes status
                  ↓
                push Flex หา proposer
                  ↓
                audit log
```

หรือผ่าน LINE Flex bubble:

```
[Flex card ใน chat] → user แตะ "อนุมัติ" → LINE webhook postback
                                      ↓
                              WebApp.gs handleChangeDecision_
                                      ↓
                              same flow as above
```

---

## 7. ทำไม pattern นี้ powerful

### Separation of Concerns

- **Propose** ≠ **Apply** = HR เสนอ → Owner ตัดสินใจ
- Feature module ไม่ต้องเขียน approval logic เอง — แค่ register handler

### Universal

ใช้ได้กับ:
- การแก้ข้อมูลพนักงาน (HR เสนอ)
- การอนุมัติลา (Staff เสนอ)
- การเปลี่ยน setting (HR เสนอ)
- Re-pair (Visitor เสนอ)
- Refund / cancel (Staff เสนอ)
- ใดๆ ก็ตามที่ต้อง 2 ตา

### Audit-friendly

- ทุก change มี full history ใน Sheet
- เห็น who/when/what ครบ
- ตามรอย incident ง่าย

### Owner ไม่ต้องเปิด LIFF

- กดอนุมัติได้จาก Flex card ใน LINE chat ตรง
- WebApp.gs handle postback `action=approve_change&change_id=XXX`

---

## 8. ตัวอย่างการ extend (Phase 2)

```javascript
// apps-script/Leave.gs (project-specific)

registerChangeHandler_('leave_request', function(change, ctx) {
  const data = safeJsonParse_(change.change_data, {});

  // Apply: add row to Leave_Records sheet
  appendRows_(getPublicSheet_(), 'Leave_Records', [{
    leave_id:    generateId_('LV', true),
    emp_code:    change.target_id,
    leave_type:  data.leave_type,
    start_date:  data.start_date,
    end_date:    data.end_date,
    reason:      data.reason,
    approved_by: ctx.userId,
    approved_at: formatDatetime_(new Date()),
    status:      'approved',
  }]);

  // Notify employee
  const userId = lookupUserIdByEmpCode(change.target_id);
  if (userId) {
    pushText(userId, `✅ คำขอลา ${data.leave_type} ${data.start_date} ได้รับการอนุมัติแล้ว`);
  }

  return { ok: true };
});

function submitLeave_(payload, ctx) {
  requireRole_(ctx, ROLES.STAFF);
  return proposeChange_({
    type: 'leave_request',
    target_table: 'Leave_Records',
    target_id: ctx.empCode,
    data: payload,
  }, ctx);
}
```

แค่นี้ก็ได้ leave approval flow ครบ — รวม notifications, audit, owner inbox

---

## 9. ไฟล์ที่เกี่ยวข้อง

```
apps-script/PendingChanges.gs           module หลัก
apps-script/Pairing.gs                  registered handler 'repair_request'
apps-script/WebApp.gs::_handlePostback_ รับ Flex button → approve/reject
apps-script/LineApi.gs::buildApprovalFlex  สร้าง Flex bubble
frontend/src/admin.html                 Tab "รออนุมัติ"
```
