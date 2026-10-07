export function isTrustedUploadDestination(value: string, mediaType: 'image' | 'video', ticket: string): boolean {
  try {
    const url = new URL(value);
    return url.origin === 'https://www.550wai.cn'
      && url.pathname === `/mcp-media/global/${mediaType}`
      && !url.username && !url.password && !url.search && !url.hash
      && /^[0-9a-f-]{36}$/.test(ticket);
  } catch {
    return false;
  }
}
