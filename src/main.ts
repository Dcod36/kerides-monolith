import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // ─── Global Validation Pipe ──────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,            // Strip unknown fields
      transform: true,            // Auto-transform types
      forbidNonWhitelisted: true, // Throw error on unknown fields
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ─── CORS ────────────────────────────────────────────────────────────────────
  const allowedOrigins = (
    process.env.ALLOWED_ORIGINS ||
    'http://localhost:5173,http://localhost:4173'
  )
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  // ─── Swagger API Docs ────────────────────────────────────────────────────────
  const config = new DocumentBuilder()
    .setTitle('Kerides Monolith API')
    .setDescription(
      'Unified API for Kerides ride-booking platform — Auth, Users, Drivers, Bookings',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('Auth', 'Registration, OTP verification, Login')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    customSiteTitle: 'Kerides API Docs',
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'none',
      filter: true,
    },
  });

  // ─── Start Server ────────────────────────────────────────────────────────────
  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`🚀 Kerides Monolith running on http://localhost:${port}`);
  console.log(`📚 Swagger docs:    http://localhost:${port}/api/docs`);
  console.log(`🔐 Auth routes:     http://localhost:${port}/auth`);
}

bootstrap();
