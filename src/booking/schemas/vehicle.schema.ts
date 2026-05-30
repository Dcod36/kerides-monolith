import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

class FareStructure {
  @Prop({ default: 0 })
  minimumFare: number;

  @Prop({ default: 0 })
  perKilometerRate: number;

  @Prop({ default: 0 })
  waitingChargePerMinute: number;
}

@Schema({ 
  timestamps: true,
  collection: 'vehicles'
})
export class Vehicle extends Document {
  @Prop({ 
    type: MongooseSchema.Types.ObjectId, 
    ref: 'Account', 
    required: true,
    index: true 
  })
  driverId: MongooseSchema.Types.ObjectId;

  @Prop({ required: true })
  make: string;

  @Prop({ required: true })
  vehicleModel: string;

  @Prop({ required: true })
  year: number;

  @Prop({ required: true, unique: true })
  registrationNumber: string;

  @Prop({ enum: ['AUTO', 'BIKE', 'HATCHBACK', 'SEDAN', 'SUV'], required: true })
  type: string;

  @Prop({ min: 1, max: 8, required: true })
  seatingCapacity: number;

  @Prop()
  color?: string;

  @Prop({ type: [String], default: [] })
  vehicleImages?: string[];

  @Prop({
    type: {
      insurance: { type: String },
      rc: { type: String },
      permit: { type: String },
      fitness: { type: String },
    },
  })
  documents?: {
    insurance?: string;
    rc?: string;
    permit?: string;
    fitness?: string;
  };

  @Prop({ enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' })
  verificationStatus: 'PENDING' | 'APPROVED' | 'REJECTED';

  @Prop()
  verificationNotes?: string;

  @Prop()
  verifiedAt?: Date;

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  insuranceExpiryDate?: Date;

  @Prop()
  rcExpiryDate?: Date;

  @Prop({ type: FareStructure })
  fareStructure?: FareStructure;

  createdAt?: Date;
  updatedAt?: Date;
}

export const VehicleSchema = SchemaFactory.createForClass(Vehicle);
VehicleSchema.index({ type: 1, isActive: 1 });
