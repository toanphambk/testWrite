import { Injectable } from '@nestjs/common';
import * as _ from 'lodash';
import * as nodes7 from 'nodes7';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import {
  PlcAddresslist,
  PlcData,
  Configuration,
  BlockSetting,
  PlcWriteQueue,
  BlockName,
} from './interface/plc-communication.interface';
import { S7CommunicationSetting } from './interface/plc-communication.interface';
import { ServiceState } from './interface/systemState.interface';
import { Payload } from 'src/plc-communication/interface/main-controller.interface';
import { log } from 'console';

const configuration: Configuration = {
  blockSetting: {
    barcodeData: {
      address: 'DB47,S2.40',
      type: 'WRITE_ONLY',
    },
    barcodeFlag: {
      address: 'DB47,INT0.1',
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

@Injectable()
export class PlcCommunicationService {
  constructor(private PlcCommunicationServiceEvent: EventEmitter2) {
    this.data = new Proxy(this.data, this.dataChangeHandler());
    this.test();
  }

  private s7Connection = new nodes7();
  private plcEvent = new EventEmitter();
  private data = <PlcData>{ state: ServiceState.BOOT_UP };
  private plcWriteQueue: PlcWriteQueue[] = [];
  private addressList: PlcAddresslist;

  private async test() {
    await this.initConnection(configuration.plcSetting);
    await this.addDataBlock(configuration.blockSetting);
    void this.triggerCycleScan();
    this.writeBlock(['barcodeData'], ['123123123']);
    this.writeBlock(['barcodeFlag'], [1]);
  }

  public async initConnection(
    setting: S7CommunicationSetting,
  ): Promise<boolean> {
    console.log(`[ INIT CONNECTION ] : ${JSON.stringify(setting, null, 1)}`);
    this.data.state = ServiceState.INIT;
    try {
      await this.establishConnection(setting);
      this.triggerCycleScan();
      return true;
    } catch (err) {
      this.errorHandler('INTI CONNECTION ERROR', false, err);
      return false;
    }
  }

  private establishConnection(setting: S7CommunicationSetting): Promise<void> {
    return new Promise((resolve, reject) => {
      this.s7Connection.initiateConnection(
        {
          port: setting.port,
          host: setting.ip,
          rack: setting.rack,
          slot: setting.slot,
          debug: true,
        },
        (err) => (err ? reject(err) : resolve()),
      );
    });
  }

  public addDataBlock = async (dataBlockSetting: BlockSetting) => {
    if (this.data.state == ServiceState.ERROR) {
      throw new Error('Plc Communication Service Is Not Ready');
    }

    if (this.data.state == ServiceState.READY) {
      this.data.state = ServiceState.INIT;
      this.s7Connection.removeItems();
    }

    this.addressList = { read: [], write: [] };

    Object.entries(dataBlockSetting).forEach(([key, setting]) => {
      if (['READ_ONLY', 'READ_WRITE'].includes(setting.type)) {
        this.addressList.read.push({ name: key, address: setting.address });
      }
      if (['WRITE_ONLY', 'READ_WRITE'].includes(setting.type)) {
        this.addressList.write.push({ name: key, address: setting.address });
      }
    });
    log(this.addressList);
    const readingAdressList = this.addressList.read.map(
      (block) => block.address,
    );

    this.s7Connection.addItems(readingAdressList);

    await new Promise<void>((res) => {
      setTimeout(() => {
        res();
      }, 200);
    });
    await this.dataUpdate();
    return true;
  };

  private triggerCycleScan = async () => {
    try {
      if (this.data.state != ServiceState.READY) {
        console.log('[ PLC Service ]: PLC Service Is Not Ready');
        this.plcWriteQueue = [];
        await new Promise<void>((res) => {
          setTimeout(() => {
            res();
          }, 1000);
        });
        return;
      }

      if (this.plcWriteQueue.length > 10) {
        this.errorHandler('QUEUE OVERFLOW', false, this.plcWriteQueue);
        return;
      }

      if (this.plcWriteQueue.length > 0) {
        await new Promise<void>((res, rej) => {
          const command = this.plcWriteQueue[0];
          this.s7Connection.writeItems(
            command.blockName,
            command.data,
            async (err) => {
              if (err) {
                rej(this.errorHandler(`WRITE TO PLC ERROR : `, false, command));
                return;
              }
              this.plcWriteQueue.shift();
              this.plcEvent.emit(command.uuid, undefined);
              res();
            },
          );
        });
      }
      await this.dataUpdate();
    } catch (error) {
      this.errorHandler('CYCLE SCAN ERROR', false);
    } finally {
      void this.triggerCycleScan();
    }
  };

  private dataUpdate = async () => {
    try {
      const dataFromPLC = await this.readFromPlc();
      console.log(this.data);

      Object.keys(dataFromPLC).map((address) => {
        const found = this.addressList.read.find(
          (block) => block.address === address,
        );
        if (found) {
          this.data[found.name] = dataFromPLC[address];
          return;
        }
        throw new Error('Address not found in read array');
      });
      this.data.state = ServiceState.READY;
    } catch (error) {
      this.errorHandler('READ FROM PLC ERROR', true, error);
    }
  };

  public writeBlock = (blockName: BlockName[], data: any[], log = true) => {
    return new Promise<boolean>((res, rej) => {
      const { isValid, blockAddress } = this.blockInfoIsValid(blockName);
      if (!isValid) {
        rej('DATA BLOCK IS NOT VALID');
        return;
      }
      const uuid = uuidv4();
      this.plcWriteQueue.push({
        blockName: blockAddress,
        data: data,
        uuid,
      });
      this.plcEvent.once(uuid, (err) => {
        if (err) {
          rej(err);
          return;
        }
        if (log)
          console.log(`[ WRITE TO PLC DONE] : [ ${blockName} ] =[ ${data} ]`);
        res(true);
        return;
      });
    });
  };

  private readFromPlc = () => {
    return new Promise<any>((res, rej) => {
      this.s7Connection.readAllItems((err, data) => {
        if (err) {
          rej({ error: err, plcData: data });
          return;
        }
        res(data);
      });
    });
  };

  private dataChangeHandler = () => {
    return {
      set: (target, key, val) => {
        const oldVal = target[key];
        if (oldVal != val) {
          target[key] = val;
          const data: Payload = {
            service: 'plc',
            data: this.data,
            key,
            oldVal,
            val,
          };
          this.PlcCommunicationServiceEvent.emit('dataChange', data);
          log(data);
          return true;
        }
        return true;
      },
      get: (target, key) => {
        if (typeof target[key] === 'object' && target[key] !== null) {
          return new Proxy(target[key], this.dataChangeHandler());
        }
        return target[key];
      },
    };
  };

  private errorHandler = async (
    err: string,
    isOperational: boolean,
    data?: any,
  ) => {
    console.log(`[ ERROR ] :  ${err} : ${data ? JSON.stringify(data) : ''}`);
    if (!isOperational) {
      this.data.state = ServiceState.ERROR;
      //do some other logging, event trigger for this
      return;
    }

    switch (err) {
      case 'READ FROM PLC ERROR':
        this.data.state = ServiceState.ERROR;
        const isBadReading = Object.values(data.plcData).find(
          (val: unknown) => typeof val == 'string' && val.includes('BAD'),
        );
        if (isBadReading) {
          await new Promise<void>((res) => {
            setTimeout(() => {
              this.dataUpdate();
              res();
            }, 500);
          });
        }
        break;
    }
    return;
  };

  private blockInfoIsValid = (
    blocksName: BlockName[],
  ): { isValid: boolean; blockAddress: string[] } => {
    let isValid = true;
    const blockAddress: string[] = [];
    blocksName.forEach((blockName) => {
      const foundBlock = this.addressList.write.find(
        (writeBlock) => writeBlock.name === blockName,
      );
      if (!foundBlock) {
        console.log(
          `[ ERROR ]: Can not find valid address ${JSON.stringify(blockName)}`,
        );
        isValid = false;
        return;
      }
      blockAddress.push(foundBlock.address);
    });
    console.log({ isValid, blockAddress });
    return { isValid, blockAddress };
  };
}
