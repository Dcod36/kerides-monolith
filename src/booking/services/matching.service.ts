import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { calculateDistance, estimateTravelTime } from '../utils/geolocation.util';

export interface Driver {
  _id: string;
  accountId: string;
  email?: string;
  isOnline: boolean;
  isVerified: boolean;
  fullName?: string;
  phoneNumber?: string;
  latitude?: number;
  longitude?: number;
  vehicle?: any;
  rating?: number;
  assignedStandId?: string;
}

export interface NearbyDriver extends Driver {
  distance: number;       // in km
  estimatedArrival: number; // in minutes
  priorityGroup?: 'STAND' | 'NEAREST';
  matchSource?: 'STAND' | 'NEAREST';
}

/**
 * Monolith version: finds nearby available drivers using direct MongoDB queries.
 * NO HTTP calls to driver-service.
 */
@Injectable()
export class MatchingService {
  private readonly logger = new Logger(MatchingService.name);
  private readonly defaultRadiusKm = parseFloat(process.env.NEARBY_DRIVER_RADIUS_KM || '5');
  private readonly standSearchRadiusKm = parseFloat(process.env.STAND_SEARCH_RADIUS_KM || '2');
  private readonly maxDrivers = parseInt(process.env.MAX_NEARBY_DRIVERS || '20', 10);
  private readonly strictVehicleFilter =
    String(process.env.STRICT_VEHICLE_FILTER || 'false').toLowerCase() === 'true';

  constructor(
    @InjectModel('DriverProfile') private readonly driverProfileModel: Model<any>,
    @InjectModel('Vehicle') private readonly vehicleModel: Model<any>,
    @InjectModel('Account') private readonly accountModel: Model<any>,
    @InjectModel('Stand') private readonly standModel: Model<any>,
  ) {}

  private normalizeVehicleType(value?: string): string {
    const input = String(value || '').trim().toUpperCase();
    if (!input) return '';
    if (input.includes('SEVEN') || input.includes('SUV')) return 'SUV';
    if (input.includes('SEDAN')) return 'SEDAN';
    if (input.includes('HATCH')) return 'HATCHBACK';
    if (input.includes('AUTO')) return 'AUTO';
    if (input.includes('BIKE')) return 'BIKE';
    return input;
  }

  /**
   * Query driver_profiles for online+verified drivers, optionally filtered by standIds.
   * Enrich with account info and vehicle info from their respective collections.
   */
  private async fetchOnlineDrivers(
    vehicleType?: string,
    assignedStandIds?: string[],
  ): Promise<Driver[]> {
    try {
      const profileQuery: Record<string, any> = { isOnline: true, isVerified: true };

      if (assignedStandIds && assignedStandIds.length > 0) {
        const standObjectIds = assignedStandIds
          .filter((id) => Types.ObjectId.isValid(id))
          .map((id) => new Types.ObjectId(id));
        if (standObjectIds.length > 0) {
          profileQuery.assignedStandId = { $in: standObjectIds };
        }
      }

      const profiles = await this.driverProfileModel.find(profileQuery).lean().exec() as any[];

      if (!profiles.length) return [];

      const accountIds = profiles.map((p) => p.accountId);
      const validObjectIds = accountIds
        .filter((id: any) => Types.ObjectId.isValid(id))
        .map((id: any) => new Types.ObjectId(id));

      const vehicleQuery: Record<string, any> = {
        driverId: { $in: validObjectIds },
        isActive: true,
      };

      if (vehicleType && this.strictVehicleFilter) {
        vehicleQuery.type = vehicleType.toUpperCase();
      }

      const [accounts, vehicles] = await Promise.all([
        this.accountModel
          .find({ _id: { $in: validObjectIds } }, { fullName: 1, phoneNumber: 1, email: 1 })
          .lean()
          .exec() as Promise<any[]>,
        this.vehicleModel.find(vehicleQuery).lean().exec() as Promise<any[]>,
      ]);

      const accountsById = new Map<string, any>();
      for (const acc of accounts) {
        accountsById.set(String(acc._id), acc);
      }

      const vehiclesByDriverId = new Map<string, any>();
      for (const veh of vehicles) {
        const key = String(veh.driverId);
        if (!vehiclesByDriverId.has(key)) {
          vehiclesByDriverId.set(key, veh);
        }
      }

      let enriched: Driver[] = profiles.map((profile) => {
        const id = String(profile.accountId);
        const acc = accountsById.get(id) || {};
        const veh = vehiclesByDriverId.get(id);

        return {
          _id: String(profile._id),
          accountId: id,
          isOnline: profile.isOnline,
          isVerified: profile.isVerified,
          rating: profile.rating,
          latitude: profile.latitude,
          longitude: profile.longitude,
          fullName: acc.fullName,
          phoneNumber: acc.phoneNumber,
          email: acc.email,
          assignedStandId: profile.assignedStandId ? String(profile.assignedStandId) : undefined,
          vehicle: veh
            ? {
                type: veh.type,
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

      // Apply strict vehicle type filter
      if (vehicleType && this.strictVehicleFilter) {
        const wanted = this.normalizeVehicleType(vehicleType);
        enriched = enriched.filter((d) => {
          const dType = this.normalizeVehicleType(d.vehicle?.type || d.vehicle?.vehicleType);
          return Boolean(dType) && dType === wanted;
        });
      }

      return enriched;
    } catch (error) {
      this.logger.error('Error fetching online drivers from DB:', error);
      return [];
    }
  }

  /**
   * Find nearby active stands using MongoDB $nearSphere geospatial query.
   */
  private async fetchNearbyStands(
    pickupLat: number,
    pickupLng: number,
    radiusKm: number,
  ): Promise<any[]> {
    try {
      return await this.standModel
        .find({
          isActive: true,
          location: {
            $nearSphere: {
              $geometry: { type: 'Point', coordinates: [pickupLng, pickupLat] },
              $maxDistance: radiusKm * 1000,
            },
          },
        })
        .lean()
        .exec();
    } catch (error) {
      // 2dsphere index may not exist; gracefully fall back to nearest drivers
      this.logger.warn(`Stand lookup failed, falling back to nearest drivers: ${String(error)}`);
      return [];
    }
  }

  private async findStandDrivers(
    pickupLat: number,
    pickupLng: number,
    limit: number,
    vehicleType?: string,
  ): Promise<NearbyDriver[]> {
    const nearbyStands = await this.fetchNearbyStands(pickupLat, pickupLng, this.standSearchRadiusKm);

    if (!nearbyStands.length) return [];

    const standIds = nearbyStands.map((s) => String(s._id)).filter(Boolean);
    const drivers = await this.fetchOnlineDrivers(vehicleType, standIds);

    const driversWithLocation = drivers.filter((d) =>
      typeof d.latitude === 'number' && typeof d.longitude === 'number',
    );

    return driversWithLocation
      .map((driver) => {
        const distance = calculateDistance(pickupLat, pickupLng, driver.latitude!, driver.longitude!);
        return {
          ...driver,
          distance: parseFloat(distance.toFixed(2)),
          estimatedArrival: estimateTravelTime(distance),
          priorityGroup: 'STAND' as const,
          matchSource: 'STAND' as const,
        };
      })
      .sort((a, b) => a.distance - b.distance || (b.rating || 0) - (a.rating || 0))
      .slice(0, limit);
  }

  /**
   * Find nearby available drivers — entry point for the booking flow.
   */
  async findNearbyDrivers(
    pickupLat: number,
    pickupLng: number,
    radiusKm: number = this.defaultRadiusKm,
    limit: number = this.maxDrivers,
    vehicleType?: string,
  ): Promise<NearbyDriver[]> {
    // Priority 1: stand-assigned drivers
    const standDrivers = await this.findStandDrivers(pickupLat, pickupLng, limit, vehicleType);
    if (standDrivers.length > 0) {
      this.logger.log(`Found ${standDrivers.length} stand drivers within ${this.standSearchRadiusKm}km`);
      return standDrivers;
    }

    // Priority 2: nearest online drivers
    const drivers = await this.fetchOnlineDrivers(vehicleType);
    this.logger.debug(`Fetched ${drivers.length} online drivers from DB`);

    const driversWithLocation = drivers.filter(
      (d) => typeof d.latitude === 'number' && typeof d.longitude === 'number',
    );

    const driversWithDistance: NearbyDriver[] = driversWithLocation
      .map((driver) => {
        const distance = calculateDistance(pickupLat, pickupLng, driver.latitude!, driver.longitude!);
        return {
          ...driver,
          distance: parseFloat(distance.toFixed(2)),
          estimatedArrival: estimateTravelTime(distance),
          priorityGroup: 'NEAREST' as const,
          matchSource: 'NEAREST' as const,
        };
      })
      .filter((d) => d.distance <= radiusKm)
      .sort((a, b) => a.distance - b.distance || (b.rating || 0) - (a.rating || 0))
      .slice(0, limit);

    this.logger.log(`Found ${driversWithDistance.length} drivers within ${radiusKm}km`);
    return driversWithDistance;
  }

  /**
   * Find the single best driver match for auto-assignment.
   */
  async findBestDriverMatch(
    pickupLat: number,
    pickupLng: number,
    vehicleType?: string,
    excludedDriverIds: string[] = [],
  ): Promise<NearbyDriver | null> {
    // Priority 1: stand drivers
    const standDrivers = await this.findStandDrivers(pickupLat, pickupLng, this.maxDrivers, vehicleType);
    const eligibleStand = standDrivers.filter((d) => !excludedDriverIds.includes(d.accountId));
    if (eligibleStand.length > 0) {
      this.logger.log(`Best match from stand: accountId=${eligibleStand[0].accountId}`);
      return eligibleStand[0];
    }

    // Priority 2: nearest online drivers
    const nearbyDrivers = await this.findNearbyDrivers(pickupLat, pickupLng, this.defaultRadiusKm, 10, vehicleType);
    const eligible = nearbyDrivers.filter((d) => !excludedDriverIds.includes(d.accountId));

    if (eligible.length === 0) {
      this.logger.warn('No eligible drivers available for matching');
      return null;
    }

    const bestDriver = eligible.reduce((best, current) => {
      if (current.distance < best.distance) return current;
      if (current.distance === best.distance && (current.rating || 0) > (best.rating || 0)) return current;
      return best;
    }, eligible[0]);

    this.logger.log(`Best driver match: accountId=${bestDriver.accountId} (${bestDriver.distance}km)`);
    return bestDriver;
  }

  /**
   * Check if a specific driver is within acceptable range (DB lookup).
   */
  async isDriverInRange(
    driverId: string,
    pickupLat: number,
    pickupLng: number,
    maxDistanceKm: number = this.defaultRadiusKm,
  ): Promise<boolean> {
    if (!Types.ObjectId.isValid(driverId)) return false;

    try {
      const profile = await this.driverProfileModel
        .findOne({ accountId: new Types.ObjectId(driverId) }, { latitude: 1, longitude: 1 })
        .lean()
        .exec() as any;

      if (!profile?.latitude || !profile?.longitude) return false;

      const distance = calculateDistance(pickupLat, pickupLng, profile.latitude, profile.longitude);
      return distance <= maxDistanceKm;
    } catch (error) {
      this.logger.error(`Failed to check driver ${driverId} range:`, error);
      return false;
    }
  }
}
