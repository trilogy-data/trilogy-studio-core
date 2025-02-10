// BaseConnection.ts

import { Results } from '../editors/results'
export default abstract class BaseConnection {
    name: string;
    type: string;
    storage: String;
    connected: boolean;
    error: string | null = null;

    constructor(name: string, type: string,  autoConnect: boolean = true) {
        this.name = name;
        this.type = type;
        // hardcoded for dev
        this.storage = 'local';
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

    static fromJSON(fields:object) {
        throw new Error("Method not implemented.");
    }
}
