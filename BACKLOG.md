# BACKLOG

Foundation features ที่ implement ครบใน v1.0 — feature ที่ project ใช้ template
นี้ extend ต่อจะใส่ใน TASKS.md ของ project นั้นเอง

## Foundation Backlog (อาจเพิ่มใน template เอง)

### v1.1 candidates

- [ ] `changeRole` endpoint + admin UI (ตอนนี้ต้องแก้ User_Map ใน Sheet)
- [ ] `profile.html` หน้ามาตรฐาน edit ข้อมูลตัวเอง
- [ ] `help.html` พร้อม FAQ generic
- [ ] Rate_Limit auto-cleanup (lưu 30 วันแล้วลบ)
- [ ] Audit_Log export to BigQuery (optional)
- [ ] Optional: SECRET_SHEET เปิดใช้ทันทีถ้า property set
- [ ] Optional: SMS fallback ถ้า LINE push fail

### v1.2 candidates

- [ ] Multi-language (i18n) สำหรับ frontend
- [ ] Theme switching (dark/light)
- [ ] Approval chain (2+ levels) — ตอนนี้ 1 ชั้น
- [ ] Bulk onboard via CSV
- [ ] Rich menu auto-switch on role promotion

### v2.0 ideas

- [ ] Move to TypeScript (Apps Script side)
- [ ] React frontend option
- [ ] Webhook event replay (debugging)
- [ ] Real-time updates via LINE LIFF Beacon / WebSocket
