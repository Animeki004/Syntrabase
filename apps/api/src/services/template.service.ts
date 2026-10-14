import { AuthConfigService, DEFAULT_EMAIL_TEMPLATES } from './auth-config.service.js';
import { EmailService } from './email.service.js';
import { EmailTemplateConfig, EmailTemplateType } from '@syntrabase/shared-types';

export class TemplateService {
  /**
   * Replaces supported template variables (%APP_NAME%, %DISPLAY_NAME%, %LINK%, %EMAIL%) with context escaping.
   */
  public static renderTemplate(
    template: EmailTemplateConfig,
    variables: {
      appName?: string;
      displayName?: string;
      link?: string;
      email?: string;
    }
  ): { subject: string; body: string; senderName: string; fromEmail: string; replyTo: string } {
    const appName = variables.appName || 'Syntrabase App';
    const displayName = variables.displayName || 'Valued User';
    const link = variables.link || 'https://syntrabase.internal/auth/action';
    const email = variables.email || '';

    let subject = template.subject
      .replace(/%APP_NAME%/g, appName)
      .replace(/%DISPLAY_NAME%/g, displayName)
      .replace(/%EMAIL%/g, email);

    let body = template.body
      .replace(/%APP_NAME%/g, appName)
      .replace(/%DISPLAY_NAME%/g, displayName)
      .replace(/%LINK%/g, link)
      .replace(/%EMAIL%/g, email);

    return {
      subject,
      body,
      senderName: template.senderName,
      fromEmail: template.fromEmail,
      replyTo: template.replyTo,
    };
  }

  /**
   * Renders the project's configured email template and delivers the email.
   */
  public static async sendTemplatedActionEmail(
    projectId: string,
    recipientEmail: string,
    templateType: EmailTemplateType,
    variables: {
      appName?: string;
      displayName?: string;
      link?: string;
      email?: string;
    }
  ): Promise<void> {
    const config = await AuthConfigService.getProjectAuthConfig(projectId);
    const template = config.emailTemplates[templateType] || DEFAULT_EMAIL_TEMPLATES[templateType];

    if (!template) {
      throw new Error(`Email template '${templateType}' not configured for project`);
    }

    const rendered = this.renderTemplate(template, {
      ...variables,
      email: recipientEmail,
    });

    // Authoritative Server-Side Sender Validation
    const authorizedSenders = await EmailService.getAuthorizedSenders(projectId).catch(() => []);
    let activeSenders = authorizedSenders.filter((s) => s.status === 'active');

    // If project has no active senders, fall back to platform-scoped authorized senders (configured by Super Admin)
    if (activeSenders.length === 0) {
      const platformSenders = await EmailService.getAuthorizedSenders('platform').catch(() => []);
      activeSenders = platformSenders.filter((s) => s.status === 'active');
    }

    let senderEmail = rendered.fromEmail;
    let senderName = rendered.senderName;

    if (activeSenders.length > 0) {
      const match = activeSenders.find(
        (s) => s.emailAddress.toLowerCase() === (rendered.fromEmail || '').toLowerCase()
      );
      if (match) {
        senderEmail = match.emailAddress;
        senderName = match.displayName || rendered.senderName;
      } else {
        // Fall back to primary active authorized sender
        senderEmail = activeSenders[0].emailAddress;
        senderName = activeSenders[0].displayName || rendered.senderName;
      }
    } else if (senderEmail.endsWith('.internal') || senderEmail.includes('noreply@syntrabase')) {
      const fallbackEmail = process.env.SYSTEM_FROM_EMAIL || process.env.DEFAULT_FROM_EMAIL;
      if (fallbackEmail) {
        senderEmail = fallbackEmail;
      } else {
        const accs = await EmailService.getProviderAccounts().catch(() => []);
        const activeAcc = accs.find((a) => a.status === 'healthy' && a.accountEmail);
        if (activeAcc?.accountEmail) {
          senderEmail = activeAcc.accountEmail;
          senderName = activeAcc.accountName || senderName;
        } else {
          throw new Error(
            `Cannot send '${templateType}' email: No verified authorized sender identity configured for project '${projectId}' or platform. Please configure a verified custom domain and authorized sender in Super Admin or Project Settings -> Email.`
          );
        }
      }
    }

    await EmailService.sendEmail({
      projectId,
      to: recipientEmail,
      from: senderEmail,
      fromName: senderName,
      subject: rendered.subject,
      text: rendered.body,
    });

    await AuthConfigService.logAuthActivity(
      projectId,
      'default',
      'system',
      recipientEmail,
      `email.${templateType}_sent`,
      { recipientEmail, subject: rendered.subject, senderEmail }
    ).catch(() => {});
  }
}
