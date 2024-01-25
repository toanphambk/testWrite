import { PlcData } from 'src/plc-communication/interface/plc-communication.interface';

export interface SystemData {
  plc: PlcData;
}

export interface Payload {
  data: any;
  key: keyof (keyof PlcData);
  oldVal: any;
  val: any;
}
