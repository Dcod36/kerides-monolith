import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Stand, StandDocument } from '../schemas/stand.schema';

@Injectable()
export class StandRepository {
  constructor(
    @InjectModel(Stand.name) private readonly standModel: Model<StandDocument>,
  ) {}

  private toObjectId(id: string | Types.ObjectId): Types.ObjectId | null {
    if (id instanceof Types.ObjectId) return id;
    if (!Types.ObjectId.isValid(id)) return null;
    return new Types.ObjectId(id);
  }

  /** Flatten GeoJSON coordinates to { latitude, longitude } for frontend consumption */
  private toFlat(stand: any): any {
    if (!stand) return null;
    return {
      ...stand,
      latitude: stand.location?.coordinates?.[1] ?? null,
      longitude: stand.location?.coordinates?.[0] ?? null,
    };
  }

  async create(data: {
    name: string;
    latitude: number;
    longitude: number;
    radiusKm?: number;
    isActive?: boolean;
    address?: string | null;
    landmark?: string | null;
  }): Promise<any> {
    const created = await this.standModel.create({
      name: data.name,
      location: {
        type: 'Point',
        coordinates: [data.longitude, data.latitude], // GeoJSON order: [lng, lat]
      },
      radiusKm: data.radiusKm ?? 2,
      isActive: data.isActive ?? true,
      address: data.address ?? null,
      landmark: data.landmark ?? null,
    });
    return this.toFlat(created.toObject());
  }

  async findById(id: string | Types.ObjectId): Promise<any | null> {
    const objectId = this.toObjectId(String(id));
    if (!objectId) return null;
    const stand = await this.standModel.findById(objectId).lean().exec();
    return this.toFlat(stand);
  }

  async findAll(filters: { isActive?: boolean; search?: string }): Promise<any[]> {
    const query: Record<string, any> = {};

    if (typeof filters.isActive === 'boolean') {
      query.isActive = filters.isActive;
    }

    let stands = await this.standModel
      .find(query)
      .sort({ createdAt: -1 })
      .lean()
      .exec() as any[];

    const searchText = String(filters.search || '').trim().toLowerCase();
    if (searchText) {
      stands = stands.filter((stand) => {
        const haystack = [stand.name, stand.address, stand.landmark]
          .map((v) => String(v || '').toLowerCase())
          .join(' ');
        return haystack.includes(searchText);
      });
    }

    return stands.map((stand) => this.toFlat(stand));
  }

  async updateById(
    id: string | Types.ObjectId,
    update: {
      name?: string;
      latitude?: number;
      longitude?: number;
      radiusKm?: number;
      isActive?: boolean;
      address?: string | null;
      landmark?: string | null;
    },
  ): Promise<any | null> {
    const objectId = this.toObjectId(String(id));
    if (!objectId) return null;

    const $set: Record<string, any> = {};

    if (update.name !== undefined) $set.name = update.name;
    if (update.radiusKm !== undefined) $set.radiusKm = update.radiusKm;
    if (update.isActive !== undefined) $set.isActive = update.isActive;
    if (update.address !== undefined) $set.address = update.address;
    if (update.landmark !== undefined) $set.landmark = update.landmark;

    // Update GeoJSON location only if both coordinates provided
    if (update.latitude !== undefined && update.longitude !== undefined) {
      $set.location = {
        type: 'Point',
        coordinates: [update.longitude, update.latitude],
      };
    }

    const stand = await this.standModel
      .findByIdAndUpdate(objectId, { $set }, { new: true })
      .lean()
      .exec();

    return this.toFlat(stand);
  }

  async updateStatus(id: string | Types.ObjectId, isActive: boolean): Promise<any | null> {
    const objectId = this.toObjectId(String(id));
    if (!objectId) return null;

    const stand = await this.standModel
      .findByIdAndUpdate(objectId, { $set: { isActive } }, { new: true })
      .lean()
      .exec();

    return this.toFlat(stand);
  }

  async deleteById(id: string | Types.ObjectId): Promise<any | null> {
    const objectId = this.toObjectId(String(id));
    if (!objectId) return null;
    return this.standModel.findByIdAndDelete(objectId).lean().exec();
  }
}
