/**
 * DriveStore.gs — Drive file storage (FOUNDATION)
 *
 * Uploads base64-encoded images to Drive subfolders with
 * anyone-with-link permission, returning a thumbnail URL
 * that LINE Flex can render directly.
 *
 * Folder structure (configured via DRIVE_FOLDER_ID property):
 *   <root>/
 *     evidence/      — leave evidence, OT proof, etc.
 *     selfie/        — check-in selfies
 *     profile/       — user profile photos / ID cards
 *     misc/          — anything else
 */

const DRIVE_SUBFOLDERS = ['evidence', 'selfie', 'profile', 'misc'];

/**
 * Upload a base64 image to Drive.
 * @param {string} base64 - just the base64 part (no data: prefix)
 * @param {string} subfolder - one of DRIVE_SUBFOLDERS
 * @param {string} filenameStem - filename without extension
 * @param {string} mimeType - default 'image/jpeg'
 * @returns {string} thumbnail URL for LINE Flex rendering
 */
function uploadImage(base64, subfolder, filenameStem, mimeType) {
  if (!base64) throw new Error('no_base64_data');

  mimeType = mimeType || 'image/jpeg';
  const ext = mimeType === 'image/png' ? 'png' : 'jpg';
  const ts = Utilities.formatDate(new Date(), TIMEZONE, 'yyyyMMdd-HHmmss');
  const filename = `${_sanitizeFilename_(filenameStem)}-${ts}.${ext}`;

  const folder = _getSubfolder_(subfolder);
  const blob = Utilities.newBlob(Utilities.base64Decode(base64), mimeType, filename);
  const file = folder.createFile(blob);

  // Make accessible to LINE servers
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  const fileId = file.getId();
  return driveUrlToThumbnail_(fileId);
}

/**
 * Convert a Drive file ID to a thumbnail URL.
 * LINE Flex's image component can render this directly.
 */
function driveUrlToThumbnail_(fileId) {
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`;
}

/**
 * Get (and lazily create) a subfolder under the configured root folder.
 */
function _getSubfolder_(subfolder) {
  if (!DRIVE_SUBFOLDERS.includes(subfolder)) {
    throw new Error('invalid_subfolder: ' + subfolder);
  }
  const rootId = getProperty_('DRIVE_FOLDER_ID');
  if (!rootId) throw new Error('drive_folder_id_not_configured');

  const root = DriveApp.getFolderById(rootId);
  const folders = root.getFoldersByName(subfolder);
  if (folders.hasNext()) return folders.next();
  // Auto-create if missing
  return root.createFolder(subfolder);
}

/**
 * Sanitize a string for use as a filename.
 */
function _sanitizeFilename_(name) {
  return String(name || 'file').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);
}

/**
 * Test that Drive access works. Run from Apps Script editor.
 */
function testDriveAccess() {
  const rootId = getProperty_('DRIVE_FOLDER_ID');
  console.log('DRIVE_FOLDER_ID:', rootId || '(not set)');
  if (!rootId) return { ok: false, error: 'not_configured' };

  try {
    const root = DriveApp.getFolderById(rootId);
    console.log('Root folder:', root.getName());
    DRIVE_SUBFOLDERS.forEach(sub => {
      const folder = _getSubfolder_(sub);
      console.log('  ' + sub + ': ' + folder.getId());
    });
    return { ok: true, root: root.getName() };
  } catch (err) {
    console.error(err);
    return { ok: false, error: String(err.message || err) };
  }
}
