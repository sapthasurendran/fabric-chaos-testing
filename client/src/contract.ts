import * as config from './utils/config';
import {
    Contract,
    Gateway,
    Network,
    ProposalOptions,
    Status,
} from 'fabric-gateway';
import { TransactionDescriptor } from './transactionData';
import {  sleep, timeout } from './utils/helper';

import { Logger } from './utils/logger';

type EventData ={
    payload:string,
    eventName:string,
    txnID:string

}
export class CCHelper {
  contract: Contract;
  network: Network;
  channel = '';
  chaincode = '';
  unfinishedTransactions = 0;
  events:EventData[]=[]


  constructor(gateway: Gateway, channel: string, chaincode: string) {
      this.chaincode = chaincode;
      this.channel = channel;
      this.network = gateway.getNetwork(channel);
      this.contract = this.network.getContract(chaincode);
      this.getChaincodeEvents()


  }

  getUnfinishedTransactions(): number {
      return this.unfinishedTransactions;
  }
  getContract(): Contract {
      return this.contract;
  }

  getNetwork(): Network {
      return this.network;
  }
  async runTransaction(transactionData:TransactionDescriptor):Promise<void>{
      if(transactionData.type === 'submit'){
          await this.submitTransaction(transactionData.name,transactionData.params)
      }else{
          await this.evaluateTransaction(transactionData.name,transactionData.params)
      }

  }

  private async submitTransaction(func: string, args: string[]): Promise<void> {

      const opts: ProposalOptions = {
          arguments: args,
      };
      const proposal = this.contract.newProposal(func, opts)
      const txnID = proposal.getTransactionId();
      this.unfinishedTransactions++;


      const logger = new Logger(txnID,config.logLevel)

      try{

          logger.logPoint('Endorsing', `${func}(${JSON.stringify(opts)})`);
          const txn = await proposal.endorse();
          logger.logPoint('Submitting')
          const subtx = await txn.submit();
          logger.logPoint('Submitted');
          const status = await Promise.race([subtx.getStatus(),timeout(config.timeout)]) as Status
          if (status.code !== 11 && status.code !== 12 && status.code !== 0) {
              //       // 0 = OK
              //       // 10 = endorsement_policy_failure
              //       // 11 = mvcc_read_conflict
              //       // 12 = phantom read error
              //       //
              //       // 0,11,12 are ok. 10 would indicate a possible gateway problem
              //       // all the others shouldn't happen but we will want to know if they do
              throw new Error(`unexpected validation code ${status.code}`);
          }

          logger.logPoint('Committed', `status code: ${status.code}`);
          await sleep(config.maxLimit,config.minLimit);

          const index = this.events.findIndex((e:EventData)=> e.txnID === txnID);

          if(index === -1){
              throw new Error('No Event Received');
          }
          logger.logPoint('EventReceived',`EventName:${this.events[index].eventName},Payload:${this.events[index].payload}`);

          this.events.splice(index);

      }catch(e){
          logger.logPoint('Failed',(e as Error).message)

      }finally{
          this.unfinishedTransactions--
      }

  }

  private async evaluateTransaction(func: string, args: string[]): Promise<void> {

      const opts: ProposalOptions = {
          arguments: args
      };
      const proposal = this.contract.newProposal(func, opts);
      const txnId = proposal.getTransactionId();
      const logger = new Logger(txnId,config.logLevel);
      logger.logPoint('Evaluating', `${func}(${JSON.stringify(opts)})`);
      try {
          this.unfinishedTransactions++;
          await proposal.evaluate();
          logger.logPoint('Evaluated');
      } catch(error) {
          logger.logPoint('Failed',(error as Error).message)
      } finally {
          this.unfinishedTransactions--;
      }
  }

  async getChaincodeEvents():Promise<void>{
      const events =  await this.network.getChaincodeEvents(this.chaincode);
      let eventData: EventData;

      try {
          for  await (const event of  events) {
              eventData = {payload:Buffer.from(event.payload).toString(),eventName:event.eventName,txnID:event.transactionId}
              this.events.push(eventData);
          }

      } finally {
          events.close();
      }
  }

}
