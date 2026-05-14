/**
 * Auth.gs — LIFF idToken verification + User_Map lookup (FOUNDATION)
 *
 * verifyIdToken: calls LINE Verify API to validate the idToken from LIFF
 *                and extract the LINE userId.
 * lookupEmpCodeByUserId: maps line_user_id → emp_code via User_Map sheet.
 *
 * Both functions cache results in CacheService for performance.
 */

const VERIFY_API_URL = 'https://api.line.me/oauth2/v2.1/verify';
const VERIFY_CACHE_TTL = 60;       // 1 min — short, the token itself is short-lived
const USER_MAP_CACHE_TTL = 300;    // 5 min

/**
 * Verify a LIFF idToken with LINE's Verify API.
 * @param {string} idToken
 * @returns {{ok: boolean, userId?: string, error?: string}}
 */
function verifyIdToken(idToken) {
  if (!idToken) return { ok: false, error: 'missing_id_token' };

  // Dev/mock token bypass — useful for local testing
  if (idToken === 'mock.id.token.for.local.dev') {
    return { ok: true, userId: 'U_mock_local_dev_1234567890' };
  }

  const cache = CacheService.getScriptCache();
  const cacheKey = 'vit:' + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, idToken)
  );
  const hit = cache.get(cacheKey);
  if (hit) {
    try { return JSON.parse(hit); } catch (_) {}
  }

  const channelId = getProperty_('LINE_CHANNEL_ID');
  if (!channelId) return { ok: false, error: 'channel_id_not_configured' };

  let result;
  try {
    const res = UrlFetchApp.fetch(VERIFY_API_URL, {
      method: 'post',
      payload: { id_token: idToken, client_id: channelId },
      muteHttpExceptions: true,
    });
    const code = res.getResponseCode();
    const body = res.getContentText();
    if (code !== 200) {
      result = { ok: false, error: 'verify_failed_' + code };
    } else {
      const parsed = JSON.parse(body);
      if (parsed.sub) {
        result = { ok: true, userId: parsed.sub };
      } else {
        result = { ok: false, error: 'no_subject_in_token' };
      }
    }
  } catch (err) {
    logError('verifyIdToken', err);
    return { ok: false, error: 'verify_exception' };
  }

  try { cache.put(cacheKey, JSON.stringify(result), VERIFY_CACHE_TTL); } catch (_) {}
  return result;
}

/**
 * Look up emp_code by line_user_id from User_Map.
 * Returns empty string if not found.
 */
function lookupEmpCodeByUserId(userId) {
  if (!userId) return '';

  const cache = CacheService.getScriptCache();
  const cacheKey = 'emp:' + userId;
  const hit = cache.get(cacheKey);
  if (hit !== null) {
    return hit === '__null__' ? '' : hit;
  }

  let empCode = '';
  try {
    const map = readTab_(getPublicSheet_(), 'User_Map');
    const row = map.find(r => String(r.line_user_id) === String(userId));
    empCode = row ? String(row.emp_code || '') : '';
  } catch (err) {
    logError('lookupEmpCodeByUserId', err);
    return '';
  }

  try { cache.put(cacheKey, empCode || '__null__', USER_MAP_CACHE_TTL); } catch (_) {}
  return empCode;
}

/**
 * Reverse lookup: emp_code → line_user_id.
 */
function lookupUserIdByEmpCode(empCode) {
  if (!empCode) return '';

  const cache = CacheService.getScriptCache();
  const cacheKey = 'uid:' + empCode;
  const hit = cache.get(cacheKey);
  if (hit !== null) {
    return hit === '__null__' ? '' : hit;
  }

  let userId = '';
  try {
    const map = readTab_(getPublicSheet_(), 'User_Map');
    const row = map.find(r => String(r.emp_code) === String(empCode));
    userId = row ? String(row.line_user_id || '') : '';
  } catch (err) {
    logError('lookupUserIdByEmpCode', err);
    return '';
  }

  try { cache.put(cacheKey, userId || '__null__', USER_MAP_CACHE_TTL); } catch (_) {}
  return userId;
}

/**
 * Invalidate caches related to a user mapping.
 * Call after pair / unpair / role change.
 */
function invalidateUserMapCache_(userId, empCode) {
  try {
    const cache = CacheService.getScriptCache();
    if (userId) cache.remove('emp:' + userId);
    if (empCode) cache.remove('uid:' + empCode);
  } catch (_) {}
}
