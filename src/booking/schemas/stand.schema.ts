import { Prop, Schema, SchemaFactory, raw } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type StandDocument = Stand & Document;

@Schema({ timestamps: true, collection: 'stands' })
export class Stand extends Document {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop(
    raw({
      type: { type: String, enum: ['Point'], required: true, default: 'Point' },
      coordinates: { type: [Number], required: true },
    }),
  )
  location: {
    type: 'Point';
    coordinates: [number, number]; // [longitude, latitude]
  };

  @Prop({ default: 2, min: 0 })
  radiusKm: number;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ trim: true, default: null })
  address: string | null;

  @Prop({ trim: true, default: null })
  landmark: string | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const StandSchema = SchemaFactory.createForClass(Stand);
StandSchema.index({ location: '2dsphere' });
