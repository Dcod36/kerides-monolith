import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { ProfileController } from './profile.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { RolesGuard } from './guards/roles.guard';
import { Account, AccountSchema } from '../accounts/schemas/account.schema';
import { AccountRepository } from '../accounts/repositories/account.repository';
import { MailService } from '../mail/mail.service';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'MySuperSecretKeydevelopment',
      signOptions: { expiresIn: '1d' },
    }),
    MongooseModule.forFeature([
      { name: Account.name, schema: AccountSchema },
    ]),
  ],
  controllers: [AuthController, ProfileController],
  providers: [AuthService, AccountRepository, JwtStrategy, RolesGuard, MailService],
  exports: [AuthService, JwtStrategy, PassportModule, AccountRepository],
})
export class AuthModule {}
