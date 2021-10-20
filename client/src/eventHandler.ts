import { Network } from 'fabric-gateway';

export class EventHandler {

    private txnMap = new Map<string, (value: unknown) => void>();

    constructor(private readonly network: Network, private readonly chaincodeName: string) {

    }

    async startListening(): Promise<void> {
        const events =  await this.network.getChaincodeEvents(this.chaincodeName);
        try {
            for await (const event of events) {
                const listener = this.txnMap.get(event.transactionId);
                if (!listener) {
                    console.log(`Received Unexpected Event for txnID: ${event.transactionId}`)
                } else {
                    listener(event);
                    this.txnMap.delete(event.transactionId);
                }
            }

        } finally {
            events.close();
        }
    }

    registerForEvent(txnId: string): Promise<unknown> {

        const eventPromise = new Promise((resolve) => {
            this.txnMap.set(txnId, resolve);
        });

        return eventPromise;
    }

    unregisterEvent(txnId: string): void {
        this.txnMap.delete(txnId);
    }
}