import { WebSocket } from "ws";
import { Client } from "./client";
import { Room } from "./room";

const TIME_COUNT = 20;

export interface ConnectionListener {
    onClose(): void;
    onGameMessage(room: Room, opponentClient: Client, msg: any): void;
}

export class Connection {
    private state: number;

    private expire: number;

    private lastSync: number;

    private offset: number;

    private offsets: number[];

    private ping: number;

    private websocket: WebSocket;

    private client: Client;

    constructor(websocket: WebSocket, client: Client) {
        this.state = 0;
        this.expire = Date.now() + 1000 * 3;
        this.lastSync = 0;
        this.offset = 0;
        this.offsets = [];
        this.ping = 0;
        this.websocket = websocket;
        this.client = client;

        websocket.on(`error`, console.error);
        websocket.on(`close`, () => {
            this.destroy(`Connection#constructor$close`); // maybe unnecessary?
        });
        websocket.on(`message`, (data) => {
            const now = Date.now();
            if (this.expire < now) return this.destroy(`Connection#constructor$message: connection expire`);
            try {
                const json = JSON.parse(data.toString());
                if (json.t === `bye`) return this.destroy(`Connection#constructor$message: bye`);
                const room = this.client.Room;
                if (room === undefined) return this.destroy(`Connection#constructor$message: undefined room`);
                
                if (this.state === 0) {
                    return this.initialStateHandler(room, json);
                }
                const opponentClient = room.isMom(this.client) ? room.Dad : room.Mom;
                if ((this.state & 0b101) === 0b001) {
                    return this.readyStateHandler(room, opponentClient, json);
                }
                if (this.state === 0b111) {
                    if (opponentClient === undefined) {
                        return this.destroy(`Connection#constructor$message: gaming w/o opponent`);
                    }
                    return this.client.onGameMessage(room, opponentClient, json);
                }
            } catch (e) {
                console.error(e);
                this.destroy(`Connection#constructor$message: \n` + e);
            }
        });
    }

    private initialStateHandler(room: Room, json: any) {
        switch (json.t) {
            case `hi`:
                // rice, secret
                const { r, s } = json;
                if (!this.client.hashMatches(s, `:socket_join:` + r)) return this.destroy(`Connection#initialStateHandler$hi: hash mismatch`);
                this.expire = Date.now() + 1000 * TIME_COUNT;
                this.lastSync = performance.now();
                this.send({
                    t: `time`,
                    l: this.lastSync,
                    c: 0
                });
                break;
            case `time`: 
                // localtime, diff, count
                const { l, d, c } = json; 
                const perfNow = performance.now();
                const ping = perfNow - this.lastSync;
                const offset = (d + l - perfNow) / 2;
                this.ping = (this.ping * 9 + ping) / 10;
                if (c === 0) {
                    this.offsets = [];
                }
                this.offsets.push(offset);
                if (c + 1 < TIME_COUNT) {
                    setTimeout(() => {
                        this.lastSync = performance.now();
                        this.send({
                            t: `time`,
                            l: this.lastSync,
                            c: c + 1
                        });
                    }, 100);
                    return;
                }
                this.offset = this.offsets.reduce((a, b) => a + b) / TIME_COUNT;
                this.expire = Date.now() + 1000 * 60 * 10;
                this.state = 0b001;
                const isMom = room.isMom(this.client);
                const opponent = isMom ? room.Dad : room.Mom;
                const opponentReady = opponent?.Connection !== undefined && (opponent.Connection.state & 0b001) !== 0;
                this.send({
                    t: `ready`,
                    s: true, // state
                    o: opponentReady, // opponent state
                    m: isMom
                    // TODO: remove or organize
                    , offset: this.offset
                    , ping: this.ping
                });
                break;
            default: 
                return this.destroy(`Connection#initialStateHandler$default`);
        }
    }

    private readyStateHandler(room: Room, opponentClient: Client | undefined, json: any) {
        const isMom = room.isMom(this.client);
        switch (json.t) {
            case `knock`:
                const { n } = json;
                this.state = 0b011;
                const oppConnection = opponentClient?.Connection;
                const r = Math.random();
                if (oppConnection === undefined) return;
                oppConnection.send({
                    t: `knock`,
                    id: this.client.Id, n,
                    o: oppConnection.offset - this.offset
                });
                return;
            case `balls`:
                const { p, c, pi } = json;
                if (!isMom) return this.destroy(`Connection#readyStateHandler$balls: not from mom`);
                const dadConnection = room.Dad?.Connection;
                if (dadConnection === undefined || dadConnection.state !== 0b011) return this.destroy(`Connection#readyStateHandler$balls: dad is not ready`);
                dadConnection.send({
                    t: `balls`,
                    p, c, pi
                });
                this.state = 0b111;
                dadConnection.state = 0b111;
                return;
            default:
                return this.destroy(`Connection#readyStateHandler$default`);
        }

    }

    public send(args: any) {
        this.websocket.send(JSON.stringify(args));
    }

    public destroy(reason: any) {
        // TODO: implement
        // console.error(reason);
        if (this.websocket.readyState <= 1) this.websocket.close();
        this.client.onClose();
    }
}
