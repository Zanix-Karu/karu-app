import { Module } from '@nestjs/common';
import { VendorsModule } from '../vendors/vendors.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [VendorsModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
