import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

class EmergencyContact {
  @Prop()
  name?: string;

  @Prop()
  phone?: string;

  @Prop()
  relationship?: string;
}

@Schema({ 
  timestamps: true,
  collection: 'driver_profiles'
})
export class DriverProfile extends Document {
  @Prop({ 
    type: MongooseSchema.Types.ObjectId, 
    ref: 'Account', 
    required: true, 
    unique: true,
    index: true 
  })
  accountId: MongooseSchema.Types.ObjectId;

  @Prop({ enum: ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'] })
  bloodGroup?: string;

  @Prop()
  dateOfBirth?: Date;

  @Prop({ type: [String], default: [] })
  languages?: string[];

  @Prop({ unique: true, sparse: true })
  licenseNumber?: string;

  @Prop()
  licensedSince?: Date;

  @Prop({ min: 0 })
  experienceYears?: number;

  @Prop({ default: 0, min: 0 })
  totalTrips: number;

  @Prop({ default: 0, min: 0, max: 5 })
  rating: number;

  @Prop({ default: false })
  isOnline: boolean;

  @Prop({ default: false })
  isVerified: boolean;

  @Prop({ enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' })
  verificationStatus: 'PENDING' | 'APPROVED' | 'REJECTED';

  @Prop()
  verificationNotes?: string;

  @Prop()
  verifiedAt?: Date;

  @Prop()
  profileImage?: string;

  @Prop()
  drivingLicenseCertificate?: string;

  @Prop()
  policeClearanceCertificate?: string;

  @Prop()
  medicalFitnessCertificate?: string;

  @Prop()
  addressProof?: string;

  @Prop()
  professionalTrainingCertificate?: string;

  @Prop({ type: EmergencyContact })
  emergencyContact?: EmergencyContact;

  @Prop()
  latitude?: number;

  @Prop()
  longitude?: number;

  @Prop()
  lastLocationUpdate?: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Stand' })
  assignedStandId?: Types.ObjectId;

  createdAt?: Date;
  updatedAt?: Date;
}

export const DriverProfileSchema = SchemaFactory.createForClass(DriverProfile);
DriverProfileSchema.index({ isOnline: 1, isVerified: 1 });
