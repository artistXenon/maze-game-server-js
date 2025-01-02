import { IncomingMessage } from "node:http";
import { sha1 } from "js-sha1";
import { v4 } from "uuid";
import { WebSocket } from "ws";
import { Connection, ConnectionListener } from "./connection";
import { Room } from "./room";

export class Client implements ConnectionListener {
    private static readonly map: Map<string, Client> = new Map();

    public static register(ip: string): Client {
        // TODO: check for existing client from this ip.
    
        // INFO: create a client that is not duplicate.
        let newId;
        do { newId = v4(); } 
        while (Client.map.has(newId));
        const newClient = new Client(newId, ip);
        Client.map.set(newClient.id, newClient);
        // TODO: add client bound to the ip.
        return newClient;
    }

    public static attachWebSocket(websocket: WebSocket, req: IncomingMessage): Client | undefined {
        const path = req.url?.split('/');
        const ip = req.socket.remoteAddress;
        // INFO: incorrect path, no ip - close
        if (path == null || path.length < 3 || ip == null) {
            websocket.close();
            return undefined;
        }
        const [_, roomId, id] = path;
        const room = Room.get(roomId);
        const client = Client.get(id);
        // INFO: no such room&client - close
        if (
            room === undefined || client === undefined ||
            (room.Mom !== client && room.Dad !== client)
        ) {
            websocket.close();
            return undefined;
        }
        client.Connection = new Connection(websocket, client);
        return client;
    }

    public static get(id: string) {
        // TODO: invalid client should expire
        const client = Client.map.get(id);
        return client;
    }

    private id: string;

    private secret: string;

    private ip: string;

    private expire: number;

    private room?: Room;

    private connection?: Connection;

    private constructor(id: string, ip: string) {
        this.id = id;
        this.secret = v4().replace(/[-]/g, '');
        this.ip = ip;
        this.expire = Date.now() + 1000 * 60 * 10;
    }

    public get Id() {
        return this.id;
    }

    public get Secret() {
        return this.secret;
    }

    public get Room() {
        return this.room;
    }

    public get Connection() {
        return this.connection;
    }

    private set Connection(connection: Connection | undefined) {
        if (connection === this.connection) return;        
        this.connection?.destroy(`Client#Connection$set: clean pre-existing connection`);
        this.connection = undefined;
        if (connection === undefined) return;
        this.connection = connection;
    }

    public unregister(secret: string, rice: string, force: boolean = false): boolean {
        if (!force && this.validate() && !this.hashMatches(secret, rice)) return false;
        Client.map.delete(this.id);
        // TODO: unbind from ip
        this.leaveRoom();
        return true;
    }

    public renew(ip: string, secret: string, rice: string): boolean {
        if (!this.validate() || !this.hashMatches(secret, rice)) {
            this.leaveRoom();
            return false;
        }
        this.expire = Date.now() + 1000 * 60 * 10;
        // TODO: update ip
        return true;
    }

    public createRoom(secret: string, rice: string): Room | undefined {
        if (!this.validate() || !this.hashMatches(secret, rice)) return undefined;
        const room = Room.create(this);
        this.joinRoom(room, ``, ``, true);
        return room;
    }

    public joinRoom(room: Room, secret: string, rice: string, force: boolean = false): Room | undefined {
        if (!force && (!this.validate() || !this.hashMatches(secret, rice))) return undefined;
        if (!room.join(this)) return undefined;
        this.room?.destroy();
        this.room = room;
        return room;
    }

    public leaveRoom() {
        const connection = this.connection;
        this.connection = undefined;
        connection?.destroy(`Client#leaveRoom`);
        const room = this.room;
        this.room = undefined;
        room?.leave(this);
    }

    public validate(): boolean {
        if (Client.map.has(this.id) && this.expire > Date.now()) return true;
        this.unregister(``, ``, true);
        return false;
    }

    public hashMatches(secret: string, rice: string) {
        return secret === sha1(this.secret + rice);
    }

    onClose(): void {
        this.leaveRoom();
    }

    onGameMessage(room: Room, opponentClient: Client, json: any): void {
        const oppConnection = opponentClient.Connection;
        if (oppConnection === undefined || this.Connection === undefined) {
            return this.Connection?.destroy(`Client#onGameMessage: gaming w/o connection`);
        }
        switch (json.t) {
            case `move`:
                const { from, to, since, t, gt } = json;
                oppConnection.send({
                    from, to, since, t, gt
                });
                return;
            case `end`:
                const { n } = json;
                this.Connection.send({t: `end`, w: true});
                oppConnection.send({t: `end`, w: false});
                this.Connection.gameOver();
                oppConnection.gameOver();
                // TODO: look for end events in bufferEvents
                // TODO: if exists, clear timeout, send result to all.
                // TODO: else save event to room bufferEvents and create timeout
                break;
            // TODO: etc
            default:
                break;
        }
    }
}
