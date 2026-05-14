/**
 * WebApp.gs — LINE webhook event handler (FOUNDATION)
 *
 * Receives webhook events from LINE Messaging API.
 * Routes by event type:
 *   - message (text)    → _handleTextMessage
 *   - postback          → _handlePostback (Flex button clicks)
 *   - follow / unfollow → _handleFollow / _handleUnfollow
 *
 * Postback data format: 'action=<name>&key=value&...'
 */

function handleLineWebhook_(request) {
  if (!request.events) return;

  request.events.forEach(event => {
    try {
      switch (event.type) {
        case 'message':
          if (event.message && event.message.type === 'text') {
            _handleTextMessage_(event);
          }
          break;
        case 'postback':
          _handlePostback_(event);
          break;
        case 'follow':
          _handleFollow_(event);
          break;
        case 'unfollow':
          _handleUnfollow_(event);
          break;
      }
    } catch (err) {
      logError('handleLineWebhook_::' + event.type, err, event);
    }
  });
}

/* ============================================================
 * Text message handler
 * ============================================================ */

function _handleTextMessage_(event) {
  const userId = event.source && event.source.userId;
  const text = (event.message.text || '').trim();
  const replyToken = event.replyToken;

  if (!userId || !text) return;

  // Command: /myid — show LINE userId (useful for owner bootstrap)
  if (text === '/myid' || text === '/id' || text === '/ฉัน') {
    replyText(replyToken,
      'LINE User ID ของคุณคือ:\n\n' + userId + '\n\n' +
      '(ส่ง ID นี้ให้แอดมินเพื่อเพิ่มสิทธิ์)');
    return;
  }

  // Command: /pair — show pairing link
  if (text === '/pair' || text === '/ลงทะเบียน' || text === '/ผูก') {
    const liffId = getProperty_('LIFF_ID');
    if (liffId) {
      replyText(replyToken,
        'ผูกบัญชี LINE ของคุณกับระบบ:\n\n' +
        `https://liff.line.me/${liffId}?p=pair\n\n` +
        'แตะลิงก์เพื่อเริ่ม');
    } else {
      replyText(replyToken, 'ระบบยังไม่ได้ตั้งค่า LIFF');
    }
    return;
  }

  // Project-specific commands go in _projectTextCommand_ (optional hook)
  try {
    if (typeof _projectTextCommand_ === 'function') {
      const handled = _projectTextCommand_(event);
      if (handled) return;
    }
  } catch (err) {
    logError('_projectTextCommand_', err);
  }

  // Default response
  // (silent — don't echo every message)
}

/* ============================================================
 * Postback handler
 * ============================================================ */

function _handlePostback_(event) {
  const userId = event.source && event.source.userId;
  const data = event.postback && event.postback.data;
  if (!userId || !data) return;

  const params = _parsePostbackData_(data);
  const action = params.action;

  if (!action) return;

  // Built-in actions
  if (action === 'approve_change' || action === 'reject_change') {
    _handleChangeDecision_(event, params);
    return;
  }

  // Project-specific postbacks
  try {
    if (typeof _projectPostback_ === 'function') {
      _projectPostback_(event, params);
    }
  } catch (err) {
    logError('_projectPostback_', err);
  }
}

function _handleChangeDecision_(event, params) {
  const userId = event.source.userId;
  const changeId = params.change_id;
  const decision = params.decision || (params.action === 'approve_change' ? 'approve' : 'reject');
  const replyToken = event.replyToken;

  if (!changeId) {
    replyText(replyToken, 'ข้อมูล postback ไม่ครบ');
    return;
  }

  // Build context manually (postback doesn't go through doPost)
  const ctx = {
    userId,
    empCode: lookupEmpCodeByUserId(userId),
  };

  try {
    requireRole_(ctx, ROLES.OWNER);
    const fn = decision === 'approve' ? approvePendingChange_ : rejectPendingChange_;
    fn(changeId, ctx, 'via_flex');
    replyText(replyToken, decision === 'approve' ? '✅ อนุมัติแล้ว' : '❌ ปฏิเสธแล้ว');
  } catch (err) {
    replyText(replyToken, '❌ เกิดข้อผิดพลาด: ' + (err.message || err));
  }
}

/* ============================================================
 * Follow / Unfollow
 * ============================================================ */

function _handleFollow_(event) {
  const userId = event.source && event.source.userId;
  if (!userId) return;

  // Assign visitor rich menu (if configured)
  try {
    const menuId = getProperty_('RICHMENU_VISITOR_ID');
    if (menuId) assignRichMenu(userId, menuId);
  } catch (_) {}

  // Welcome message
  const brand = getSetting_('BRAND_NAME', '[BRAND_NAME]');
  const liffId = getProperty_('LIFF_ID');
  const lines = [
    `ยินดีต้อนรับสู่ ${brand}`,
    '',
    'พิมพ์ /pair เพื่อผูกบัญชี',
    'พิมพ์ /myid เพื่อดู LINE ID ของคุณ',
  ];
  if (event.replyToken) {
    replyText(event.replyToken, lines.join('\n'));
  }
}

function _handleUnfollow_(event) {
  const userId = event.source && event.source.userId;
  if (userId) {
    logInfo('_handleUnfollow_', 'User unfollowed', { userId });
    // Note: don't auto-unpair — user may add back. Admin can unpair manually.
  }
}

/* ============================================================
 * Helpers
 * ============================================================ */

function _parsePostbackData_(data) {
  const params = {};
  String(data).split('&').forEach(pair => {
    const idx = pair.indexOf('=');
    if (idx > 0) {
      const k = decodeURIComponent(pair.substring(0, idx));
      const v = decodeURIComponent(pair.substring(idx + 1));
      params[k] = v;
    }
  });
  return params;
}
