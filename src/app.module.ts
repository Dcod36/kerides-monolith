import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { BookingModule } from './booking/booking.module';

@Module({
  imports: [
    // MongoDB — same Atlas cluster as microservices (shares data)
    MongooseModule.forRoot(
      process.env.MONGO_URI ||
        'mongodb://127.0.0.1:27017/kerides_dev',
    ),

    // Throttler rate limiter module
    ThrottlerModule.forRoot([
      {
        ttl: parseInt(process.env.RATE_LIMIT_WINDOW_MINUTES || '60', 10) * 60 * 1000,
        limit: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
      },
    ]),

    // ─── Phase 1: Auth + Registration ───────────────────────────────
    AuthModule,

    // ─── Phase 3: Booking module
    BookingModule,
  ],
})
export class AppModule {}
