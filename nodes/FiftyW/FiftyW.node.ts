import { MossAi } from '../../shared/legacy-node';
// Stable public identity; share execution with the legacy node without duplicating business logic.
export class FiftyW extends MossAi {
  constructor() {
    super();
    this.description = { ...this.description, name: 'fiftyW',
      displayName: '550W AI Subtitle & Watermark Remover',
      icon: { light: 'file:icon.svg', dark: 'file:icon.svg' },
      credentials: [{ name: 'fiftyWOAuth2Api', required: true }] };
  }
}
