import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { addMinutes, isExpired } from '../utils/date.util';

export interface OtpGenerationResult {
  otpHash: string;
  expiresAt: Date;
  plainOtp: string; // Only for sending via email/SMS, never store
}

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly otpExpiryMinutes = parseInt(process.env.OTP_EXPIRY_MINUTES || '5', 10);
  private readonly saltRounds = 10;

  /**
   * Generate a secure 4-digit OTP
   * @returns OTP generation result with hash and plain text
   */
  async generateOtp(): Promise<OtpGenerationResult> {
    // Use crypto.randomInt for cryptographically secure random numbers
    const otp = crypto.randomInt(1000, 10000).toString();

    // Hash the OTP before storing
    const otpHash = await bcrypt.hash(otp, this.saltRounds);
    const expiresAt = addMinutes(new Date(), this.otpExpiryMinutes);

    this.logger.debug(`Generated OTP (expires in ${this.otpExpiryMinutes} minutes)`);

    return {
      otpHash,
      expiresAt,
      plainOtp: otp, // Return plain OTP for sending, but never store it
    };
  }

  /**
   * Verify OTP against stored hash
   * @param plainOtp - Plain OTP entered by user
   * @param storedHash - Stored OTP hash
   * @param expiresAt - OTP expiration time
   * @returns True if OTP is valid
   */
  async verifyOtp(
    plainOtp: string,
    storedHash: string | null,
    expiresAt: Date | null,
  ): Promise<boolean> {
    // Check if OTP exists
    if (!storedHash || !expiresAt) {
      this.logger.warn('OTP verification failed: No OTP found');
      throw new BadRequestException('No OTP found for this booking');
    }

    // Check if OTP has expired
    if (this.isOtpExpired(expiresAt)) {
      this.logger.warn('OTP verification failed: OTP expired');
      throw new BadRequestException('OTP has expired');
    }

    // Verify OTP hash
    const isValid = await bcrypt.compare(plainOtp, storedHash);

    if (!isValid) {
      this.logger.warn('OTP verification failed: Invalid OTP');
      throw new BadRequestException('Invalid OTP');
    }

    this.logger.debug('OTP verified successfully');
    return true;
  }

  /**
   * Check if OTP is expired without throwing exception
   * @param expiresAt - OTP expiration time
   * @returns True if expired
   */
  isOtpExpired(expiresAt: Date | null): boolean {
    return isExpired(expiresAt);
  }
}
