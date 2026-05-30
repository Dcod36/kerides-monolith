import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RideLocationDocument = RideLocation & Document;

class Coordinates {
  @Prop({ type: Number, required: true })
  lat: number;

  @Prop({ type: Number, required: true })
  lng: number;
}

@Schema({ timestamps: true, collection: 'ride_locations' })
export class RideLocation {
  @Prop({ type: Types.ObjectId, required: true, unique: true, index: true })
  bookingId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  driverId: Types.ObjectId;

  @Prop({ type: Coordinates, required: true })
  coordinates: Coordinates;

  @Prop({ type: Number, default: null })
  speedKmph: number | null;

  @Prop({ type: Number, default: null })
  heading: number | null;

  @Prop({ type: Number, default: null })
  accuracyMeters: number | null;

  @Prop({ type: Date, required: true, index: true })
  recordedAt: Date;

  createdAt: Date;
  updatedAt: Date;
}

export const RideLocationSchema = SchemaFactory.createForClass(RideLocation);
RideLocationSchema.index({ bookingId: 1, recordedAt: -1 });
