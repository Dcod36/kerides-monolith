import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class MailService {
  private transporter: any = null;
  private logger = new Logger('MailService');

  constructor() {
    const user = process.env.GMAIL_USER;
    const pass = process.env.GMAIL_APP_PASSWORD;

    if (!user || !pass) {
      this.logger.warn(
        '⚠️  GMAIL_USER or GMAIL_APP_PASSWORD not set — email sending disabled, OTP will log to console',
      );
      return;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const nodemailer = require('nodemailer');
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user, pass },
      });
      this.logger.log(`✅ Email service initialized — sending from: ${user}`);
    } catch (err: any) {
      this.logger.error('❌ nodemailer init failed:', err.message);
      this.transporter = null;
    }
  }

  async sendOtpEmail(
    email: string,
    otp: string,
    expiresAt: Date,
  ): Promise<boolean> {
    // Always log OTP to console for dev testing
    console.log(`\n📧 OTP for ${email}: ${otp} (expires ${expiresAt.toLocaleTimeString()})\n`);

    if (!this.transporter) {
      return false;
    }

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
        <div style="background-color: #10b981; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 24px;">🚗 Kerides</h1>
          <p style="margin: 5px 0 0 0; font-size: 14px;">Email Verification</p>
        </div>
        <div style="background-color: white; padding: 30px; border-radius: 0 0 8px 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <h2 style="color: #333; margin-top: 0;">Verify Your Email Address</h2>
          <p style="color: #666; line-height: 1.6;">
            Thank you for registering with Kerides! Use the OTP below to verify your email.
          </p>
          <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; text-align: center; margin: 25px 0;">
            <p style="color: #666; font-size: 14px; margin: 0 0 10px 0;">Your OTP Code:</p>
            <div style="font-size: 36px; font-weight: bold; color: #10b981; letter-spacing: 8px; font-family: 'Courier New', monospace;">
              ${otp}
            </div>
          </div>
          <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px;">
            <p style="margin: 0; color: #92400e; font-size: 14px;">
              ⏱️ <strong>This OTP expires in 3 minutes</strong> (at ${expiresAt.toLocaleTimeString()})
            </p>
          </div>
          <p style="color: #999; font-size: 12px; text-align: center; margin: 0;">
            © ${new Date().getFullYear()} Kerides — Your Trusted Ride Partner
          </p>
        </div>
      </div>
    `;

    try {
      await this.transporter.sendMail({
        from: `"Kerides" <${process.env.GMAIL_USER}>`,
        to: email,
        subject: 'Email Verification OTP - Kerides',
        text: `Your Kerides OTP is: ${otp}. Expires at ${expiresAt.toLocaleTimeString()}.`,
        html,
      });
      this.logger.log(`📧 OTP email sent to ${email}`);
      return true;
    } catch (err) {
      this.logger.error(`❌ Failed to send OTP email to ${email}:`, err);
      return false;
    }
  }
}
