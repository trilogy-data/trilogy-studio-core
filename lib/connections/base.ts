// BaseConnection.ts

import { Results } from '../editors/results'
export default abstract class BaseConnection {
    name: string;
    type: string;
    storage: string;
    model: string| null =  null;
    connected: boolean;
    error: string | null = null;
    query_type: string = "abstract";

    constructor(name: string, type: string,  autoConnect: boolean = true, model?: string) {
        this.name = name;
        this.type = type;
        this.model = model || null;
        // hardcoded for dev
        this.storage = 'local';
        this.query_type = 'abstract';
        this.connected = false; // Default to disconnected
        if (autoConnect) {
            this.connect().then(() => {
                this.connected = true;
            }).catch((error) => {
                if (error instanceof Error) {
                    this.error = error.message;
                }
                this.connected = false;
            });
        }
    }

    abstract query(sql: string): Promise<Results>;

    abstract connect(): Promise<void>;

    setModel(model: string) {
        this.model = model;
    }

    async reset() {
        try {
            this.connected = false;
            this.error = null;
            await this.connect()
            this.connected = true;
        } catch (error) {
            if (error instanceof Error) {
                this.error = error.message;
            }
        }

    }

    abstract toJSON(): object;

    // @ts-ignore
    static fromJSON(fields:object) {
        throw new Error("Method not implemented.");
    }
}
