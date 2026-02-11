const config = require('./config');

// Encode URL to base64 URL-safe format
function encodeId(url) {
  return Buffer.from(url)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// Decode base64 URL-safe format to URL
function decodeId(id) {
  let b64 = id.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return Buffer.from(b64, 'base64').toString('utf8');
}

// Debug logger
function debug(...args) {
  if (config.DEBUG) {
    console.log('[DEBUG]', new Date().toISOString(), ...args);
  }
}

// Info logger
function log(...args) {
  console.log('[INFO]', new Date().toISOString(), ...args);
}

// Error logger
function error(...args) {
  console.error('[ERROR]', new Date().toISOString(), ...args);
}

// Format bytes to human readable
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Get category icon
function getCategoryIcon(category) {
  const icons = {
    'Cricket': '🏏',
    'Sports': '⚽',
    'Movies': '🎬',
    'News': '📰',
    'Entertainment': '📺',
    'Music': '🎵',
    'Kids': '👶',
    'Devotional': '🙏',
    'Tamil': '🎭'
  };
  return icons[category] || '📺';
}

// Clean channel name for display
function cleanChannelName(name) {
  return name
    .replace(/^TM:\s*/i, '')
    .replace(/^CRIC\s*\|\|\s*/i, '🏏 ')
    .replace(/^Tamil:\s*/i, '')
    .replace(/^TAMIL:\s*/i, '')
    .replace(/ᴴᴰ/g, ' HD')
    .replace(/ᶠᴴᴰ/g, ' FHD')
    .replace(/⁴ᵏ/g, ' 4K')
    .trim();
}

module.exports = {
  encodeId,
  decodeId,
  debug,
  log,
  error,
  formatBytes,
  getCategoryIcon,
  cleanChannelName
};