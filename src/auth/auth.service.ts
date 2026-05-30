import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AccountRepository } from '../accounts/repositories/account.repository';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { MailService } from '../mail/mail.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Account } from '../accounts/schemas/account.schema';

@Injectable()
export class AuthService {
  constructor(
    private readonly accountRepository: AccountRepository,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    @InjectModel(Account.name) private readonly accountModel: Model<Account>,
  ) {}

  // ─── OTP: Send ──────────────────────────────────────────────────────────────

  async sendEmailOtp(
    email: string,
  ): Promise<{ message: string; expiresIn: number }> {
    const normalizedEmail = email.toLowerCase();

    // Block if already fully registered (has a password)
    const existingAccount = await this.accountModel.findOne({
      email: normalizedEmail,
      passwordHash: { $exists: true, $ne: null },
    });

    if (existingAccount) {
      throw new ConflictException(
        'Email already registered. Please login instead.',
      );
    }

    // Generate 6-digit OTP, expires in 3 minutes
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(Date.now() + 3 * 60 * 1000);

    // Create or update temp account
    const tempAccount = await this.accountModel.findOne({
      email: normalizedEmail,
    });

    if (tempAccount) {
      tempAccount.emailOtp = otp;
      tempAccount.emailOtpExpires = otpExpires;
      tempAccount.emailVerified = false;
      await tempAccount.save();
    } else {
      await this.accountModel.create({
        email: normalizedEmail,
        emailOtp: otp,
        emailOtpExpires: otpExpires,
        emailVerified: false,
      });
    }

    // Send OTP via email (also logs to console)
    await this.mailService.sendOtpEmail(normalizedEmail, otp, otpExpires);

    return {
      message: 'OTP sent to your email successfully',
      expiresIn: 180, // 3 minutes in seconds
    };
  }

  // ─── OTP: Verify ────────────────────────────────────────────────────────────

  async verifyEmailOtp(
    email: string,
    otp: string,
  ): Promise<{ message: string; verified: boolean }> {
    const normalizedEmail = email.toLowerCase();

    const tempAccount = await this.accountModel.findOne({
      email: normalizedEmail,
      emailOtp: otp,
    });

    if (!tempAccount) {
      throw new BadRequestException('Invalid OTP');
    }

    if (!tempAccount.emailOtpExpires || tempAccount.emailOtpExpires < new Date()) {
      throw new BadRequestException('OTP expired. Please request a new one.');
    }

    // Mark verified, clear OTP
    tempAccount.emailVerified = true;
    tempAccount.emailOtp = undefined;
    await tempAccount.save();

    console.log(`✅ Email verified: ${email}`);

    return {
      message: 'Email verified successfully! You can now complete registration.',
      verified: true,
    };
  }

  // ─── Register ───────────────────────────────────────────────────────────────

  async register(registerDto: RegisterDto): Promise<AuthResponseDto> {
    // Find temp account by email
    const tempAccount = await this.accountModel.findOne({
      email: registerDto.email.toLowerCase(),
    });

    // If account already fully registered (has password) → conflict
    if (tempAccount && tempAccount.passwordHash) {
      throw new ConflictException(
        'Email already registered. Please login instead.',
      );
    }

    // Must have verified email with OTP first
    if (!tempAccount || !tempAccount.emailVerified) {
      throw new BadRequestException(
        'Email not verified. Please verify your email with OTP first.',
      );
    }

    // Check phone not already taken by another fully-registered account
    const existingPhone = await this.accountModel.findOne({
      phoneNumber: registerDto.phoneNumber,
      passwordHash: { $exists: true },
    });

    if (existingPhone) {
      throw new ConflictException('Phone number already registered');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(registerDto.password, 10);

    // Complete the account
    tempAccount.fullName = registerDto.fullName;
    tempAccount.phoneNumber = registerDto.phoneNumber;
    tempAccount.passwordHash = passwordHash;
    tempAccount.role = registerDto.role || 'USER';
    tempAccount.isActive = true;
    tempAccount.emailOtp = undefined;
    tempAccount.emailOtpExpires = undefined;
    await tempAccount.save();

    const tokens = this.generateTokens(tempAccount);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: tempAccount._id.toString(),
        email: tempAccount.email,
        fullName: tempAccount.fullName,
        role: tempAccount.role,
        phoneNumber: tempAccount.phoneNumber,
      },
    };
  }

  // ─── Login ──────────────────────────────────────────────────────────────────

  async login(loginDto: LoginDto): Promise<AuthResponseDto> {
    const account =
      await this.accountRepository.findByEmailWithPassword(loginDto.email);

    if (!account) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Account may exist as temp OTP-only account (no password yet)
    if (!account.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      account.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!account.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    const tokens = this.generateTokens(account);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: account._id.toString(),
        email: account.email,
        fullName: account.fullName,
        role: account.role,
        phoneNumber: account.phoneNumber,
        // profileImage will be fetched by frontend from /profiles/me or /driver-profiles/me
      },
    };
  }

  // ─── Validate User (used by JwtStrategy) ────────────────────────────────────

  async validateUser(userId: string): Promise<any> {
    return this.accountRepository.findActiveById(userId);
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  private generateTokens(account: any) {
    const payload = {
      sub: account._id.toString(),
      email: account.email,
      role: account.role,
    };

    return {
      accessToken: this.jwtService.sign(payload, { expiresIn: '1d' }),
      refreshToken: this.jwtService.sign(payload, { expiresIn: '7d' }),
    };
  }
}
