/** n8n transports may return JSON objects or a complete SSE response body. */
interface McpReply {
  result?: { isError?: boolean; structuredContent?: Record<string, unknown> };
  error?: { message?: string };
}
export function parseMcpResponse(value: unknown): McpReply {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    if (!('result' in value) && !('error' in value)) throw new TypeError('Missing MCP result');
    return value as McpReply;
  }
  if (typeof value !== 'string' || value.length > 2 * 1024 * 1024)
    throw new TypeError('Invalid or oversized MCP response');
  try {
    const json = JSON.parse(value);
    if (json && typeof json === 'object' && !Array.isArray(json) && ('result' in json || 'error' in json)) return json;
  } catch { /* Try the complete SSE frames below. */ }
  const messages: McpReply[] = [];
  for (const frame of value.replace(/\r\n/g, '\n').split('\n\n')) {
    const data = frame.split('\n').filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).trimStart()).join('\n');
    if (!data) continue;
    try {
      const json = JSON.parse(data);
      if (json && typeof json === 'object' && !Array.isArray(json)
          && ('result' in json || 'error' in json)) messages.push(json);
    } catch { /* Ignore non-result event frames. */ }
  }
  if (messages.length !== 1) throw new TypeError('Missing or ambiguous MCP result');
  return messages[0];
}

export function eraseRectangle(values: unknown[], width: number, height: number): Record<string, number> {
  if (values.every(value => value === undefined || value === null || value === '')) return {};
  if (values.length !== 4 || !values.every(value => Number.isSafeInteger(value)))
    throw new TypeError('Provide all four integer rectangle coordinates');
  const [x1, y1, x2, y2] = values as number[];
  if (!(0 <= x1 && x1 < x2 && x2 <= width && 0 <= y1 && y1 < y2 && y2 <= height))
    throw new TypeError('Rectangle must lie within the video');
  return { x1, y1, x2, y2 };
}
