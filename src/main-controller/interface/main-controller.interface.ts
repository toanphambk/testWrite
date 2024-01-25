import { PlcData } from 'src/plc-communication/interface/plc-communication.interface';

export interface SystemData {
  plc: PlcData;
}

export type Service = keyof SystemData;

export interface Payload {
  service: Service;
  data: any;
  key: keyof (keyof PlcData);
  oldVal: any;
  val: any;
}
