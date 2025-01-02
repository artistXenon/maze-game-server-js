import { Client } from "./client";

export class Room {
    private static readonly map: Map<string, Room> = new Map();

    private static randomId(): string {
        const TABLE = `0123456789`;//`abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789`;
        let result = ``;
        for (let i = 0; i < 6; i++) {
            result += TABLE[Math.floor(TABLE.length * Math.random())];
        }
        if (Room.map.has(result)) return Room.randomId();
        return result;
    }

    public static create(client: Client): Room {
        const room = new Room(client);
        Room.map.set(room.id, room);
        return room;
    }

    public static get(id: string) {
        return Room.map.get(id);
    }

    private id: string;

    private mom: Client;
    
    private dad?: Client;

    public bufferEvents: any[] = []; // TODO: create a class for this

    private constructor(mom: Client) {
        this.id = Room.randomId();
        this.mom = mom;
    }

    public get Id() {
        return this.id;
    }

    public get Mom() {
        return this.mom;
    }

    public get Dad() {
        return this.dad;
    }

    public isMom(client: Client) {
        return this.mom === client;
    }

    public isDad(client: Client) {
        return this.dad === client;
    }

    public join(client: Client) {
        if (client === this.mom) return true;
        if (this.dad === undefined) {
            this.dad = client;
            return true;
        }
        return false;
        
    }

    public leave(client: Client) {
        // TODO: later - should not destroy if member left.
        this.destroy();
    }

    public destroy() {
        this.mom.leaveRoom();
        const dad = this.dad;
        this.dad = undefined; 
        dad?.leaveRoom();
        Room.map.delete(this.id);
    }

    public getOpponentOf(client: Client) {
        if (this.mom === client) return this.dad;
        else if (this.dad === client) return this.mom;
        throw new Error(`Room#getOpponentOf: client not member of room`);
    }
}
