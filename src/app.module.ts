import { Module } from '@nestjs/common';
import { PlcCommunicationModule } from './plc-communication/plc-communication.module';
import { EventEmitterModule } from '@nestjs/event-emitter';

@Module({
  imports: [EventEmitterModule.forRoot(), PlcCommunicationModule],
})
export class AppModule {}
