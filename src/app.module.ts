import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    // MongoDB — same Atlas cluster as microservices (shares data)
    MongooseModule.forRoot(
      process.env.MONGO_URI ||
        'mongodb://127.0.0.1:27017/kerides_dev',
    ),

    // ─── Phase 1: Auth + Registration ───────────────────────────────
    AuthModule,

    // ─── Phase 2 (coming next): UserProfileModule, DriverProfileModule
    // ─── Phase 3 (coming next): BookingModule, VehicleModule
  ],
})
export class AppModule {}
