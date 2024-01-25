export type Configuration = {
  blockSetting: BlockSetting;
  plcSetting: S7CommunicationSetting;
};
export type S7CommunicationSetting = {
  ip: string;
  port: number;
  rack: number;
  slot: number;
};

export type PlcWriteQueue = {
  blockName: string[];
  data: any[];
  uuid: string;
};

export type BlockSetting = {
  [key in BlockName]: BlockInfo;
};

export type BlockInfo = {
  address: string;
  type: BlockType;
};
export interface PlcAddresslist {
  read: { name: string; address: string }[];
  write: { name: string; address: string }[];
}

export type BlockType = 'READ_ONLY' | 'READ_WRITE' | 'WRITE_ONLY';
export type BlockName = 'barcodeData' | 'barcodeFlag';

export type PlcData = {
  [key in BlockName | 'state']: any;
};
