import type { IDataObject, IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

const ENDPOINT = 'https://www.550wai.cn/mcp/global';
const AUTH = 'fiftyWOAuth2Api';

// This node has paid operations; exposing them as AI Tools would let the model
// set confirmCharge without a human-configured workflow step.
// eslint-disable-next-line @n8n/community-nodes/node-usable-as-tool
export class FiftyW implements INodeType {
  description: INodeTypeDescription = {
    displayName: '550W AI Media', name: 'fiftyW',
    icon: 'file:icon.svg', group: ['transform'], version: 1,
    description: 'Query credits and media tasks, or submit image and video watermark removal tasks',
    defaults: { name: '550W AI Media' },
    inputs: [NodeConnectionTypes.Main], outputs: [NodeConnectionTypes.Main],
    // Deliberately omit usableAsTool. An AI Tool could set confirmCharge itself,
    // while paid operations require a human-configured workflow step.
    credentials: [{ name: AUTH, required: true }],
    properties: [
      { displayName: 'Resource', name: 'resource', type: 'options', noDataExpression: true,
        options: [
          { name: 'Account', value: 'account' },
          { name: 'Image', value: 'image' },
          { name: 'Video', value: 'video' },
        ], default: 'account' },
      { displayName: 'Operation', name: 'operation', type: 'options', noDataExpression: true,
        options: [{ name: 'Query Credits', value: 'credits', action: 'Query account credits' }], default: 'credits',
        displayOptions: { show: { resource: ['account'] } } },
      { displayName: 'Operation', name: 'operation', type: 'options', noDataExpression: true,
        options: [
          { name: 'Get Task', value: 'imageTask', action: 'Get an image task' },
          { name: 'Remove Watermark', value: 'imageWatermark', action: 'Remove an image watermark' },
        ], default: 'imageTask', displayOptions: { show: { resource: ['image'] } } },
      { displayName: 'Operation', name: 'operation', type: 'options', noDataExpression: true,
        options: [
          { name: 'Get Subtitle Task', value: 'subtitleTask', action: 'Get a subtitle task' },
          { name: 'Remove Watermark From Share URL', value: 'videoWatermark', action: 'Remove a video watermark' },
          { name: 'Submit Subtitle Task From Direct URL', value: 'subtitleUrl', action: 'Submit a subtitle task' },
          { name: 'Submit Subtitle Task From Uploaded Video', value: 'subtitleMedia', action: 'Submit an uploaded subtitle task' },
          { name: 'Upload Video', value: 'videoUpload', action: 'Upload a video for subtitle removal' },
        ], default: 'subtitleTask', displayOptions: { show: { resource: ['video'] } } },
      { displayName: 'Image Task ID', name: 'taskId', type: 'string', default: '', required: true,
        displayOptions: { show: { operation: ['imageTask', 'subtitleTask'] } } },
      { displayName: 'Input Binary Field', name: 'binaryField', type: 'string', default: 'data', required: true,
        description: 'Name of the input item binary field containing one image or video',
        displayOptions: { show: { operation: ['imageWatermark', 'videoUpload'] } } },
      { displayName: 'Media ID', name: 'mediaId', type: 'string', default: '', required: true,
        description: 'Media ID from the Upload Video operation, valid for two hours',
        displayOptions: { show: { operation: ['subtitleMedia'] } } },
      { displayName: 'Video Share URL', name: 'videoUrl', type: 'string', default: '', required: true,
        displayOptions: { show: { operation: ['videoWatermark'] } } },
      { displayName: 'Public Video URL', name: 'subtitleVideoUrl', type: 'string', default: '', required: true,
        description: 'Public HTTPS direct video URL, not a local file or a short-video share link',
        displayOptions: { show: { operation: ['subtitleUrl'] } } },
      { displayName: 'Video Width', name: 'width', type: 'number', default: 0, required: true,
        description: 'Actual probed video width in pixels; do not guess',
        displayOptions: { show: { operation: ['subtitleUrl', 'subtitleMedia'] } } },
      { displayName: 'Video Height', name: 'height', type: 'number', default: 0, required: true,
        description: 'Actual probed video height in pixels; do not guess',
        displayOptions: { show: { operation: ['subtitleUrl', 'subtitleMedia'] } } },
      { displayName: 'Video Duration', name: 'duration', type: 'number', default: 0, required: true,
        description: 'Actual probed duration in whole seconds; maximum 600',
        displayOptions: { show: { operation: ['subtitleUrl', 'subtitleMedia'] } } },
      { displayName: 'Operation ID', name: 'operationId', type: 'string', default: '', required: true,
        description: 'Supply a stable ID of 8–64 letters, digits, dot, underscore, colon or hyphen. Reuse it after a timeout to avoid duplicate charges.',
        displayOptions: { show: { operation: ['imageWatermark', 'videoWatermark'] } } },
      { displayName: 'Idempotency Key', name: 'idempotencyKey', type: 'string', default: '', required: true,
        description: 'Stable 8–128 character key. Retry with the same key and input after a timeout.',
        displayOptions: { show: { operation: ['subtitleUrl', 'subtitleMedia'] } } },
      { displayName: 'I Confirm the Credit Charge', name: 'confirmCharge', type: 'boolean', default: false,
        description: 'Whether to submit a paid task. Images currently cost 10 credits; short-video watermarks cost 1; subtitle tasks use the estimated price.',
        displayOptions: { show: { operation: ['imageWatermark', 'videoWatermark', 'subtitleUrl', 'subtitleMedia'] } } },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const input = this.getInputData();
    const output: INodeExecutionData[] = [];
    for (let index = 0; index < input.length; index++) {
      try {
        const operation = this.getNodeParameter('operation', index) as string;
        const tool = operation === 'credits' ? 'query_credits'
          : operation === 'imageTask' ? 'get_image_watermark_task'
            : operation === 'subtitleTask' ? 'get_subtitle_task'
              : 'remove_video_watermark';
        const invoke = async (name: string, args: Record<string, unknown> = {}): Promise<Record<string, unknown>> => {
          const response = await this.helpers.httpRequestWithAuthentication.call(this, AUTH, {
            method: 'POST', url: ENDPOINT, json: true,
            headers: { Accept: 'application/json, text/event-stream',
              'MCP-Protocol-Version': '2025-11-25' },
            body: { jsonrpc: '2.0', id: `${Date.now()}-${index}`,
              method: 'tools/call', params: { name, arguments: args } },
          });
          if (response.error || response.result?.isError) {
            const detail = response.result?.structuredContent || {};
            throw new NodeOperationError(this.getNode(),
              String(detail.message || detail.errorCode || response.error?.message || '550W tool failed.'),
              { itemIndex: index });
          }
          return response.result?.structuredContent || {};
        };
        let args: Record<string, unknown> = {};
        if (operation === 'imageTask' || operation === 'subtitleTask') {
          args = { taskId: this.getNodeParameter('taskId', index) as string };
        } else if (operation === 'subtitleUrl' || operation === 'subtitleMedia') {
          if (this.getNodeParameter('confirmCharge', index) !== true)
            throw new NodeOperationError(this.getNode(), 'Confirm the estimated credit charge before submitting.',
              { itemIndex: index });
          const idempotencyKey = this.getNodeParameter('idempotencyKey', index) as string;
          const videoUrl = operation === 'subtitleUrl'
            ? this.getNodeParameter('subtitleVideoUrl', index) as string : '';
          const mediaId = operation === 'subtitleMedia'
            ? this.getNodeParameter('mediaId', index) as string : '';
          const width = this.getNodeParameter('width', index) as number;
          const height = this.getNodeParameter('height', index) as number;
          const duration = this.getNodeParameter('duration', index) as number;
          if (!/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)
              || (operation === 'subtitleUrl' && !videoUrl.startsWith('https://'))
              || (operation === 'subtitleMedia' && !/^[0-9a-f-]{36}$/.test(mediaId))
              || ![width, height, duration].every(value => Number.isSafeInteger(value) && value > 0))
            throw new NodeOperationError(this.getNode(), 'Provide a stable key, valid video source and actual video dimensions.',
              { itemIndex: index });
          const quote = await invoke('estimate_subtitle_cost', { width, height, duration });
          if (quote.enoughCredits !== true)
            throw new NodeOperationError(this.getNode(), 'Insufficient 550W credits for this subtitle task.',
              { itemIndex: index });
          const submitted = await invoke('submit_subtitle_task',
            { ...(operation === 'subtitleUrl' ? { videoUrl } : { mediaId }),
              width, height, duration, idempotencyKey });
          output.push({ json: { ...submitted as IDataObject, estimatedCredits: Number(quote.estimatedCredits) },
            pairedItem: index });
          continue;
        } else if (operation === 'videoWatermark' || operation === 'imageWatermark' || operation === 'videoUpload') {
          if (operation !== 'videoUpload' && this.getNodeParameter('confirmCharge', index) !== true)
            throw new NodeOperationError(this.getNode(), 'Confirm the credit charge before submitting.', { itemIndex: index });
          const operationId = operation === 'videoUpload' ? ''
            : this.getNodeParameter('operationId', index) as string;
          if (operation !== 'videoUpload' && !/^[A-Za-z0-9._:-]{8,64}$/.test(operationId))
            throw new NodeOperationError(this.getNode(), 'Operation ID must contain 8–64 safe characters.', { itemIndex: index });
          if (operation === 'videoWatermark')
            args = { videoUrl: this.getNodeParameter('videoUrl', index) as string, operationId };
          else {
            const binaryField = this.getNodeParameter('binaryField', index) as string;
            const binary = this.helpers.assertBinaryData(index, binaryField);
            const buffer = await this.helpers.getBinaryDataBuffer(index, binaryField);
            const video = operation === 'videoUpload';
            const mediaType = video ? 'video' : 'image';
            const allowed = video ? /\.(mp4|mov)$/i.test(binary.fileName || '')
              : ['image/png', 'image/jpeg', 'image/webp'].includes(binary.mimeType || '');
            const maxSize = video ? 200 * 1024 * 1024 : 50 * 1024 * 1024;
            if (!allowed || buffer.length === 0 || buffer.length > maxSize)
              throw new NodeOperationError(this.getNode(), video
                ? 'Use an MP4 or MOV video under 200 MB.' : 'Use a PNG, JPEG or WebP image under 50 MB.',
              { itemIndex: index });
            const prepared = await invoke('prepare_media_upload', { mediaType, fileSize: buffer.length });
            if (!video && prepared.enoughCredits === false)
              throw new NodeOperationError(this.getNode(), 'Insufficient 550W credits.', { itemIndex: index });
            const uploadUrl = String(prepared.uploadUrl || '');
            const uploadTicket = String(prepared.uploadTicket || '');
            const url = new URL(uploadUrl);
            if (url.origin !== 'https://www.550wai.cn' || url.pathname !== `/mcp-media/global/${mediaType}`
                || url.search || url.hash || !uploadTicket)
              throw new NodeOperationError(this.getNode(), 'Invalid 550W upload ticket or destination.', { itemIndex: index });
            const form = new FormData();
            form.append('file', new Blob([new Uint8Array(buffer)], { type: binary.mimeType }),
              binary.fileName || (video ? 'video.mp4' : 'image.png'));
            if (!video) form.append('operationId', operationId);
            const result = await this.helpers.httpRequest({ method: 'POST', url: uploadUrl,
              headers: { 'X-550W-Upload-Ticket': uploadTicket }, body: form, json: true,
              disableFollowRedirect: true });
            if ((!video && result.code !== 200) || (video && !result.mediaId))
              throw new NodeOperationError(this.getNode(), String(result.errorCode || 'Media upload failed.'),
                { itemIndex: index });
            output.push({ json: result as IDataObject, pairedItem: index });
            continue;
          }
        }
        output.push({ json: await invoke(tool, args) as IDataObject, pairedItem: index });
      } catch (error) {
        if (this.continueOnFail()) {
          output.push({ json: { error: error instanceof Error ? error.message : 'Unknown error' },
            pairedItem: index });
        } else {
          throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: index });
        }
      }
    }
    return [output];
  }
}
