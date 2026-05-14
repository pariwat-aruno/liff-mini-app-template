/**
 * utils.js — Frontend utility helpers (FOUNDATION)
 *
 * - copyToClipboard
 * - showError / showSuccess
 * - resizeImageFile (for file uploads)
 * - getQueryParam
 */

(function (global) {

  /* ============================================================
   * Clipboard
   * ============================================================ */
  async function copyToClipboard(text, btnEl) {
    const originalText = btnEl ? btnEl.textContent : null;
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      // Fallback for older browsers / strict webviews
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e) { alert('คัดลอกไม่ได้: ' + text); }
      document.body.removeChild(ta);
    }
    if (btnEl) {
      btnEl.textContent = '✅ คัดลอกแล้ว';
      setTimeout(() => { btnEl.textContent = originalText; }, 1500);
    }
  }

  /* ============================================================
   * Status display
   * ============================================================ */
  function showError(el, message) {
    if (!el) return;
    el.textContent = message;
    el.classList.remove('success');
    el.classList.add('error');
  }

  function showSuccess(el, message) {
    if (!el) return;
    el.textContent = message;
    el.classList.remove('error');
    el.classList.add('success');
  }

  function clearStatus(el) {
    if (!el) return;
    el.textContent = '';
    el.classList.remove('error', 'success');
  }

  /* ============================================================
   * Query params
   * ============================================================ */
  function getQueryParam(name) {
    const params = new URLSearchParams(window.location.search);
    let val = params.get(name);
    if (val !== null) return val;

    // Check liff.state nested query
    const liffState = params.get('liff.state');
    if (liffState && liffState.includes('?')) {
      const inner = new URLSearchParams(liffState.substring(liffState.indexOf('?') + 1));
      val = inner.get(name);
      if (val !== null) return val;
    }
    return null;
  }

  /* ============================================================
   * Image resize (for uploads)
   * Returns base64 string (no data: prefix)
   * ============================================================ */
  async function resizeImageFile(file, maxDim, quality) {
    maxDim = maxDim || 1200;
    quality = quality || 0.82;

    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('read_failed'));
      reader.readAsDataURL(file);
    });

    return await resizeDataUrl(dataUrl, maxDim, quality);
  }

  async function resizeDataUrl(dataUrl, maxDim, quality) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const ratio = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.round(img.width * ratio);
        const h = Math.round(img.height * ratio);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('image_load_failed'));
      img.src = dataUrl;
    });
  }

  function dataUrlToBase64(dataUrl) {
    const idx = dataUrl.indexOf(',');
    return idx >= 0 ? dataUrl.substring(idx + 1) : dataUrl;
  }

  /* ============================================================
   * Error code → Thai message
   * ============================================================ */
  const ERROR_MESSAGES = {
    network_error: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง',
    auth_failed: 'ยืนยันตัวตนไม่สำเร็จ ลองออกแล้วเข้าใหม่',
    not_paired: 'คุณยังไม่ได้ผูกบัญชี LINE กับระบบ',
    backend_url_not_configured: 'ระบบยังไม่ได้ตั้งค่า backend URL',

    // Pairing
    missing_emp_code: 'กรุณากรอกรหัสพนักงาน',
    missing_fields: 'กรอกข้อมูลให้ครบ',
    invalid_code_format: 'รหัสผูกต้องเป็นตัวเลข 6 หลัก',
    code_not_found_or_expired: 'รหัสไม่ถูกต้อง หรือหมดอายุแล้ว',
    code_emp_code_mismatch: 'รหัสไม่ตรงกับพนักงาน',
    code_expired: 'รหัสหมดอายุแล้ว ติดต่อแอดมินเพื่อขอใหม่',
    already_paired_with_other_emp: 'บัญชี LINE นี้ผูกกับพนักงานคนอื่นแล้ว',
    emp_code_already_paired: 'พนักงานคนนี้ผูก LINE แล้ว ติดต่อแอดมินเพื่อปลดล็อก',
    employee_not_found: 'ไม่พบพนักงานในระบบ ตรวจรหัสอีกครั้ง',
    rate_limit_exceeded: 'พยายามมากเกินไป รอ 15 นาทีแล้วลองใหม่',
    already_paired: 'บัญชี LINE นี้ผูกแล้ว',
    repair_request_already_pending: 'คำขอผูกใหม่ของคุณยังรออนุมัติอยู่',
    missing_reason: 'กรุณาระบุเหตุผล',

    // Roles
    forbidden_visitor_required: 'ไม่มีสิทธิ์เข้าถึง',
    forbidden_staff_required: 'ต้องผูกบัญชีก่อน',
    forbidden_hr_required: 'หน้านี้สำหรับแอดมิน',
    forbidden_owner_required: 'หน้านี้สำหรับเจ้าของระบบเท่านั้น',
  };

  function errorToMessage(errorCode) {
    if (!errorCode) return 'เกิดข้อผิดพลาด';
    // Strip prefix like "network_error: ..."
    const code = errorCode.split(':')[0].trim();
    return ERROR_MESSAGES[code] || errorCode;
  }

  global.Utils = {
    copyToClipboard,
    showError, showSuccess, clearStatus,
    getQueryParam,
    resizeImageFile, resizeDataUrl, dataUrlToBase64,
    errorToMessage,
  };
})(window);
