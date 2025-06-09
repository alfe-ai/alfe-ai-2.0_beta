export function extractProductUrl(log = '') {
  if (!log) return null;
  const matches = [...log.matchAll(/Product URL:\s*(https?:\/\/\S+)/i)];
  const m = matches[matches.length - 1];
  return m ? m[1].trim() : null;
}
