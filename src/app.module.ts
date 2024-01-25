import { Module } from '@nestjs/common';
import { PlcCommunicationModule } from './plc-communication/plc-communication.module';

@Module({
  imports: [PlcCommunicationModule],
})
export class AppModule {}
