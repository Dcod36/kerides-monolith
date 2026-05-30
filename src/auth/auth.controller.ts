import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Get,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AuthResponseDto } from './dto/auth-response.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ─── GET /auth/session ───────────────────────────────────────────────────────
  // Validates current JWT — used by frontend initAuth() on page load
  @Get('session')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Validate current session token' })
  @ApiResponse({ status: 200, description: 'Token is valid' })
  @ApiResponse({ status: 401, description: 'Token invalid or expired' })
  async session(@Request() req: any): Promise<{ valid: boolean; user: any }> {
    return {
      valid: true,
      user: req.user,
    };
  }

  // ─── POST /auth/send-otp ─────────────────────────────────────────────────────
  // Step 1 of registration — sends 6-digit OTP to email
  @Post('send-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send OTP to email for verification' })
  @ApiBody({ schema: { properties: { email: { type: 'string', example: 'john@example.com' } } } })
  @ApiResponse({ status: 200, description: 'OTP sent successfully' })
  @ApiResponse({ status: 409, description: 'Email already registered' })
  async sendOtp(
    @Body('email') email: string,
  ): Promise<{ message: string; expiresIn: number }> {
    return this.authService.sendEmailOtp(email);
  }

  // ─── POST /auth/verify-otp ───────────────────────────────────────────────────
  // Step 2 of registration — verifies the OTP
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify OTP sent to email' })
  @ApiBody({
    schema: {
      properties: {
        email: { type: 'string', example: 'john@example.com' },
        otp: { type: 'string', example: '123456' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'OTP verified' })
  @ApiResponse({ status: 400, description: 'Invalid or expired OTP' })
  async verifyOtp(
    @Body('email') email: string,
    @Body('otp') otp: string,
  ): Promise<{ message: string; verified: boolean }> {
    return this.authService.verifyEmailOtp(email, otp);
  }

  // ─── POST /auth/register ─────────────────────────────────────────────────────
  // Step 3 of registration — completes account creation
  // Works for BOTH user (role: "USER") and driver (role: "DRIVER")
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Register a new user or driver account',
    description:
      'Set role to "USER" for passengers, "DRIVER" for drivers. Email must be verified via OTP first.',
  })
  @ApiResponse({ status: 201, description: 'Account created, returns JWT tokens' })
  @ApiResponse({ status: 400, description: 'Email not verified or validation error' })
  @ApiResponse({ status: 409, description: 'Email or phone already registered' })
  async register(@Body() registerDto: RegisterDto): Promise<AuthResponseDto> {
    return this.authService.register(registerDto);
  }

  // ─── POST /auth/login ────────────────────────────────────────────────────────
  // Login for user, driver, and admin — same endpoint, role checked by frontend
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Login (User / Driver / Admin)',
    description:
      'Same endpoint for all roles. The frontend validates role matches the login page type.',
  })
  @ApiResponse({ status: 200, description: 'Login successful, returns JWT tokens' })
  @ApiResponse({ status: 401, description: 'Invalid credentials or account deactivated' })
  async login(@Body() loginDto: LoginDto): Promise<AuthResponseDto> {
    return this.authService.login(loginDto);
  }
}
