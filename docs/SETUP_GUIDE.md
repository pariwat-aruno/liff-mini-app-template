# SETUP_GUIDE.md — Deployment from Zero

จาก **template repo เปล่า** ไปถึง **ระบบใช้งานจริง** ใน ~30 นาที

---

## Prerequisites

- LINE Developers account
- Google account (สำหรับ Apps Script + Sheet + Drive)
- GitHub account (สำหรับ Pages hosting)
- Node.js 18+ (สำหรับ clasp)

---

## Step 1 · Clone Template Repo

### Option A: GitHub Web UI

1. ไปที่ template repo บน GitHub
2. คลิก **"Use this template"** → **"Create a new repository"**
3. ตั้งชื่อ repo + เลือก Public/Private
4. Clone ลงเครื่อง:
   ```bash
   git clone https://github.com/<your-username>/<your-repo>.git
   cd <your-repo>
   ```

### Option B: Local

```bash
git clone https://github.com/<original-template-repo>.git my-new-project
cd my-new-project
rm -rf .git
git init
```

---

## Step 2 · Find-Replace Placeholders

```bash
# macOS / Linux
grep -r "\[BRAND_NAME\]" --include="*.html" --include="*.md" --include="*.gs" --include="*.js" --include="*.css"
grep -r "\[TAGLINE\]" --include="*.html" --include="*.md" --include="*.gs"
```

Replace `[BRAND_NAME]` → ชื่อแบรนด์ของคุณ
Replace `[TAGLINE]` → tagline สั้นๆ

Or use VSCode global find/replace (Cmd+Shift+H)

---

## Step 3 · Create LINE Channel + LIFF

ใน [LINE Developers Console](https://developers.line.biz/console/):

1. **Create Provider** (ถ้ายังไม่มี)
2. **Create Messaging API channel** ใน provider
3. **Issue Channel Access Token** — บันทึกค่าไว้
4. **Copy Channel Secret** จาก Basic settings
5. **Copy Channel ID** จาก Basic settings

### LIFF App

1. ในหน้า channel → LIFF tab → **Add**
2. ตั้งค่า:
   - Endpoint URL: `https://<your-username>.github.io/<your-repo>/` (จะตั้งใน Step 9)
   - LIFF view size: **Tall**
   - Scope: ✅ `profile`, ✅ `openid`
3. บันทึก **LIFF ID** (form: `2010019987-1USGaEEO`)

---

## Step 4 · Get Your LINE User ID

(จำเป็นสำหรับ bootstrap owner)

วิธีที่ง่ายสุด:
1. Deploy LIFF ก่อน (Step 7-9) แล้วเปิด myid.html
2. หรือใช้ [LINE Webhook tester](https://developers.line.biz/console/) ดู userId

บันทึก userId ของคุณ (form: `U1234abcd...`)

---

## Step 5 · Set up Apps Script

```bash
cd apps-script
npm install
npx clasp login
```

### Create Apps Script project

```bash
npx clasp create --type standalone --title "<Brand> Backend"
```

(จะได้ Script ID + URL ของ Apps Script ใน console)

### Push code

```bash
npx clasp push --force
```

---

## Step 6 · Configure Script Properties

เปิด Apps Script editor:

```bash
npx clasp open
```

1. ไปที่ **Project Settings** → **Script Properties** → ไม่ต้องกรอกใน UI
2. กลับมาที่ Editor → **เปิด `Setup.gs`** → แก้ function `setupProperties()`:

```javascript
const props = {
  LINE_CHANNEL_ID:            'XXXXXXXX',         // ← paste
  LINE_CHANNEL_SECRET:        'xxxxxx...',        // ← paste
  LINE_CHANNEL_ACCESS_TOKEN:  'eyJhbGc...',       // ← paste
  LIFF_ID:                    '2010019987-...',   // ← paste
  OWNER_USER_IDS:             'U1234abcd...',     // ← paste (comma-separated)
  DRIVE_FOLDER_ID:            '',                 // ← optional, set in Step 8
  // ...
};
```

3. รัน `setupProperties()` จาก editor (กดปุ่ม ▶ Run)
4. ตรวจด้วย `printProperties()`

**Security tip:** หลัง run แล้ว ลบค่า secret ออกจาก setupProperties() ก่อน push อีกครั้ง

---

## Step 7 · Run setupAll

จาก Apps Script editor:

```javascript
setupAll()   // creates Public Sheet + 8 tabs + Settings + triggers
```

ดู Logs — จะเห็น `PUBLIC_SHEET_ID` ที่ถูก auto-set

### (Optional) Seed sample data

```javascript
seedSampleData()   // adds 5 dummy employees
```

### Verify

```javascript
healthCheck()   // ✅ all checks should pass
```

---

## Step 8 · Drive Folder (Optional)

ถ้า project มีไฟล์อัพโหลด (selfie, evidence):

1. สร้าง folder ใน Google Drive
2. Copy folder ID จาก URL
3. ใน Apps Script → setupProperties() เพิ่ม `DRIVE_FOLDER_ID`
4. รัน setupProperties() ใหม่ + setupAll() (auto-create subfolders)

---

## Step 9 · Deploy Apps Script Web App

**⚠️ ผ่าน UI เท่านั้น — clasp 3.x bug จะ reset access**

1. Apps Script editor → **Deploy** → **New deployment**
2. Type: **Web app**
3. Execute as: **Me**
4. Who has access: **Anyone**
5. Click **Deploy**
6. Copy **Web App URL** (form: `https://script.google.com/macros/s/AKfy.../exec`)

---

## Step 10 · Configure Frontend

แก้ `frontend/src/js/config.js`:

```javascript
window.PAYROLL_CONFIG = {
  LIFF_ID: '2010019987-...',     // จาก Step 3
  API_URL: 'https://script.google.com/.../exec',  // จาก Step 9
  BRAND_NAME: 'YourBrand',
  // ...
};
```

(สำหรับ multi-tenant: ปล่อยว่าง แล้วใช้ `?backend=` URL param แทน)

---

## Step 11 · Push to GitHub + Enable Pages

```bash
git add .
git commit -m "Initial deployment"
git push origin main
```

### Enable GitHub Pages

1. Repo → Settings → **Pages**
2. Source: **GitHub Actions** (workflow `.github/workflows/pages.yml` ทำงานเอง)
3. รอ ~1 นาที deploy เสร็จ
4. URL: `https://<your-username>.github.io/<your-repo>/`

---

## Step 12 · Update LIFF Endpoint URL

1. LINE Developers Console → LIFF app
2. Endpoint URL: `https://<your-username>.github.io/<your-repo>/`
3. Save

---

## Step 13 · Set LINE Webhook

1. LINE Developers Console → Messaging API tab
2. Webhook URL: `https://script.google.com/.../exec` (เดียวกับ Web App URL)
3. **Use webhook**: ON
4. Verify: อาจขึ้น "Error 302" — ignore (LIFF SDK ไม่ตาม redirect แต่ event ทำงานปกติ)

---

## Step 14 · ทดสอบ

### A. Bootstrap Owner

1. เปิด LIFF จาก LINE app (เพิ่มเป็นเพื่อนก่อน หรือ scan QR)
2. เปิด `pair.html` หรือพิมพ์ `/pair` ใน chat
3. ตอนนี้ยังไม่มี code → ใช้ Apps Script onboard เอง:
   ```javascript
   // ใน Apps Script editor
   const result = onboardEmployee_({
     emp_code: 'EMP001',
     first_name: 'Owner',
     last_name: 'Test',
     intended_role: 'owner',
   }, { userId: 'U1234abcd...' });  // ใส่ LINE userId ของคุณ
   console.log(result);  // จะเห็น pairing code
   ```
4. ไปที่ LIFF pair.html → กรอก `EMP001` + code → ผูก

### B. Add Another User

ตอนนี้คุณเป็น OWNER แล้ว → เปิด LIFF `onboard.html` → เพิ่มพนักงานคนที่ 2 ผ่าน UI

---

## Troubleshooting

### "auth_failed"
- LINE_CHANNEL_ID ผิด หรือ LIFF ID ไม่ตรง

### "backend_url_not_configured"
- config.js ยังไม่ใส่ API_URL หรือ URL `?backend=` ไม่มา

### "not_paired" หลังกด pair สำเร็จ
- Cache ติด → รัน `invalidateUserMapCache_(userId, empCode)` หรือรอ 5 นาที

### Pages deploy ไม่ทำงาน
- Settings → Pages → Source ต้องเป็น "GitHub Actions"
- Check Actions tab สำหรับ error

### "rate_limit_exceeded"
- ผิดเยอะใน 15 นาที → รอ 15 นาที หรือลบ row Rate_Limit ใน Sheet

---

## Next Steps

หลัง template setup เสร็จ:

1. อ่าน `docs/ROLES.md` เข้าใจ role hierarchy
2. อ่าน `docs/PAIRING.md` เข้าใจ pairing flow
3. อ่าน `docs/APPROVAL_PATTERNS.md` ถ้าจะเพิ่ม feature ที่ต้อง approval
4. Rename `apps-script/_Domain.gs.template` → ชื่อ project ของคุณ
5. เริ่มเขียน business logic เฉพาะ project
