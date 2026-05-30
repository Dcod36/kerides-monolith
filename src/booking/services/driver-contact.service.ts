import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

export interface VehicleInfo {
  vehicleType?: string;
  make?: string;
  model?: string;
  licensePlate?: string;
  color?: string;
}

export interface DriverContact {
  accountId: string;
  fullName?: string;
  phoneNumber?: string;
  email?: string;
  vehicle?: VehicleInfo;
}

/**
 * Monolith version: resolves driver contact info directly from the shared MongoDB
 * collections (driver_profiles + vehicles + accounts).
 * NO HTTP calls — pure database queries.
 */
@Injectable()
export class DriverContactService {
  private readonly logger = new Logger(DriverContactService.name);

  constructor(
    @InjectModel('DriverProfile') private readonly driverProfileModel: Model<any>,
    @InjectModel('Vehicle') private readonly vehicleModel: Model<any>,
    @InjectModel('Account') private readonly accountModel: Model<any>,
  ) {}

  /**
   * Resolve contact details for a single driver by accountId.
   * Returns null if driver not found.
   */
  async resolveDriverContact(accountId: string): Promise<DriverContact | null> {
    if (!Types.ObjectId.isValid(accountId)) {
      this.logger.warn(`Invalid accountId: ${accountId}`);
      return null;
    }

    try {
      const objectId = new Types.ObjectId(accountId);

      const [profile, account, vehicles] = await Promise.all([
        this.driverProfileModel.findOne({ accountId: objectId }).lean().exec(),
        this.accountModel.findById(objectId, { fullName: 1, phoneNumber: 1, email: 1 }).lean().exec(),
        this.vehicleModel.find({ driverId: objectId, isActive: true }).lean().exec(),
      ]);

      if (!profile && !account) {
        this.logger.warn(`Driver not found for accountId=${accountId}`);
        return null;
      }

      const firstVehicle = vehicles?.[0];
      const vehicle: VehicleInfo | undefined = firstVehicle
        ? {
            vehicleType: firstVehicle.type || '',
            make: firstVehicle.make || '',
            model: firstVehicle.vehicleModel || firstVehicle.model || '',
            licensePlate: firstVehicle.registrationNumber || '',
            color: firstVehicle.color || '',
          }
        : undefined;

      return {
        accountId,
        fullName: (account as any)?.fullName,
        phoneNumber: (account as any)?.phoneNumber,
        email: (account as any)?.email,
        vehicle,
      };
    } catch (error) {
      this.logger.error(`Error resolving driver contact for ${accountId}:`, error);
      return null;
    }
  }

  /**
   * Batch resolve contacts for multiple driver accountIds.
   * Returns a Map keyed by accountId.
   */
  async resolveDriverContacts(accountIds: string[]): Promise<Map<string, DriverContact>> {
    const results = new Map<string, DriverContact>();

    if (!accountIds.length) return results;

    const validIds = accountIds.filter((id) => Types.ObjectId.isValid(id));
    if (!validIds.length) return results;

    try {
      const objectIds = validIds.map((id) => new Types.ObjectId(id));

      const [profiles, accounts, vehicles] = await Promise.all([
        this.driverProfileModel.find({ accountId: { $in: objectIds } }).lean().exec(),
        this.accountModel.find({ _id: { $in: objectIds } }, { fullName: 1, phoneNumber: 1, email: 1 }).lean().exec(),
        this.vehicleModel.find({ driverId: { $in: objectIds }, isActive: true }).lean().exec(),
      ]);

      const accountsById = new Map<string, any>();
      for (const acc of accounts as any[]) {
        accountsById.set(String(acc._id), acc);
      }

      const vehiclesByDriverId = new Map<string, any>();
      for (const veh of vehicles as any[]) {
        const key = String(veh.driverId);
        if (!vehiclesByDriverId.has(key)) {
          vehiclesByDriverId.set(key, veh);
        }
      }

      for (const id of validIds) {
        const acc = accountsById.get(id);
        const veh = vehiclesByDriverId.get(id);

        const vehicle: VehicleInfo | undefined = veh
          ? {
              vehicleType: veh.type || '',
              make: veh.make || '',
              model: veh.vehicleModel || veh.model || '',
              licensePlate: veh.registrationNumber || '',
              color: veh.color || '',
            }
          : undefined;

        results.set(id, {
          accountId: id,
          fullName: acc?.fullName,
          phoneNumber: acc?.phoneNumber,
          email: acc?.email,
          vehicle,
        });
      }
    } catch (error) {
      this.logger.warn('Failed to batch resolve driver contacts:', error);
    }

    return results;
  }

  /**
   * Get all online verified drivers with their account and vehicle info.
   * Replaces the HTTP call to driver-service GET /driver-profiles/available.
   */
  async getAvailableDrivers(vehicleType?: string): Promise<any[]> {
    try {
      const profileQuery: Record<string, any> = { isOnline: true, isVerified: true };
      const profiles = await this.driverProfileModel.find(profileQuery).lean().exec();

      if (!profiles.length) return [];

      const accountIds = (profiles as any[]).map((p) => p.accountId);
      const objectIds = accountIds.filter((id: any) => Types.ObjectId.isValid(id)).map((id: any) => new Types.ObjectId(id));

      const vehicleQuery: Record<string, any> = { driverId: { $in: objectIds }, isActive: true };
      if (vehicleType) {
        vehicleQuery.type = vehicleType.toUpperCase();
      }

      const [accounts, vehicles] = await Promise.all([
        this.accountModel.find({ _id: { $in: objectIds } }, { fullName: 1, phoneNumber: 1, email: 1 }).lean().exec(),
        this.vehicleModel.find(vehicleQuery).lean().exec(),
      ]);

      const accountsById = new Map<string, any>();
      for (const acc of accounts as any[]) {
        accountsById.set(String(acc._id), acc);
      }

      const vehiclesByDriverId = new Map<string, any>();
      for (const veh of vehicles as any[]) {
        const key = String(veh.driverId);
        if (!vehiclesByDriverId.has(key)) {
          vehiclesByDriverId.set(key, veh);
        }
      }

      const enriched = (profiles as any[]).map((profile) => {
        const id = String(profile.accountId);
        const acc = accountsById.get(id) || {};
        const veh = vehiclesByDriverId.get(id);
        return {
          accountId: id,
          isOnline: profile.isOnline,
          isVerified: profile.isVerified,
          rating: profile.rating,
          totalTrips: profile.totalTrips,
          latitude: profile.latitude,
          longitude: profile.longitude,
          lastLocationUpdate: profile.lastLocationUpdate,
          fullName: acc.fullName,
          phoneNumber: acc.phoneNumber,
          email: acc.email,
          vehicle: veh
            ? {
                vehicleType: veh.type,
                make: veh.make,
                model: veh.vehicleModel || veh.model,
                licensePlate: veh.registrationNumber,
                color: veh.color,
                fareStructure: veh.fareStructure,
              }
            : undefined,
        };
      });

      // If vehicle type filter was requested, apply it
      if (vehicleType) {
        const wanted = vehicleType.toUpperCase();
        return enriched.filter((d) => d.vehicle?.vehicleType?.toUpperCase() === wanted);
      }

      return enriched;
    } catch (error) {
      this.logger.error('Error fetching available drivers:', error);
      return [];
    }
  }

  /**
   * Get vehicle fare structure for a specific vehicleId.
   * Replaces the HTTP call to driver-service GET /vehicles/internal/:vehicleId.
   */
  async getVehicleFareStructure(vehicleId: string): Promise<{
    vehicleType: string;
    perKilometerRate: number;
    waitingChargePerMinute: number;
  } | null> {
    if (!Types.ObjectId.isValid(vehicleId)) return null;

    try {
      const vehicle = await this.vehicleModel.findById(vehicleId).lean().exec() as any;
      if (!vehicle?.fareStructure) return null;

      return {
        vehicleType: vehicle.type || 'UNKNOWN',
        perKilometerRate: Number(vehicle.fareStructure.perKilometerRate || 0),
        waitingChargePerMinute: Number(vehicle.fareStructure.waitingChargePerMinute || 0),
      };
    } catch (error) {
      this.logger.warn(`Unable to fetch vehicle fareStructure for ${vehicleId}:`, error);
      return null;
    }
  }
}
