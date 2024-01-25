import {
  BlockInfo,
  BlockName,
  S7CommunicationSetting,
} from '../plc-communication/interface/plc-communication.interface';

export type Configuration = {
  blockSetting: BlockSetting;
  plcSetting: S7CommunicationSetting;
};

export type BlockSetting = {
  [key in BlockName]: BlockInfo;
};
