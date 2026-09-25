import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { SupabaseModule } from './supabase/supabase.module';
import { AuthModule } from './auth/auth.module';
import { ProfilesModule } from './profiles/profiles.module';
import { VendorsModule } from './vendors/vendors.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { BookingsModule } from './bookings/bookings.module';
import { ReviewsModule } from './reviews/reviews.module';
import { PaymentsModule } from './payments/payments.module';
import { MessagesModule } from './messages/messages.module';
import { AdminModule } from './admin/admin.module';
import { FeedbackModule } from './feedback/feedback.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    // Loads the repo-root .env so the API and web app share one config file.
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../../.env', '.env'] }),
    // Global baseline; individual write endpoints (bookings, messages,
    // feedback) tighten this further with their own @Throttle().
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    SupabaseModule,
    AuthModule,
    ProfilesModule,
    VendorsModule,
    VehiclesModule,
    BookingsModule,
    ReviewsModule,
    PaymentsModule,
    MessagesModule,
    AdminModule,
    FeedbackModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
