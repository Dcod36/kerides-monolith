import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { NotificationRepository } from '../repositories/notification.repository';
import { NotificationType, NotificationChannel, NotificationStatus } from '../schemas/notification.schema';
import { Types } from 'mongoose';

export interface EmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private transporter: nodemailer.Transporter;

  constructor(private readonly notificationRepo: NotificationRepository) {
    this.initializeTransporter();
  }

  /**
   * Initialize Nodemailer transporter with Gmail SMTP
   */
  private initializeTransporter() {
    const gmailUser = process.env.GMAIL_USER;
    const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;

    if (!gmailUser || !gmailAppPassword) {
      this.logger.warn(
        '⚠️  Gmail credentials not configured. Email notifications will be logged only.',
      );
      this.transporter = null as any;
      return;
    }

    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: gmailUser,
        pass: gmailAppPassword, // App Password, not regular password
      },
    });

    this.logger.log('✅ Gmail SMTP transporter initialized');
  }

  /**
   * Send OTP email to user/driver
   * @param recipientEmail - Recipient email address
   * @param recipientId - User/Driver ID
   * @param otp - Plain OTP (4 digits)
   * @param bookingId - Booking ID (optional)
   */
  async sendOtpEmail(
    recipientEmail: string,
    recipientId: string | Types.ObjectId,
    otp: string,
    bookingId?: string | Types.ObjectId,
  ): Promise<void> {
    const subject = 'Your Kerides Ride OTP';
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .otp-box { background: white; border: 2px dashed #667eea; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; color: #667eea; margin: 20px 0; border-radius: 8px; letter-spacing: 8px; }
          .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
          .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🚗 Kerides Ride Service</h1>
            <p>Ride Completion Verification</p>
          </div>
          <div class="content">
            <p>Hello,</p>
            <p>Your ride is ready to be completed. Please share this OTP with your driver to verify ride completion.</p>
            
            <div class="otp-box">${otp}</div>
            
            <div class="warning">
              <strong>⚠️ Security Notice:</strong><br>
              • This OTP is valid for 5 minutes only<br>
              • Never share this OTP via phone or message<br>
              • Only share with your assigned driver in person<br>
              • Kerides staff will never ask for your OTP
            </div>
            
            <p>If you didn't request this OTP, please ignore this email or contact our support team immediately.</p>
            
            <p>Thank you for using Kerides!</p>
          </div>
          <div class="footer">
            <p>© 2026 Kerides Ride Service. All rights reserved.</p>
            <p>This is an automated email. Please do not reply.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
      Kerides Ride Service - OTP Verification
      
      Your OTP: ${otp}
      
      This OTP is valid for 5 minutes. Share it with your driver to complete your ride.
      
      Security Warning:
      - Never share this OTP via phone or message
      - Only share with your assigned driver in person
      - Kerides staff will never ask for your OTP
      
      Thank you for using Kerides!
    `;

    await this.sendEmail(
      {
        to: recipientEmail,
        subject,
        text,
        html,
      },
      recipientId,
      NotificationType.OTP,
      bookingId,
    );
  }

  /**
   * Send ride request notification to driver (cascading assignment)
   */
  async sendDriverRideRequest(
    driverEmail: string,
    driverId: string | Types.ObjectId,
    rideDetails: {
      bookingId: string;
      pickupAddress: string;
      dropoffAddress: string;
      fare: number;
      distance: number;
      estimatedArrival: string;
    },
  ): Promise<void> {
    const subject = '🚗 New Ride Request - Kerides Driver';
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .ride-details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #667eea; }
          .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
          .detail-label { font-weight: bold; color: #666; }
          .detail-value { color: #333; }
          .fare-box { background: #4caf50; color: white; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; border-radius: 8px; margin: 20px 0; }
          .action-buttons { text-align: center; margin: 30px 0; }
          .btn { display: inline-block; padding: 15px 30px; margin: 0 10px; text-decoration: none; border-radius: 5px; font-weight: bold; }
          .btn-accept { background: #4caf50; color: white; }
          .btn-reject { background: #f44336; color: white; }
          .urgent { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px; }
          .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🚗 New Ride Request!</h1>
            <p>A passenger is waiting for a driver</p>
          </div>
          <div class="content">
            <div class="urgent">
              <strong>⏰ URGENT:</strong> Please respond quickly. This ride request will expire in 3 minutes if not accepted.
            </div>
            
            <div class="ride-details">
              <h3>📍 Ride Details</h3>
              <div class="detail-row">
                <span class="detail-label">Pickup Location:</span>
                <span class="detail-value">${rideDetails.pickupAddress}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Drop-off Location:</span>
                <span class="detail-value">${rideDetails.dropoffAddress}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Distance to Pickup:</span>
                <span class="detail-value">${rideDetails.distance.toFixed(1)} km</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Estimated Arrival:</span>
                <span class="detail-value">${rideDetails.estimatedArrival}</span>
              </div>
            </div>

            <div class="fare-box">
              💰 Estimated Fare: ₹${rideDetails.fare.toFixed(2)}
            </div>

            <div class="action-buttons">
              <a href="kerides://booking/${rideDetails.bookingId}/accept" class="btn btn-accept">✅ Accept Ride</a>
              <a href="kerides://booking/${rideDetails.bookingId}/reject" class="btn btn-reject">❌ Decline</a>
            </div>

            <p style="text-align: center; color: #666; font-size: 14px;">
              <strong>Note:</strong> If you decline this ride, it will be automatically offered to the next nearest driver.
            </p>

            <p style="text-align: center; margin-top: 30px;">
              Open your Kerides Driver app to respond to this request.
            </p>
          </div>
          <div class="footer">
            <p>© 2026 Kerides Driver Service. All rights reserved.</p>
            <p>Booking ID: ${rideDetails.bookingId}</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
      Kerides Driver - New Ride Request
      
      ⏰ URGENT: Please respond quickly (expires in 3 minutes)
      
      RIDE DETAILS:
      Pickup: ${rideDetails.pickupAddress}
      Drop-off: ${rideDetails.dropoffAddress}
      Distance to pickup: ${rideDetails.distance.toFixed(1)} km
      Estimated arrival: ${rideDetails.estimatedArrival}
      
      💰 Estimated Fare: ₹${rideDetails.fare.toFixed(2)}
      
      Open your Kerides Driver app to accept or decline this ride.
      
      Note: If you decline, this ride will be offered to the next nearest driver.
      
      Booking ID: ${rideDetails.bookingId}
    `;

    await this.sendEmail(
      {
        to: driverEmail,
        subject,
        text,
        html,
      },
      driverId,
      NotificationType.RIDE_REQUEST,
      rideDetails.bookingId,
    );
  }

  /**
   * Send booking confirmation email
   */
  async sendBookingConfirmation(
    recipientEmail: string,
    recipientId: string | Types.ObjectId,
    bookingDetails: any,
  ): Promise<void> {
    const subject = 'Booking Confirmed - Kerides';
    const html = `
      <h2>Booking Confirmed!</h2>
      <p>Your ride has been confirmed.</p>
      <p><strong>Pickup:</strong> ${bookingDetails.origin}</p>
      <p><strong>Destination:</strong> ${bookingDetails.destination}</p>
      <p><strong>Estimated Fare:</strong> ₹${bookingDetails.fare}</p>
      <p>Thank you for choosing Kerides!</p>
    `;

    await this.sendEmail(
      {
        to: recipientEmail,
        subject,
        html,
      },
      recipientId,
      NotificationType.BOOKING_CREATED,
      bookingDetails.bookingId,
    );
  }

  /**
   * Send booking cancellation notification email
   */
  async sendBookingCancelledNotification(
    recipientEmail: string,
    recipientId: string | Types.ObjectId,
    details: {
      bookingId: string;
      pickupAddress: string;
      dropoffAddress: string;
      reason: string;
    },
  ): Promise<void> {
    const subject = 'Booking Cancelled - Kerides';
    const html = `
      <h2>Booking Cancelled</h2>
      <p>Your booking could not be completed and has been cancelled.</p>
      <p><strong>Pickup:</strong> ${details.pickupAddress}</p>
      <p><strong>Drop-off:</strong> ${details.dropoffAddress}</p>
      <p><strong>Reason:</strong> ${details.reason}</p>
      <p>Please try booking again. We are sorry for the inconvenience.</p>
    `;

    const text = `
      Booking Cancelled - Kerides

      Your booking has been cancelled.
      Pickup: ${details.pickupAddress}
      Drop-off: ${details.dropoffAddress}
      Reason: ${details.reason}

      Please try booking again.
      Booking ID: ${details.bookingId}
    `;

    await this.sendEmail(
      {
        to: recipientEmail,
        subject,
        text,
        html,
      },
      recipientId,
      NotificationType.BOOKING_CANCELLED,
      details.bookingId,
    );
  }

  /**
   * Generic email sending function
   */
  private async sendEmail(
    emailOptions: EmailOptions,
    recipientId: string | Types.ObjectId,
    type: NotificationType,
    bookingId?: string | Types.ObjectId,
  ): Promise<void> {
    // Create notification record
    const notification = await this.notificationRepo.create({
      recipientId: new Types.ObjectId(recipientId),
      bookingId: bookingId ? new Types.ObjectId(bookingId) : null,
      type,
      channel: NotificationChannel.EMAIL,
      status: NotificationStatus.PENDING,
      recipient: emailOptions.to,
      subject: emailOptions.subject,
      message: emailOptions.text || emailOptions.html || '',
    });

    // If transporter not configured, just log (development mode)
    if (!this.transporter) {
      this.logger.log(`📧 [DEV MODE] Email would be sent to: ${emailOptions.to}`);
      this.logger.log(`   Subject: ${emailOptions.subject}`);
      if (type === NotificationType.OTP) {
        // Extract OTP from HTML for logging
        const otpMatch = emailOptions.html?.match(/<div class="otp-box">(\d{4})<\/div>/);
        if (otpMatch) {
          this.logger.log(`   OTP: ${otpMatch[1]}`);
        }
      }

      await this.notificationRepo.markAsSent(notification._id);
      return;
    }

    // Send email
    try {
      await this.transporter.sendMail({
        from: `"Kerides Ride Service" <${process.env.GMAIL_USER}>`,
        to: emailOptions.to,
        subject: emailOptions.subject,
        text: emailOptions.text,
        html: emailOptions.html,
      });

      await this.notificationRepo.markAsSent(notification._id);
      this.logger.log(`✅ Email sent to ${emailOptions.to}: ${emailOptions.subject}`);
    } catch (error) {
      this.logger.error(`❌ Failed to send email to ${emailOptions.to}:`, error);
      await this.notificationRepo.markAsFailed(
        notification._id,
        error.message,
        notification.retryCount + 1,
      );
      throw error;
    }
  }

  /**
   * Verify Gmail connection (for health checks)
   */
  async verifyConnection(): Promise<boolean> {
    if (!this.transporter) {
      return false;
    }

    try {
      await this.transporter.verify();
      return true;
    } catch (error) {
      this.logger.error('Gmail connection verification failed:', error);
      return false;
    }
  }

  /**
   * Send OTP email to user when driver accepts ride (for RIDE START verification)
   */
  async sendRideStartOtpEmail(
    recipientEmail: string,
    recipientId: string | Types.ObjectId,
    otp: string,
    rideDetails: {
      bookingId: string;
      driverName: string;
      vehicleInfo: string;
      licensePlate: string;
      pickupAddress: string;
      dropoffAddress: string;
      estimatedFare: number;
    },
  ): Promise<void> {
    const subject = '🔐 Your Ride OTP - Driver is on the way!';
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #4caf50 0%, #2e7d32 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .otp-box { background: white; border: 3px dashed #4caf50; padding: 25px; text-align: center; font-size: 36px; font-weight: bold; color: #4caf50; margin: 25px 0; border-radius: 10px; letter-spacing: 10px; }
          .driver-info { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2196f3; }
          .ride-details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ff9800; }
          .detail-row { padding: 8px 0; border-bottom: 1px solid #eee; }
          .detail-label { font-weight: bold; color: #666; }
          .warning { background: #ffebee; border-left: 4px solid #f44336; padding: 15px; margin: 20px 0; border-radius: 4px; }
          .success { background: #e8f5e9; border-left: 4px solid #4caf50; padding: 15px; margin: 20px 0; border-radius: 4px; }
          .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🚗 Your Driver is On the Way!</h1>
            <p>A driver has accepted your ride request</p>
          </div>
          <div class="content">
            <div class="success">
              <strong>✅ Great News!</strong> A driver has accepted your ride request and is heading to your pickup location.
            </div>

            <h3>🚘 Your Driver</h3>
            <div class="driver-info">
              <div class="detail-row">
                <span class="detail-label">Driver Name:</span>
                <span>${rideDetails.driverName}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Vehicle:</span>
                <span>${rideDetails.vehicleInfo}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">License Plate:</span>
                <span style="font-weight: bold; font-size: 18px;">${rideDetails.licensePlate}</span>
              </div>
            </div>

            <h3>📍 Trip Details</h3>
            <div class="ride-details">
              <div class="detail-row">
                <span class="detail-label">Pickup:</span>
                <span>${rideDetails.pickupAddress}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Drop-off:</span>
                <span>${rideDetails.dropoffAddress}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Estimated Fare:</span>
                <span style="font-weight: bold; color: #4caf50;">₹${rideDetails.estimatedFare.toFixed(2)}</span>
              </div>
            </div>

            <h3 style="text-align: center;">🔐 Your Ride Start OTP</h3>
            <p style="text-align: center;">Share this OTP with your driver to START the ride when they arrive:</p>
            
            <div class="otp-box">${otp}</div>
            
            <div class="warning">
              <strong>⚠️ Important Security Notice:</strong><br><br>
              • This OTP is valid for <strong>15 minutes</strong><br>
              • Only share this OTP when you are <strong>inside the vehicle</strong><br>
              • <strong>Never share this OTP via phone, SMS, or message</strong><br>
              • Verify the vehicle license plate before getting in<br>
              • Kerides staff will NEVER ask for your OTP
            </div>
            
            <p style="text-align: center; margin-top: 30px;">
              <strong>Steps to Start Your Ride:</strong><br>
              1️⃣ Wait at the pickup location<br>
              2️⃣ Verify the driver's vehicle and license plate<br>
              3️⃣ Get inside the vehicle<br>
              4️⃣ Tell the driver your OTP to start the ride
            </p>
          </div>
          <div class="footer">
            <p>© 2026 Kerides Ride Service. All rights reserved.</p>
            <p>Booking ID: ${rideDetails.bookingId}</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
      Kerides Ride Service - Your Driver is On the Way!
      
      ✅ A driver has accepted your ride and is heading to you.
      
      DRIVER DETAILS:
      Name: ${rideDetails.driverName}
      Vehicle: ${rideDetails.vehicleInfo}
      License Plate: ${rideDetails.licensePlate}
      
      TRIP DETAILS:
      Pickup: ${rideDetails.pickupAddress}
      Drop-off: ${rideDetails.dropoffAddress}
      Estimated Fare: ₹${rideDetails.estimatedFare.toFixed(2)}
      
      🔐 YOUR RIDE START OTP: ${otp}
      
      Share this OTP with your driver when you get in the vehicle to START the ride.
      This OTP is valid for 15 minutes.
      
      SECURITY WARNING:
      - Only share OTP when INSIDE the vehicle
      - Never share via phone/SMS
      - Verify license plate before getting in
      
      Booking ID: ${rideDetails.bookingId}
    `;

    await this.sendEmail(
      {
        to: recipientEmail,
        subject,
        text,
        html,
      },
      recipientId,
      NotificationType.OTP,
      rideDetails.bookingId,
    );
  }

  /**
   * Send notification to user when driver has arrived
   */
  async sendDriverArrivedNotification(
    recipientEmail: string,
    recipientId: string | Types.ObjectId,
    rideDetails: {
      bookingId: string;
      driverName: string;
      vehicleInfo: string;
      licensePlate: string;
      pickupAddress?: string;
    },
  ): Promise<void> {
    const subject = '🚗 Your Driver Has Arrived!';
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #2196f3 0%, #1976d2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .otp-reminder { background: white; border: 3px dashed #2196f3; padding: 25px; text-align: center; margin: 25px 0; border-radius: 10px; }
          .alert { background: #e3f2fd; border-left: 4px solid #2196f3; padding: 20px; margin: 20px 0; border-radius: 4px; }
          .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🚗 Your Driver Has Arrived!</h1>
            <p>${rideDetails.driverName} is waiting for you</p>
          </div>
          <div class="content">
            <div class="alert">
              <strong>📍 Your driver is at the pickup location!</strong><br>
              ${rideDetails.pickupAddress ? `<p>Location: ${rideDetails.pickupAddress}</p>` : ''}
              Look for: <strong>${rideDetails.vehicleInfo}</strong><br>
              License Plate: <strong style="font-size: 20px;">${rideDetails.licensePlate}</strong>
            </div>

            <div class="otp-reminder">
              <h3 style="margin: 0;">🔑 Ready to Start Your Ride?</h3>
              <p style="margin: 10px 0 0 0;">
                Use the OTP you received when the driver accepted your booking.<br>
                Share this OTP with ${rideDetails.driverName} to start your ride.
              </p>
            </div>
            
            <p style="text-align: center;">
              <em>Can't find your OTP? Check the earlier email or request a new one through the app.</em>
            </p>
          </div>
          <div class="footer">
            <p>© 2026 Kerides Ride Service</p>
          </div>
        </div>
      </body>
      </html>
    `;

    await this.sendEmail(
      {
        to: recipientEmail,
        subject,
        text: `Your driver ${rideDetails.driverName} has arrived at ${rideDetails.pickupAddress || 'the pickup location'}! Vehicle: ${rideDetails.vehicleInfo}, License: ${rideDetails.licensePlate}. Share the OTP you received earlier to start your ride.`,
        html,
      },
      recipientId,
      NotificationType.DRIVER_ARRIVED,
      rideDetails.bookingId,
    );
  }
}
