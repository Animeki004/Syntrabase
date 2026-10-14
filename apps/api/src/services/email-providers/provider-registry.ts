import { EmailProviderType } from '@syntrabase/shared-types';
import { IEmailProviderAdapter } from './email-provider.interface.js';
import { BrevoEmailProvider } from './brevo.provider.js';
import { MockEmailProvider } from './mock.provider.js';

const brevoInstance = new BrevoEmailProvider();
const mockInstance = new MockEmailProvider();

export class EmailProviderRegistry {
  private static customProviders = new Map<string, IEmailProviderAdapter>();

  public static registerCustomProvider(adapter: IEmailProviderAdapter): void {
    this.customProviders.set(adapter.providerType, adapter);
  }

  public static getAdapter(type: EmailProviderType): IEmailProviderAdapter {
    if (this.customProviders.has(type)) {
      return this.customProviders.get(type)!;
    }

    switch (type) {
      case 'brevo':
        return brevoInstance;
      case 'mock':
        return mockInstance;
      default:
        // Default to Brevo
        return brevoInstance;
    }
  }

  public static getMockAdapter(): MockEmailProvider {
    return mockInstance;
  }
}
