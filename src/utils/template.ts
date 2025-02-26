import { readFile } from 'fs/promises';
import { readdir } from 'fs/promises';
import { join } from 'path';
import Handlebars from 'handlebars';
import { readFileSync } from 'fs';
import { compile } from 'handlebars';
import mjml2html from 'mjml';
import { Logger } from '@/lib/logger';

const TEMPLATE_DIR = join(process.cwd(), 'src/templates/email');
const partialsCache = new Map<string, HandlebarsTemplateDelegate>();
const logger = Logger.getInstance();

// Register common helpers
Handlebars.registerHelper('currentYear', () => new Date().getFullYear());

Handlebars.registerHelper('formatDate', (date: Date) => {
  return new Date(date).toLocaleDateString();
});

Handlebars.registerHelper('formatTime', (date: Date) => {
  return new Date(date).toLocaleTimeString();
});

Handlebars.registerHelper('formatCurrency', (amount: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
});

Handlebars.registerHelper('ifEquals', function(this: any, arg1: any, arg2: any, options: Handlebars.HelperOptions) {
  return (arg1 == arg2) ? options.fn(this) : options.inverse(this);
});

// Add localization helper
Handlebars.registerHelper('t', function(key: string, context: any) {
  const locale = context.data.root.locale || 'en';
  return TemplateManager.getInstance().getMessage(key, locale);
});

// Default template context that's available to all templates
export const defaultTemplateData = {
  companyName: 'Gradiant',
  currentYear: new Date().getFullYear(),
  logoUrl: process.env.NEXT_PUBLIC_LOGO_URL || 'https://gemcity.xyz/logo.png',
  privacyUrl: process.env.NEXT_PUBLIC_PRIVACY_URL || 'https://gemcity.xyz/privacy',
  termsUrl: process.env.NEXT_PUBLIC_TERMS_URL || 'https://gemcity.xyz/terms',
  supportUrl: process.env.NEXT_PUBLIC_SUPPORT_URL || 'https://gemcity.xyz/support',
  dashboardUrl: process.env.NEXT_PUBLIC_DASHBOARD_URL || 'https://gemcity.xyz/dashboard',
  contactUrl: process.env.NEXT_PUBLIC_CONTACT_URL || 'https://gemcity.xyz/contact',
  faqUrl: process.env.NEXT_PUBLIC_FAQ_URL || 'https://gemcity.xyz/faq',
  unsubscribeUrl: process.env.NEXT_PUBLIC_UNSUBSCRIBE_URL || 'https://gemcity.xyz/unsubscribe',
  socialLinks: [
    {
      platform: 'twitter',
      url: process.env.NEXT_PUBLIC_TWITTER_URL,
    },
    {
      platform: 'linkedin',
      url: process.env.NEXT_PUBLIC_LINKEDIN_URL,
    }
  ]
};

/**
 * Load and register a partial template
 */
export async function loadPartial(partialName: string): Promise<void> {
  if (!partialsCache.has(partialName)) {
    const partialPath = join(TEMPLATE_DIR, `${partialName}.hbs`);
    try {
      const content = await readFile(partialPath, 'utf-8');
      const template = Handlebars.compile(content);
      partialsCache.set(partialName, template);
      Handlebars.registerPartial(partialName, content);
    } catch (error) {
      console.error(`Failed to load partial ${partialName}:`, error);
      throw new Error(`Failed to load partial ${partialName}`);
    }
  }
}

/**
 * Render a template with the given context
 */
export async function render(
  templateName: string,
  context: Record<string, any>
): Promise<string> {
  try {
    // Get template from database
    const templateManager = TemplateManager.getInstance();
    const template = await templateManager.getTemplate(templateName);

    if (!template) {
      throw new Error(`Template not found: ${templateName}`);
    }

    // Compile template with Handlebars
    const compiledTemplate = Handlebars.compile(template.html);

    // Render template with combined context
    const renderedHtml = compiledTemplate({
      ...defaultTemplateData,
      ...context,
    });

    // Convert MJML to HTML if the template contains MJML
    if (renderedHtml.trim().startsWith('<mjml>')) {
      const { html, errors } = mjml2html(renderedHtml);

      if (errors.length > 0) {
        throw new Error(`MJML validation error: ${JSON.stringify(errors)}`);
      }

      return html;
    }

    return renderedHtml;
  } catch (error) {
    await logger.error('Template rendering error', error as Error, {
      templateName,
      context,
    });
    throw error;
  }
}

/**
 * Preview a template with test data
 */
export async function previewTemplate(templateName: string, testData: Record<string, any> = {}): Promise<string> {
  const previewContext = {
    name: 'John Doe',
    email: 'john@example.com',
    resetUrl: 'https://example.com/reset',
    expiresIn: '30 minutes',
    logoUrl: 'https://example.com/logo.png',
    unsubscribeUrl: 'https://example.com/unsubscribe',
    ...testData
  };
  
  return render(templateName, previewContext);
}

/**
 * Get a list of all available email templates
 */
export async function listTemplates(): Promise<string[]> {
  try {
    const files = await readdir(TEMPLATE_DIR);
    return files
      .filter(file => file.endsWith('.hbs'))
      .map(file => file.replace('.hbs', ''));
  } catch (error) {
    console.error('Failed to list templates:', error);
    throw new Error('Failed to list templates');
  }
}

/**
 * Register a partial template
 */
export function registerPartial(name: string, template: string): void {
  Handlebars.registerPartial(name, template);
}

/**
 * Register a custom helper
 */
export function registerHelper(
  name: string,
  helper: Handlebars.HelperDelegate
): void {
  Handlebars.registerHelper(name, helper);
}

/**
 * Unregister a partial template
 */
export function unregisterPartial(name: string): void {
  Handlebars.unregisterPartial(name);
}

/**
 * Unregister a custom helper
 */
export function unregisterHelper(name: string): void {
  Handlebars.unregisterHelper(name);
}

interface TemplateOptions {
    locale?: string;
    data?: Record<string, unknown>;
}

class TemplateManager {
    [x: string]: any;
    private static instance: TemplateManager;
    private templates: Map<string, HandlebarsTemplateDelegate>;
    private localeMessages: Record<string, Record<string, string>>;

    private constructor() {
        this.templates = new Map();
        this.localeMessages = {};
        this.loadLocaleMessages();
    }

    public static getInstance(): TemplateManager {
        if (!TemplateManager.instance) {
            TemplateManager.instance = new TemplateManager();
        }
        return TemplateManager.instance;
    }

    private loadLocaleMessages(): void {
        const localesPath = join(process.cwd(), 'locales');
        const locales = ['en', 'es', 'fr'];

        for (const locale of locales) {
            const filePath = join(localesPath, `${locale}.json`);
            try {
                const content = readFileSync(filePath, 'utf-8');
                this.localeMessages[locale] = JSON.parse(content);
            } catch (error) {
                logger.error(`Failed to load locale messages for ${locale}`, error as Error);
            }
        }
    }

    public getMessage(key: string, locale = 'en'): string {
        return this.localeMessages[locale]?.[key] || key;
    }

    public async render(template: string, options: TemplateOptions = {}): Promise<string> {
        const { locale = 'en', data = {} } = options;

        try {
            let compiledTemplate = this.templates.get(template);

            if (!compiledTemplate) {
                const templatePath = join(process.cwd(), 'templates', `${template}.hbs`);
                const templateContent = readFileSync(templatePath, 'utf-8');
                compiledTemplate = compile(templateContent);
                this.templates.set(template, compiledTemplate);
            }

            const templateData = {
                ...data,
                t: (key: string) => this.getMessage(key, locale),
            };

            const renderedHtml = compiledTemplate(templateData);
            const { html, errors } = mjml2html(renderedHtml);

            if (errors.length > 0) {
                throw new Error(`MJML errors: ${errors.map(e => e.message).join(', ')}`);
            }

            return html;
        } catch (error) {
            logger.error('Template rendering error', error as Error, {
                template,
                locale,
                data,
            });
            throw error;
        }
    }
}

export const templateManager = TemplateManager.getInstance();