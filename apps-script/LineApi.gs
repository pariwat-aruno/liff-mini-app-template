/**
 * LineApi.gs — LINE Messaging API helpers (FOUNDATION)
 *
 * Functions:
 *   pushText / pushFlex / pushMessage  — send to specific user
 *   replyText / replyFlex / replyMessage — reply to webhook event
 *   pushToAllOwners                    — broadcast to OWNER role
 *   assignRichMenu                     — switch user's rich menu
 *
 * All functions retry with exponential backoff on 429/5xx.
 */

const LINE_PUSH_URL = 'https://api.line.me/v2/bot/message/push';
const LINE_REPLY_URL = 'https://api.line.me/v2/bot/message/reply';
const LINE_RICH_MENU_LINK_URL = 'https://api.line.me/v2/bot/user/{userId}/richmenu/{richMenuId}';

/* ============================================================
 * Push (to specific user)
 * ============================================================ */

function pushText(userId, text) {
  return pushMessage(userId, [{ type: 'text', text: String(text).substring(0, 5000) }]);
}

function pushFlex(userId, altText, contents) {
  return pushMessage(userId, [{
    type: 'flex',
    altText: String(altText).substring(0, 400),
    contents,
  }]);
}

function pushMessage(userId, messages) {
  if (!userId) return { ok: false, error: 'missing_user_id' };
  if (!messages || !messages.length) return { ok: false, error: 'no_messages' };

  const token = getProperty_('LINE_CHANNEL_ACCESS_TOKEN');
  if (!token) return { ok: false, error: 'token_not_configured' };

  return _lineApiCall_(LINE_PUSH_URL, {
    to: userId,
    messages: messages.slice(0, 5),
  }, token);
}

/* ============================================================
 * Reply (to webhook event)
 * ============================================================ */

function replyText(replyToken, text) {
  return replyMessage(replyToken, [{ type: 'text', text: String(text).substring(0, 5000) }]);
}

function replyFlex(replyToken, altText, contents) {
  return replyMessage(replyToken, [{
    type: 'flex',
    altText: String(altText).substring(0, 400),
    contents,
  }]);
}

function replyMessage(replyToken, messages) {
  if (!replyToken) return { ok: false, error: 'missing_reply_token' };
  const token = getProperty_('LINE_CHANNEL_ACCESS_TOKEN');
  if (!token) return { ok: false, error: 'token_not_configured' };

  return _lineApiCall_(LINE_REPLY_URL, {
    replyToken,
    messages: messages.slice(0, 5),
  }, token);
}

/* ============================================================
 * Broadcast to all owners
 * ============================================================ */

function pushToAllOwners(messages) {
  const ownerIds = _collectOwnerUserIds_();
  if (ownerIds.length === 0) {
    logWarn('pushToAllOwners', 'no_owners_found');
    return { ok: false, error: 'no_owners' };
  }
  const results = [];
  ownerIds.forEach(uid => {
    results.push({ userId: uid, result: pushMessage(uid, messages) });
  });
  return { ok: true, results };
}

function _collectOwnerUserIds_() {
  const ids = new Set();
  // Bootstrap owners from Script Properties
  getOwnerUserIds_().forEach(id => ids.add(id));
  // Owners from User_Map
  try {
    const map = readTab_(getPublicSheet_(), 'User_Map');
    map.forEach(row => {
      if (String(row.role || '').toLowerCase() === ROLES.OWNER) {
        ids.add(String(row.line_user_id));
      }
    });
  } catch (err) {
    logError('_collectOwnerUserIds_', err);
  }
  return Array.from(ids);
}

/* ============================================================
 * Rich Menu
 * ============================================================ */

function assignRichMenu(userId, richMenuId) {
  if (!userId || !richMenuId) return { ok: false, error: 'missing_params' };
  const token = getProperty_('LINE_CHANNEL_ACCESS_TOKEN');
  if (!token) return { ok: false, error: 'token_not_configured' };

  const url = LINE_RICH_MENU_LINK_URL
    .replace('{userId}', userId)
    .replace('{richMenuId}', richMenuId);

  try {
    const res = UrlFetchApp.fetch(url, {
      method: 'post',
      headers: { 'Authorization': 'Bearer ' + token },
      muteHttpExceptions: true,
    });
    const code = res.getResponseCode();
    if (code >= 200 && code < 300) return { ok: true };
    return { ok: false, error: 'http_' + code, body: res.getContentText() };
  } catch (err) {
    logError('assignRichMenu', err);
    return { ok: false, error: String(err.message || err) };
  }
}

/* ============================================================
 * Common Flex card builders (templates can extend)
 * ============================================================ */

/**
 * Build a generic approval Flex card with Approve/Reject buttons.
 * Used by pending_changes pattern.
 */
function buildApprovalFlex(title, lines, postbackData) {
  const bodyContents = [
    { type: 'text', text: title, weight: 'bold', size: 'lg', wrap: true },
    { type: 'separator', margin: 'md' },
  ];
  lines.forEach(line => {
    bodyContents.push({
      type: 'box', layout: 'baseline', margin: 'md',
      contents: [
        { type: 'text', text: line.label, size: 'sm', color: '#888888', flex: 2 },
        { type: 'text', text: String(line.value), size: 'sm', wrap: true, flex: 5 },
      ],
    });
  });
  return {
    type: 'bubble',
    body: { type: 'box', layout: 'vertical', contents: bodyContents },
    footer: {
      type: 'box', layout: 'horizontal', spacing: 'sm',
      contents: [
        {
          type: 'button', style: 'primary', color: '#0F6E56',
          action: { type: 'postback', label: 'อนุมัติ', data: postbackData + '&decision=approve' },
        },
        {
          type: 'button', style: 'primary', color: '#A32D2D',
          action: { type: 'postback', label: 'ปฏิเสธ', data: postbackData + '&decision=reject' },
        },
      ],
    },
  };
}

/**
 * Build a simple info card (no buttons).
 */
function buildInfoFlex(title, lines) {
  const bodyContents = [
    { type: 'text', text: title, weight: 'bold', size: 'lg', wrap: true },
    { type: 'separator', margin: 'md' },
  ];
  lines.forEach(line => {
    bodyContents.push({
      type: 'box', layout: 'baseline', margin: 'md',
      contents: [
        { type: 'text', text: line.label, size: 'sm', color: '#888888', flex: 2 },
        { type: 'text', text: String(line.value), size: 'sm', wrap: true, flex: 5 },
      ],
    });
  });
  return {
    type: 'bubble',
    body: { type: 'box', layout: 'vertical', contents: bodyContents },
  };
}

/* ============================================================
 * Internal: API call with retry
 * ============================================================ */

function _lineApiCall_(url, payload, token) {
  const maxRetries = 3;
  let lastError = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = UrlFetchApp.fetch(url, {
        method: 'post',
        contentType: 'application/json',
        headers: { 'Authorization': 'Bearer ' + token },
        payload: JSON.stringify(payload),
        muteHttpExceptions: true,
      });
      const code = res.getResponseCode();
      if (code >= 200 && code < 300) {
        return { ok: true };
      }
      if (code === 429 || code >= 500) {
        // Retry on rate limit / server error
        lastError = 'http_' + code;
        Utilities.sleep(Math.pow(2, attempt) * 500);
        continue;
      }
      // Other errors: don't retry
      logError('_lineApiCall_', new Error('http_' + code), { body: res.getContentText() });
      return { ok: false, error: 'http_' + code };
    } catch (err) {
      lastError = String(err.message || err);
      logError('_lineApiCall_', err);
      Utilities.sleep(Math.pow(2, attempt) * 500);
    }
  }
  return { ok: false, error: lastError || 'retry_exhausted' };
}
