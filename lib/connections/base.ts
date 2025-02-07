// BaseConnection.ts

import {Results} from '../models/results'
export default abstract class BaseConnection {
    name: string;
    type: string;
    connected: boolean;

    constructor(name: string, type:string) {
        this.name = name;
        this.type = type;
        this.connected = false; // Default to disconnected
    }

    abstract query(sql: string): Promise<Results>;
}
