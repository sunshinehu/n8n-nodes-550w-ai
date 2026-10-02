import type { IDataObject, IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError, UnexpectedError } from 'n8n-workflow';

export const ENDPOINT = 'https://www.550wai.cn/media-api/global/v1';
const CREDENTIAL_TYPE = 'mossAiOAuth2Api';
const PAID = ['imageWatermark', 'videoErase', 'videoWatermark', 'subtitleUrl'];
const READ = ['credits', 'imageTask', 'subtitleTask', 'receipt'];
export function parseResponse(raw: unknown): IDataObject {
  const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new UnexpectedError('Invalid 550W response.');
  const data = value as IDataObject;
  if (typeof data.code !== 'number') throw new UnexpectedError('Missing 550W response code.');
  if (data.code !== 200) throw new UnexpectedError(String(data.errorCode || data.message || '550W request failed.'));
  return data;
}
export function selectedArea(values: unknown[]): number[] {
  if (values.length !== 4 || !values.every(v => Number.isSafeInteger(v) && Number(v) >= 0 && Number(v) <= 99999)
      || Number(values[2]) <= Number(values[0]) || Number(values[3]) <= Number(values[1]))
    throw new UnexpectedError('Specify a valid pixel rectangle: x1,y1,x2,y2.');
  return values as number[];
}
export class MossAi implements INodeType {
  description: INodeTypeDescription = {
    displayName: '550W Watermark & Text Eraser', name: 'mossAi',
    icon: { light: 'file:icon.svg', dark: 'file:icon.svg' }, group: ['transform'], version: [1, 2],
    subtitle: '={{$parameter["operation"]}}',
    description: 'Erase image watermarks and video text, or resolve platform share links',
    defaults: { name: '550W Watermark & Text Eraser' },
    inputs: [NodeConnectionTypes.Main], outputs: [NodeConnectionTypes.Main],
    usableAsTool: { replacements: {
      description: 'Read credits, task status or an existing operation receipt. Paid actions are rejected in AI Tool execution.',
    } }, credentials: [{ name: CREDENTIAL_TYPE, required: true }],
    properties: [
      { displayName: 'Resource', name: 'resource', type: 'options', noDataExpression: true,
        options: [{ name: 'Account', value: 'account' }, { name: 'Image', value: 'image' },
          { name: 'Operation Receipt', value: 'receipt' }, { name: 'Video', value: 'video' }], default: 'account' },
      ...[
        { resource: 'account', options: [{ name: 'Get Account Credits', value: 'credits', action: 'Get account credits' }] },
        { resource: 'image', options: [{ name: 'Get Image Task', value: 'imageTask', action: 'Get an image task' },
          { name: 'Remove Image Watermark', value: 'imageWatermark', action: 'Remove an image watermark' }] },
        { resource: 'receipt', options: [{ name: 'Get Operation Receipt', value: 'receipt', action: 'Get an operation receipt' }] },
        { resource: 'video', options: [
          { name: 'Get Video Task', value: 'subtitleTask', action: 'Get a video task' },
          { name: 'Remove Platform Watermark From Share Link', value: 'videoWatermark', action: 'Resolve a video share link' },
          { name: 'Remove Video Text From Binary File', value: 'videoErase', action: 'Remove text from a video file' },
          { name: 'Remove Video Text From Direct URL', value: 'subtitleUrl', action: 'Remove text from a video URL' },
        ] },
      ].map(group => ({ displayName: 'Operation', name: 'operation', type: 'options' as const, noDataExpression: true,
        options: group.options, default: group.options[0].value, displayOptions: { show: { resource: [group.resource] } } })),
      { displayName: 'Task ID', name: 'taskId', type: 'string', default: '', required: true,
        displayOptions: { show: { operation: ['imageTask', 'subtitleTask'] } } },
      { displayName: 'Operation ID', name: 'operationId', type: 'string', default: '', required: true,
        description: 'Stable 8–64 character ID. Query its receipt after a timeout before retrying the same input.',
        displayOptions: { show: { operation: [...PAID, 'receipt'] } } },
      { displayName: 'Input Binary Field', name: 'binaryField', type: 'string', default: 'data', required: true,
        displayOptions: { show: { operation: ['imageWatermark', 'videoErase'] } } },
      { displayName: 'Video Share URL', name: 'videoUrl', type: 'string', default: '', required: true,
        description: 'TikTok or X share link copied from the app or website',
        displayOptions: { show: { operation: ['videoWatermark'] } } },
      { displayName: 'Public Video URL', name: 'subtitleVideoUrl', type: 'string', default: '', required: true,
        description: 'Public HTTPS direct MP4 or MOV link, not a platform share link',
        displayOptions: { show: { operation: ['subtitleUrl'] } } },
      { displayName: 'I Approve Upload and Credit Usage', name: 'confirmCharge', type: 'boolean', default: false,
        description: 'Whether to send the selected media to 550W and submit a paid processing task',
        displayOptions: { show: { operation: PAID } } },
      { displayName: 'Advanced: Erase Region', name: 'eraseRegion', type: 'options', default: 'full',
        options: [{ name: 'Full Frame', value: 'full' }, { name: 'Pixel Rectangle', value: 'rectangle' }],
        displayOptions: { show: { operation: ['subtitleUrl', 'videoErase'] } } },
      ...['x1', 'y1', 'x2', 'y2'].map(name => ({
        displayName: name.toUpperCase(), name, type: 'number' as const, default: 0,
        displayOptions: { show: { operation: ['subtitleUrl', 'videoErase'], eraseRegion: ['rectangle'] } },
      })),
    ],
  };
  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const output: INodeExecutionData[] = [];
    for (let index = 0; index < this.getInputData().length; index++) {
      let operationId = '';
      let submitted = false;
      try {
        const operation = String(this.getNodeParameter('operation', index));
        if (PAID.includes(operation) && this.getNode().typeVersion === 1)
          throw new UnexpectedError('Upgrade this node to version 2 and reconnect REST OAuth before submitting a paid task.');
        if (this.getNode().type.endsWith('Tool') && !READ.includes(operation)) throw new UnexpectedError('AI Tool usage is limited to read-only operations.');
        if (['videoUpload', 'subtitleMedia'].includes(operation)) throw new UnexpectedError('Legacy MCP upload workflows must migrate to Remove Video Text From Binary File and reconnect OAuth.');
        const request = async (path: string, body?: IDataObject) =>
          parseResponse(await this.helpers.httpRequestWithAuthentication.call(this, CREDENTIAL_TYPE, {
            method: body ? 'POST' : 'GET', url: ENDPOINT + path, json: true,
            ...(body ? { body } : {}), disableFollowRedirect: true, timeout: 60000,
          }));
        let result: IDataObject;
        if (operation === 'credits') result = await request('/account');
        else if (['imageTask', 'subtitleTask'].includes(operation)) {
          const task = String(this.getNodeParameter('taskId', index));
          if (!/^[A-Za-z0-9._:-]{1,64}$/.test(task)) throw new UnexpectedError('Invalid task ID.');
          result = await request('/tasks/' + (operation === 'imageTask' ? 'image' : 'video') + '/' + encodeURIComponent(task));
        } else {
          if (![...PAID, 'receipt'].includes(operation)) throw new UnexpectedError('Unsupported operation.');
          operationId = String(this.getNodeParameter('operationId', index));
          if (!/^[A-Za-z0-9._:-]{8,64}$/.test(operationId)) throw new UnexpectedError('Operation ID must contain 8–64 safe characters.');
          if (operation === 'receipt') result = await request('/operations/' + encodeURIComponent(operationId));
          else {
            if (this.getNodeParameter('confirmCharge', index) !== true) throw new UnexpectedError('Approve upload and credit usage before submitting.');
            const area = ['subtitleUrl', 'videoErase'].includes(operation)
              && this.getNodeParameter('eraseRegion', index, 'full') === 'rectangle'
              ? selectedArea(['x1', 'y1', 'x2', 'y2'].map(n => this.getNodeParameter(n, index))) : undefined;
            if (['videoWatermark', 'subtitleUrl'].includes(operation)) {
              const sourceUrl = String(this.getNodeParameter(operation === 'videoWatermark' ? 'videoUrl' : 'subtitleVideoUrl', index));
              const url = new URL(sourceUrl);
              if (url.protocol !== 'https:' || url.username || url.password) throw new UnexpectedError('Use a public HTTPS media link.');
              submitted = true;
              result = await request('/media', { operationId, mediaType: operation === 'videoWatermark' ? 'share' : 'video',
                sourceUrl, ...(area ? { area } : {}) });
            } else {
              const field = String(this.getNodeParameter('binaryField', index));
              const binary = this.helpers.assertBinaryData(index, field);
              const video = operation === 'videoErase';
              const limit = (video ? 200 : 50) * 1024 * 1024;
              const allowed = video ? /\.(mp4|mov)$/i.test(binary.fileName || '')
                : ['image/png', 'image/jpeg', 'image/webp'].includes(binary.mimeType || '');
              if (!allowed) throw new UnexpectedError('Use PNG/JPEG/WebP images or MP4/MOV videos.');
              const filename = video ? (/\.mov$/i.test(binary.fileName || '') ? 'video.mov' : 'video.mp4')
                : (binary.mimeType === 'image/jpeg' ? 'image.jpg' : binary.mimeType === 'image/webp' ? 'image.webp' : 'image.png');
              let size: number;
              let uploadTicket = '';
              let source: Awaited<ReturnType<IExecuteFunctions['helpers']['getBinaryStream']>>;
              if (binary.id) {
                size = (await this.helpers.getBinaryMetadata(binary.id)).fileSize;
                if (!Number.isSafeInteger(size) || size <= 0 || size > limit) throw new UnexpectedError('Invalid media size or upload size limit exceeded.');
                const ticket = await request('/upload-ticket', {});
                uploadTicket = String(ticket.ticket || '');
                if (!/^[0-9a-f-]{72}$/.test(uploadTicket)) throw new UnexpectedError('Invalid media upload ticket.');
                source = await this.helpers.getBinaryStream(binary.id);
              } else {
                if (typeof binary.data === 'string' && binary.data.length > Math.ceil(limit / 3) * 4) throw new UnexpectedError('Upload size limit exceeded.');
                const buffer = await this.helpers.getBinaryDataBuffer(index, field);
                size = buffer.length;
                if (!size || size > limit) throw new UnexpectedError('Upload size limit exceeded.');
                const form = new FormData();
                form.append('operationId', operationId);
                form.append('mediaType', video ? 'video' : 'image');
                if (area) form.append('area', area.join(','));
                form.append('file', new Blob([new Uint8Array(buffer)], { type: binary.mimeType }), filename);
                const ticket = await request('/upload-ticket', {});
                uploadTicket = String(ticket.ticket || '');
                if (!/^[0-9a-f-]{72}$/.test(uploadTicket)) throw new UnexpectedError('Invalid media upload ticket.');
                submitted = true;
                result = parseResponse(await this.helpers.httpRequest({
                  method: 'POST', url: ENDPOINT + '/media', body: form, json: true,
                  headers: { 'X-550W-Upload-Ticket': uploadTicket },
                  disableFollowRedirect: true, timeout: 600000,
                }));
                output.push({ json: result, pairedItem: index });
                continue;
              }
              const boundary = '550w-' + Date.now() + '-' + Math.random().toString(16).slice(2);
              const fields: Record<string, string> = { operationId, mediaType: video ? 'video' : 'image', ...(area ? { area: area.join(',') } : {}) };
              const prefix = Buffer.from(Object.entries(fields).map(([key, value]) =>
                '--' + boundary + '\r\nContent-Disposition: form-data; name="' + key + '"\r\n\r\n' + value + '\r\n').join('')
                + '--' + boundary + '\r\nContent-Disposition: form-data; name="file"; filename="' + filename + '"\r\nContent-Type: application/octet-stream\r\n\r\n');
              const suffix = Buffer.from('\r\n--' + boundary + '--\r\n');
              const factory = source.constructor as unknown as { from(input: AsyncIterable<Buffer>): typeof source };
              if (typeof factory.from !== 'function') { source.destroy(); throw new UnexpectedError('Binary provider cannot compose an upload stream.'); }
              const body = factory.from((async function* () {
                yield prefix;
                let received = 0;
                for await (const chunk of source) {
                  received += Buffer.byteLength(chunk);
                  if (received > size) throw new UnexpectedError('Media stream exceeds declared size.');
                  yield chunk;
                }
                if (received !== size) throw new UnexpectedError('Media stream is incomplete.');
                yield suffix;
              })());
              try {
                submitted = true;
                result = parseResponse(await this.helpers.httpRequest({
                  method: 'POST', url: ENDPOINT + '/media',
                  headers: { 'Content-Type': 'multipart/form-data; boundary=' + boundary,
                    'X-550W-Upload-Ticket': uploadTicket, 'Content-Length': prefix.length + size + suffix.length },
                  body: body as unknown as Buffer, json: false, disableFollowRedirect: true, timeout: 600000,
                }));
              } finally { body.destroy(); source.destroy(); }
            }
          }
        }
        output.push({ json: result, pairedItem: index });
      } catch (error) {
        // No automatic retry: transport failure is not proof that submission failed.
        const message = (error instanceof Error ? error.message : '550W request failed.')
          + (submitted ? ' Query operation receipt ' + operationId + ' before retrying; the task may already exist.' : '');
        if (this.continueOnFail()) output.push({ json: { error: message, ...(submitted ? { operationId, submissionStatus: 'unknown' } : {}) }, pairedItem: index });
        else throw new NodeOperationError(this.getNode(), message, { itemIndex: index });
      }
    }
    return [output];
  }
}
