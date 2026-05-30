import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { FareConfig, FareConfigDocument } from '../schemas/fare-config.schema';

@Injectable()
export class FareConfigRepository {
  constructor(
    @InjectModel(FareConfig.name) private readonly fareConfigModel: Model<FareConfigDocument>,
  ) {}

  async create(fareConfigData: Partial<FareConfig>): Promise<FareConfigDocument> {
    const fareConfig = new this.fareConfigModel(fareConfigData);
    return fareConfig.save();
  }

  async findByVehicleType(vehicleType: string): Promise<FareConfigDocument | null> {
    return this.fareConfigModel
      .findOne({ vehicleType, isActive: true })
      .exec();
  }

  async findAll(activeOnly: boolean = true): Promise<FareConfigDocument[]> {
    const query = activeOnly ? { isActive: true } : {};
    return this.fareConfigModel
      .find(query)
      .sort({ priority: -1, vehicleType: 1 })
      .exec();
  }

  async update(
    vehicleType: string,
    update: Partial<FareConfig>,
  ): Promise<FareConfigDocument | null> {
    return this.fareConfigModel
      .findOneAndUpdate({ vehicleType }, update, { new: true })
      .exec();
  }

  async upsert(fareConfigData: Partial<FareConfig>): Promise<FareConfigDocument> {
    return this.fareConfigModel
      .findOneAndUpdate(
        { vehicleType: fareConfigData.vehicleType },
        fareConfigData,
        { upsert: true, new: true },
      )
      .exec();
  }

  async delete(vehicleType: string): Promise<FareConfigDocument | null> {
    return this.fareConfigModel
      .findOneAndDelete({ vehicleType })
      .exec();
  }

  async deactivate(vehicleType: string): Promise<FareConfigDocument | null> {
    return this.fareConfigModel
      .findOneAndUpdate(
        { vehicleType },
        { isActive: false },
        { new: true },
      )
      .exec();
  }
}
