/** One plain-text email. */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

/**
 * Sends email. The server builds one from the SMTP_* settings
 * (`createSmtpMailer`); without them there is none and email features are off.
 * Kept to this interface so the Android build, which has no email, never
 * imports the SMTP library.
 */
export interface Mailer {
  send(message: MailMessage): Promise<void>;
}
