import { Injectable, Logger } from '@nestjs/common';
import { FareConfigRepository } from '../repositories/fare-config.repository';
import { DriverContactService } from './driver-contact.service';
import { getCurrentTime, getCurrentDayOfWeek, isTimeInRange } from '../utils/date.util';

export interface FareCalculationInput {
  distanceInMeters: number;
  durationInSeconds: number;
  vehicleId?: string;
  vehicleType?: string;
}

export interface FareBreakdown {
  baseFare: number;
  distanceFare: number;
  timeFare: number;
  surgeFare: number;
  total: number;
}

export interface FareResult {
  estimatedFare: number;
  fareBreakdown: FareBreakdown;
  vehicleType: string;
}

@Injectable()
export class FareService {
  private readonly logger = new Logger(FareService.name);

  // Default fare structure (fallback if no config found)
  private readonly defaultFare = {
    baseFare: parseFloat(process.env.DEFAULT_BASE_FARE || '50'),
    perKmRate: parseFloat(process.env.DEFAULT_PER_KM_RATE || '15'),
    perMinuteRate: parseFloat(process.env.DEFAULT_PER_MINUTE_RATE || '1'),
    minimumFare: parseFloat(process.env.DEFAULT_MINIMUM_FARE || '50'),
  };

  constructor(
    private readonly fareConfigRepo: FareConfigRepository,
    private readonly driverContactService: DriverContactService,
  ) {}

  /**
   * Calculate fare based on distance, duration, and vehicle type
   * @param input - Fare calculation input
   * @returns Calculated fare with breakdown
   */
  async calculateFare(input: FareCalculationInput): Promise<FareResult> {
    const { distanceInMeters, durationInSeconds, vehicleType = 'SEDAN' } = input;

    // Convert to standard units
    const distanceKm = distanceInMeters / 1000;
    const durationMinutes = Math.ceil(durationInSeconds / 60);

    if (input.vehicleId) {
      const vehicleFare = await this.driverContactService.getVehicleFareStructure(input.vehicleId);

      if (vehicleFare) {
        const perKilometerRate = Number(vehicleFare.perKilometerRate || 0);
        const waitingChargePerMinute = Number(vehicleFare.waitingChargePerMinute || 0);

        const distanceFare = parseFloat((distanceKm * perKilometerRate).toFixed(2));
        const timeFare = parseFloat((durationMinutes * waitingChargePerMinute).toFixed(2));
        const total = parseFloat((distanceFare + timeFare).toFixed(2));

        const fareBreakdown: FareBreakdown = {
          baseFare: 0,
          distanceFare,
          timeFare,
          surgeFare: 0,
          total,
        };

        this.logger.debug(
          `Vehicle fareStructure calculation: ${distanceKm.toFixed(2)}km × ${perKilometerRate} + ${durationMinutes}min × ${waitingChargePerMinute} = ₹${total.toFixed(2)}`,
        );

        return {
          estimatedFare: total,
          fareBreakdown,
          vehicleType: vehicleFare.vehicleType || vehicleType,
        };
      }
    }

    // Get fare config for vehicle type
    const fareConfig = await this.fareConfigRepo.findByVehicleType(vehicleType);

    let baseFare: number;
    let perKmRate: number;
    let perMinuteRate: number;
    let minimumFare: number;
    let surgeMultiplier = 1.0;

    if (fareConfig) {
      baseFare = fareConfig.baseFare;
      perKmRate = fareConfig.perKmRate;
      perMinuteRate = fareConfig.perMinuteRate;
      minimumFare = fareConfig.minimumFare;

      // Check surge pricing conditions
      if (fareConfig.surge?.enabled) {
        surgeMultiplier = this.calculateSurgeMultiplier(fareConfig.surge);
      }

      this.logger.debug(
        `Using fare config for vehicle type: ${vehicleType} (surge: ${surgeMultiplier}x)`,
      );
    } else {
      // Use default fare structure
      baseFare = this.defaultFare.baseFare;
      perKmRate = this.defaultFare.perKmRate;
      perMinuteRate = this.defaultFare.perMinuteRate;
      minimumFare = this.defaultFare.minimumFare;

      this.logger.warn(
        `No fare config found for vehicle type: ${vehicleType}, using defaults`,
      );
    }

    // Calculate fare components
    const distanceFare = distanceKm * perKmRate;
    const timeFare = durationMinutes * perMinuteRate;
    const subtotal = baseFare + distanceFare + timeFare;
    const surgeFare = subtotal * (surgeMultiplier - 1);
    const total = subtotal + surgeFare;

    // Apply minimum fare
    const finalFare = Math.max(total, minimumFare);

    const fareBreakdown: FareBreakdown = {
      baseFare,
      distanceFare: parseFloat(distanceFare.toFixed(2)),
      timeFare: parseFloat(timeFare.toFixed(2)),
      surgeFare: parseFloat(surgeFare.toFixed(2)),
      total: parseFloat(finalFare.toFixed(2)),
    };

    this.logger.debug(
      `Fare calculation: ${distanceKm.toFixed(2)}km, ${durationMinutes}min → ₹${finalFare.toFixed(2)}`,
    );

    return {
      estimatedFare: fareBreakdown.total,
      fareBreakdown,
      vehicleType,
    };
  }

  /**
   * Calculate surge multiplier based on current conditions
   * @param surgeConfig - Surge pricing configuration
   * @returns Surge multiplier (1.0 = no surge)
   */
  private calculateSurgeMultiplier(surgeConfig: any): number {
    const currentTime = getCurrentTime();
    const currentDay = getCurrentDayOfWeek();

    const { timeRanges = [], daysOfWeek = [] } = surgeConfig.conditions || {};

    // Check if current day matches surge days
    const isDaySurge = daysOfWeek.length === 0 || daysOfWeek.includes(currentDay);

    // Check if current time matches surge time ranges
    let isTimeSurge = timeRanges.length === 0;
    for (const range of timeRanges) {
      if (isTimeInRange(currentTime, range.start, range.end)) {
        isTimeSurge = true;
        break;
      }
    }

    // Apply surge if both conditions met
    if (isDaySurge && isTimeSurge) {
      this.logger.log(`Surge pricing active: ${surgeConfig.multiplier}x`);
      return surgeConfig.multiplier;
    }

    return 1.0;
  }

  /**
   * Seed default fare configurations (run on startup)
   */
  async seedDefaultFareConfigs(): Promise<void> {
    const defaultConfigs = [
      {
        vehicleType: 'BIKE',
        baseFare: 25,
        perKmRate: 8,
        perMinuteRate: 0.5,
        minimumFare: 25,
        priority: 1,
        isActive: true,
      },
      {
        vehicleType: 'AUTO',
        baseFare: 40,
        perKmRate: 12,
        perMinuteRate: 0.75,
        minimumFare: 40,
        priority: 2,
        isActive: true,
      },
      {
        vehicleType: 'HATCHBACK',
        baseFare: 45,
        perKmRate: 13,
        perMinuteRate: 0.9,
        minimumFare: 45,
        priority: 3,
        isActive: true,
      },
      {
        vehicleType: 'SEDAN',
        baseFare: 50,
        perKmRate: 15,
        perMinuteRate: 1,
        minimumFare: 50,
        priority: 4,
        isActive: true,
        surge: {
          enabled: true,
          multiplier: 1.5,
          conditions: {
            timeRanges: [
              { start: '18:00', end: '22:00' },
              { start: '07:00', end: '09:00' },
            ],
            daysOfWeek: [5, 6, 0], // Friday, Saturday, Sunday
            demandThreshold: 10,
          },
        },
      },
      {
        vehicleType: 'SUV',
        baseFare: 70,
        perKmRate: 20,
        perMinuteRate: 1.5,
        minimumFare: 70,
        priority: 5,
        isActive: true,
      },
    ];

    for (const config of defaultConfigs) {
      try {
        await this.fareConfigRepo.upsert(config);
        this.logger.log(`✅ Seeded fare config: ${config.vehicleType}`);
      } catch (error) {
        this.logger.error(`Failed to seed fare config for ${config.vehicleType}:`, error);
      }
    }
  }
}
