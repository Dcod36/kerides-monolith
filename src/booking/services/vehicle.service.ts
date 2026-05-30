import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateVehicleDto } from '../dto/create-vehicle.dto';

@Injectable()
export class VehicleService {
  constructor(
    @InjectModel('Vehicle') private readonly vehicleModel: Model<any>,
  ) {}

  async create(driverId: string, createDto: CreateVehicleDto) {
    // Check if registration number already exists
    const existing = await this.vehicleModel.findOne({
      registrationNumber: createDto.registrationNumber,
    }).lean().exec();
    
    if (existing) {
      throw new ConflictException('Vehicle with this registration number already exists');
    }

    const created = await this.vehicleModel.create({
      driverId: new Types.ObjectId(driverId),
      ...createDto,
    });

    return created;
  }

  async findMyVehicles(driverId: string) {
    return this.vehicleModel.find({
      driverId: new Types.ObjectId(driverId),
      isActive: { $ne: false },
    }).lean().exec();
  }

  async findById(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Invalid Vehicle ID');
    }
    const vehicle = await this.vehicleModel.findById(id).lean().exec();
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }
    return vehicle;
  }

  async update(id: string, driverId: string, updateData: Partial<CreateVehicleDto>) {
    const vehicle = await this.findById(id);

    if (vehicle.driverId.toString() !== driverId) {
      throw new ForbiddenException('You can only update your own vehicles');
    }

    const updated = await this.vehicleModel
      .findByIdAndUpdate(id, { $set: updateData }, { new: true })
      .lean()
      .exec();

    if (!updated) {
      throw new NotFoundException('Vehicle not found');
    }

    return updated;
  }

  async deactivate(id: string, driverId: string) {
    const vehicle = await this.findById(id);

    if (vehicle.driverId.toString() !== driverId) {
      throw new ForbiddenException('You can only deactivate your own vehicles');
    }

    return this.vehicleModel
      .findByIdAndUpdate(id, { $set: { isActive: false } }, { new: true })
      .lean()
      .exec();
  }

  async listVehiclesForAdmin(filters: {
    verificationStatus?: string;
    isActive?: string;
    driverId?: string;
  }) {
    const query: Record<string, any> = {};

    if (filters.verificationStatus) {
      query.verificationStatus = String(filters.verificationStatus).toUpperCase();
    }

    if (typeof filters.isActive === 'string') {
      query.isActive = String(filters.isActive).toLowerCase() === 'true';
    }

    if (filters.driverId) {
      if (Types.ObjectId.isValid(filters.driverId)) {
        query.driverId = new Types.ObjectId(filters.driverId);
      } else {
        query.driverId = filters.driverId;
      }
    }

    return this.vehicleModel.find(query).lean().exec();
  }

  async updateVerificationForAdmin(
    id: string,
    payload: { verificationStatus?: string; verificationNotes?: string },
  ) {
    const update: Record<string, any> = {};

    if (payload.verificationStatus) {
      update.verificationStatus = payload.verificationStatus;
    }

    if (payload.verificationNotes !== undefined) {
      update.verificationNotes = payload.verificationNotes;
    }

    if (Object.keys(update).length > 0) {
      update.verifiedAt = new Date();
    }

    const updated = await this.vehicleModel
      .findByIdAndUpdate(id, { $set: update }, { new: true })
      .lean()
      .exec();

    if (!updated) {
      throw new NotFoundException('Vehicle not found');
    }

    return updated;
  }

  async getVehicleForAdmin(id: string) {
    return this.findById(id);
  }

  async bulkApproveForAdmin() {
    const now = new Date();
    const result = await this.vehicleModel.updateMany(
      { verificationStatus: { $ne: 'APPROVED' } },
      { $set: { verificationStatus: 'APPROVED', verifiedAt: now } },
    );

    return {
      matched: result.matchedCount,
      modified: result.modifiedCount,
    };
  }
}
