import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter } from 'events';
import * as nodes7 from 'nodes7';
import { v4 as uuidv4 } from 'uuid';
import { queueState } from './Interface/plcData.interface';
import { log } from 'console';
@Injectable()
export class PlcCommunicationService {
  constructor() {
    this.test();
  }
  private plcEvent = new EventEmitter();
  public configBlock = {};

  private conn = new nodes7();
  private queue = {
    status: queueState.INIT,
    buffer: [],
  };
  private async test() {
    const dataBlock = {
      barcodeFlag: 'DB47,INT0.1',
      barcodeData: 'DB47,S2.40',
    };
    await this.initConnection(dataBlock);
    this.startScan();
  }

  public initConnection = (setting) => {
    return new Promise<void>((resolve, reject) => {
      this.conn.initiateConnection(
        {
          host: '192.168.0.1',
          port: 102,
          rack: 0,
          slot: 1,
          debug: false,
        },
        (err) => {
          if (typeof err !== 'undefined') {
            console.log(err);
            this.errorCallback('Connection Error');
            reject();
            return;
          }

          console.log(setting);

          this.conn.setTranslationCB((tag) => {
            return setting[tag];
          });

          this.conn.addItems(
            Object.keys(setting).map((key) => {
              return key;
            }),
          );
          this.initScanProcess();
          Logger.log(`[ CONNECTION INIT DONE ] `);
          resolve();
        },
      );
    });
  };

  public startScan = async () => {
    try {
      if (this.queue.status != queueState.READY) {
        return;
      }
      if (this.queue.buffer.length == 0) {
        await this.readFromPlc();
        return this.startScan();
      }
      if (this.queue.buffer.length > 10) {
        this.errorCallback('queue overflow');
        return (this.queue.status = queueState.ERROR);
      }
      await new Promise<void>((resolve, reject) => {
        this.conn.writeItems(
          this.queue.buffer[0].blockName,
          this.queue.buffer[0].data,
          async (err) => {
            if (err) {
              this.errorCallback('Write to plc error');
              console.log(err);
              reject();
              return;
            }
            this.plcEvent.emit(
              this.queue.buffer[0].uuid,
              await this.readFromPlc(),
            );
            resolve();
          },
        );
      });
      this.queue.buffer.shift();
      this.startScan();
    } catch (error) {
      this.errorCallback('Cycle Scan Error');
      setTimeout(() => {
        this.startScan();
      }, 1000);
    }
  };

  public initScanProcess = async () => {
    this.queue.buffer = [];
    this.queue.status = queueState.READY;
    Logger.log(`[ INIT SCAN ] `);
    return;
  };

  public loadConfig = async () => {
    try {
      this.queue.status = queueState.INIT;
      const _plcConfig = [];
      let _config = {};

      for (let i = 0; i <= 20; i++) {
        this.configBlock[`vehicleCode${i}`] = `DB14,C${20 * i}.4`;
      }

      await this.addItem(this.configBlock);

      _config = await this.readFromPlc();

      if (_config == undefined) return;

      for (let i = 0; i <= 20; i++) {
        _plcConfig.push({
          vehicleCode: _config[`vehicleCode${i}`].replaceAll('\x00', ''),
        });
      }

      this.queue.status = queueState.READY;
      this.conn.removeItems();
      this.queue.buffer = [];
      return _plcConfig;
    } catch (error) {
      this.errorCallback('Load Config Error');
    }
  };

  public writeToPLC = (blockName: string[], data: any[], log = true) => {
    return new Promise<void>((resolve) => {
      const _uuid = uuidv4();
      this.queue.buffer.push({
        blockName: blockName,
        data: data,
        uuid: _uuid,
      });
      if (log) Logger.log(`[ WRITE TO PLC ]  : [ ${blockName} ] = ${data} `);
      this.plcEvent.once(_uuid, (data) => {
        resolve(data);
      });
    });
  };

  private readFromPlc = () => {
    return new Promise<any>((resolve, reject) => {
      this.conn.readAllItems((err, data) => {
        if (err) {
          this.errorCallback('Read from plc error');
          reject();
          return;
        }
        this.plcEvent.emit('Plc_Read_Callback', data);
        log(data);
        resolve(data);
      });
    });
  };

  public addItem = (items) => {
    return new Promise<void>((resolve) => {
      this.conn.removeItems();
      this.conn.setTranslationCB((tag) => {
        return items[tag];
      });
      this.conn.addItems(
        Object.keys(items).map((key) => {
          return key;
        }),
      );
      setTimeout(() => {
        resolve();
      }, 100);
    });
  };

  private errorCallback = (err) => {
    this.plcEvent.emit('System_Error', err);
  };
}
