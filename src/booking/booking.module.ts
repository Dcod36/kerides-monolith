import { Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { AccountSchema } from '../accounts/schemas/account.schema';
import { BookingController } from './controllers/booking.controller';
import { AdminBookingController } from './controllers/admin-booking.controller';
import { RideRequestController } from './controllers/ride-request.controller';
import { PaymentController } from './controllers/payment.controller';
import { AdminPaymentController } from './controllers/admin-payment.controller';
import { RideTrackingController } from './controllers/ride-tracking.controller';
import { BookingService } from './services/booking.service';
import { FareService } from './services/fare.service';
import { OtpService } from './services/otp.service';
import { NotificationService } from './services/notification.service';
import { MatchingService } from './services/matching.service';
import { DriverContactService } from './services/driver-contact.service';
import { UserContactService } from './services/user-contact.service';
import { PaymentService } from './services/payment.service';
import { RideTrackingService } from './services/ride-tracking.service';
import { BookingRepository } from './repositories/booking.repository';
import { RideRequestRepository } from './repositories/ride-request.repository';
import { FareConfigRepository } from './repositories/fare-config.repository';
import { NotificationRepository } from './repositories/notification.repository';
import { PaymentRepository } from './repositories/payment.repository';
import { WalletRepository } from './repositories/wallet.repository';
import { RideLocationRepository } from './repositories/ride-location.repository';
import { Booking, BookingSchema } from './schemas/booking.schema';
import { RideRequest, RideRequestSchema } from './schemas/ride-request.schema';
import { FareConfig, FareConfigSchema } from './schemas/fare-config.schema';
import { Notification, NotificationSchema } from './schemas/notification.schema';
import { Payment, PaymentSchema } from './schemas/payment.schema';
import { Wallet, WalletSchema } from './schemas/wallet.schema';
import { RideLocation, RideLocationSchema } from './schemas/ride-location.schema';
import { DriverProfile, DriverProfileSchema } from './schemas/driver-profile.schema';
import { Vehicle, VehicleSchema } from './schemas/vehicle.schema';
import { Stand, StandSchema } from './schemas/stand.schema';
import { DriverProfileController } from './controllers/driver-profile.controller';
import { DriversController } from './controllers/drivers.controller';
import { VehicleController } from './controllers/vehicle.controller';
import { VehicleAdminController } from './controllers/vehicle-admin.controller';
import { VehicleService } from './services/vehicle.service';
import { DriverAdminController } from './controllers/driver-admin.controller';
import { RidesAliasController } from './controllers/rides-alias.controller';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: 'Booking', schema: BookingSchema },
      { name: 'RideRequest', schema: RideRequestSchema },
      { name: 'FareConfig', schema: FareConfigSchema },
      { name: 'Notification', schema: NotificationSchema },
      { name: 'Payment', schema: PaymentSchema },
      { name: 'Wallet', schema: WalletSchema },
      { name: 'RideLocation', schema: RideLocationSchema },
      { name: 'DriverProfile', schema: DriverProfileSchema },
      { name: 'Vehicle', schema: VehicleSchema },
      { name: 'Account', schema: AccountSchema },
      { name: 'Stand', schema: StandSchema },
    ]),
  ],
  controllers: [
    BookingController,
    AdminBookingController,
    AdminPaymentController,
    RideRequestController,
    PaymentController,
    RideTrackingController,
    DriverProfileController,
    DriversController,
    VehicleController,
    VehicleAdminController,
    DriverAdminController,
    RidesAliasController,
  ],
  providers: [
    BookingService,
    FareService,
    OtpService,
    NotificationService,
    MatchingService,
    DriverContactService,
    UserContactService,
    PaymentService,
    RideTrackingService,
    VehicleService,
    BookingRepository,
    RideRequestRepository,
    FareConfigRepository,
    NotificationRepository,
    PaymentRepository,
    WalletRepository,
    RideLocationRepository,
  ],
  exports: [
    BookingService,
    PaymentService,
    RideTrackingService,
    DriverContactService,
    UserContactService,
    VehicleService,
  ],
})
export class BookingModule implements OnModuleInit {
  constructor(private readonly fareService: FareService) {}

  async onModuleInit() {
    // Seed default fare configurations on startup
    await this.fareService.seedDefaultFareConfigs();
  }
}
