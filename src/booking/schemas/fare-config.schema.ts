import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type FareConfigDocument = FareConfig & Document;

@Schema({ timestamps: true })
export class FareConfig {
  @Prop({ type: String, required: true, unique: true, index: true })
  vehicleType: string;

  @Prop({ type: Number, required: true, min: 0 })
  baseFare: number;

  @Prop({ type: Number, required: true, min: 0 })
  perKmRate: number;

  @Prop({ type: Number, required: true, min: 0 })
  perMinuteRate: number;

  @Prop({ type: Number, required: true, min: 0 })
  minimumFare: number;

  @Prop({
    type: {
      enabled: { type: Boolean, default: false },
      multiplier: { type: Number, default: 1.0, min: 1.0, max: 5.0 },
      conditions: {
        timeRanges: [{ start: String, end: String }],
        daysOfWeek: [Number],
        demandThreshold: Number,
      },
    },
    default: null,
  })
  surge: {
    enabled: boolean;
    multiplier: number;
    conditions: {
      timeRanges: { start: string; end: string }[];
      daysOfWeek: number[];
      demandThreshold: number;
    };
  } | null;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  @Prop({ type: Number, default: 0 })
  priority: number;

  createdAt: Date;
  updatedAt: Date;
}

export const FareConfigSchema = SchemaFactory.createForClass(FareConfig);

FareConfigSchema.index({ vehicleType: 1, isActive: 1 });
FareConfigSchema.index({ isActive: 1, priority: -1 });
