export function stripPrefix(str: string, prefix: string): string {
  if (str.startsWith(prefix)) {
    return str.slice(prefix.length)
  }
  return str;
}

export function stripSuffix(str: string, suffix: string): string {
  if (str.endsWith(suffix)) {
    return str.slice(0, -suffix.length)
  }
  return str;
}

// TODO: improve
export function cleanReferrer(referrer: string) {
  if (!referrer) {
    return "unknown";  // fallback
  }
  referrer = stripPrefix(referrer, 'https://')
  referrer = stripPrefix(referrer, 'http://')
  referrer = stripSuffix(referrer, '.siasky.net')
  referrer = stripSuffix(referrer, '/')
  return referrer;
}