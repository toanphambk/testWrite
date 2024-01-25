import yargs from 'yargs';
import { Configuration } from './configuration.interface';

const configuration: Configuration = {
  blockSetting: {
    barcodeData: {
      address: 'DB47,S2.40',
      type: 'WRITE_ONLY',
    },
    barcodeFlag: {
      address: 'DB40,INT0.1',
      type: 'READ_WRITE',
    },
  },
  plcSetting: {
    ip: '192.168.0.1',
    port: 102,
    rack: 0,
    slot: 1,
  },
};

export default configuration;
