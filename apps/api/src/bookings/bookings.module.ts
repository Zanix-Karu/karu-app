import { Module } from '@nestjs/common';
import { VehiclesModule } from '../vehicles/vehicles.module';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';

@Module({
  imports: [VehiclesModule],
  controllers: [BookingsController],
  providers: [BookingsService],
})
export class BookingsModule {}
