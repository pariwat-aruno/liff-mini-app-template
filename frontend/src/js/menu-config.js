/**
 * menu-config.js — Declarative menu config (FOUNDATION)
 *
 * Add menu items here instead of hardcoding in HTML.
 * Each item declares which capabilities it needs — index.html renders
 * conditionally based on the user's capabilities array from getMe().
 *
 * Sections:
 *   visitor — only shown when user is unpaired
 *   self    — staff/hr/owner self-service
 *   hr      — HR tools (hr, owner)
 *   owner   — owner-only
 *
 * To add a project-specific item:
 *   PAYROLL_MENU.push({ id, label, icon, page, requires, section });
 */

window.PAYROLL_MENU = [
  // VISITOR section
  {
    id: 'pair',
    label: 'ผูกบัญชี LINE',
    subtitle: 'ใส่รหัสที่แอดมินส่งให้',
    icon: '🔗',
    color: 'amber',
    page: 'pair.html',
    requires: ['pair'],
    section: 'visitor',
  },
  {
    id: 'repair',
    label: 'ขอผูกบัญชีใหม่',
    subtitle: 'กรณีเปลี่ยน LINE account',
    icon: '🔄',
    color: 'slate',
    page: 'repair.html',
    requires: ['repair'],
    section: 'visitor',
  },

  // SELF section (staff/hr/owner)
  {
    id: 'profile',
    label: 'ข้อมูลของฉัน',
    subtitle: 'ดู/แก้ไขข้อมูลส่วนตัว',
    icon: '👤',
    color: 'blue',
    page: 'profile.html',
    requires: ['self.profile'],
    section: 'self',
  },

  // HR section
  {
    id: 'admin',
    label: 'เครื่องมือแอดมิน',
    subtitle: 'จัดการพนักงาน · รหัสผูก · อนุมัติ',
    icon: '🛠️',
    color: 'purple',
    page: 'admin.html',
    requires: ['hr.*'],
    section: 'hr',
    badge: 'HR',
  },

  // OWNER section
  {
    id: 'onboard',
    label: 'เพิ่มพนักงานใหม่',
    subtitle: 'กรอกข้อมูล + ออกรหัสผูก',
    icon: '➕',
    color: 'rose',
    page: 'onboard.html',
    requires: ['*'],
    section: 'owner',
    badge: 'เจ้าของ',
  },
];

/* ============================================================
 * Capability check (mirrors Roles.gs::hasCapability_)
 * ============================================================ */

window.hasCapability = function (capabilities, requested) {
  if (!Array.isArray(capabilities)) return false;
  if (capabilities.includes('*')) return true;
  if (capabilities.includes(requested)) return true;
  for (const cap of capabilities) {
    if (cap.endsWith('.*') && requested.startsWith(cap.slice(0, -1))) return true;
  }
  return false;
};

window.hasAnyCapability = function (capabilities, requestedList) {
  return requestedList.some(r => window.hasCapability(capabilities, r));
};
