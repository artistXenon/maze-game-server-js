import { v4 } from 'uuid';
import { generateRoomNumber } from '../helper';
import { sha1 } from 'js-sha1';
import { WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { gameHandler } from '../ws';

const TIME_COUNT = 20;

export type AuthSocketClient = WebSocket & { 
    gameExpire: number; 
    gameReady: number; 
    gameClient: Client; 
    gameRoom: Room;
    lastGameSync: number;
    gameTimeOffsets: number[];
    gameTimeOffset: number;
    gamePing: number;
};
/**
 * gameReady: binary 0b00000
 * 0b00001 : auth 
 * 0b00010 : oppponent join
 * 0b00100 : ready
 * 0b01000 : opponent ready
 * 0b11111 : playing game
 */

export type Client = {
    ip: string;
    id: string;
    secret: string;
    expire: number;
    room?: Room;
    connection?: AuthSocketClient;
};

type Room = {
    id: string;
    mom: Client;
    dad?: Client;
};

const ip_clients = new Map<string, (Client | Set<Client>)>();
const clients = new Map<string, Client>();
const rooms = new Map<string, Room>();

// ip - client - exp - room

function registerClient(ip: string): Client | void {
    // INFO: get clients from ip.
    const existingClients = ip_clients.get(ip);
    let set: Set<Client> | undefined = undefined;
    
    if (existingClients instanceof Set) {
        // INFO: if a set exists and is full - we cant make more clients
        if (existingClients.size > 50) {
            const now = Date.now();
            for (const client of existingClients) {
                if (
                    client.expire < now && 
                    client.room === undefined && 
                    (client.connection === undefined || client.connection.gameExpire < now)) {
                        existingClients.delete(client);
                }
            }
        }
        if (existingClients.size > 50) return;
        set = existingClients;
    }

    // INFO: create a client that is not duplicate.
    let newId;
    do { newId = v4(); } 
    while(clients.has(newId));
    const newClient = {
        ip,
        id: newId,
        secret: v4().replace(/[-]/g, ''),
        expire: Date.now() + 1000 * 60 * 10 // 10 minutes
    };
    clients.set(newClient.id, newClient);

    // INFO: case - no prev client in ip
    if (existingClients === undefined) {
        ip_clients.set(ip, newClient);
        return newClient;
    }

    // INFO: case - prev clients in ip
    if (set === undefined) {
        // INFO: case - one prev client in ip
        set = new Set<Client>();
        set.add(<Client>existingClients);
        ip_clients.set(ip, set);
    }
    set.add(newClient);
    return newClient;
}

function unregisterClient(ip_ignore: string, id: string, secret: string, rice:string) {
    const client = clients.get(id);
    // INFO: no such client - fail
    if (client === undefined) return true;
    const now = Date.now();
    if (client.expire < now) {
        // TODO: clean client
        let set = ip_clients.get(client.ip);
        if (set instanceof Set) {
            set.delete(client);
        } else if (set === client) {
            ip_clients.delete(client.ip);
        }
        if (client.room !== undefined) {
            client.room.mom.connection?.close();
            client.room.dad?.connection?.close();
            rooms.delete(client.room.id);
        }
        clients.delete(client.id);
        return true;
    }
    if (secret !== sha1(client.secret + rice)) return false;
    
    
    return true;
}

function renewClient(ip_ignore: string, id: string, secret: string, rice:string) {
    const client = clients.get(id);
    // INFO: no such client - fail
    if (client === undefined) return false;
    const now = Date.now();
    if (client.expire < now) {
        // TODO: clean client
        unregisterClient(``, id, ``, ``);
        return false;
    }
    if (secret !== sha1(client.secret + rice)) return false;
    client.expire = now + 1000 * 60 * 10;
    // TODO: update ip
    return true;
}

function destroyRoom(room: Room) {
    room.mom.connection?.close();
    room.mom.connection = undefined
    room.mom.room = undefined;
    if (room.dad !== undefined) {
        room.dad.connection?.close();
        room.dad.connection = undefined;
        room.dad.room = undefined;
    }
    room.dad = undefined; 
    rooms.delete(room.id);
}

function createRoom(ip_ignore: string, id: string, secret: string, rice: string): string | void {
    const client = clients.get(id);
    // INFO: no such client - fail
    if (client === undefined) return;
    if (secret !== sha1(client.secret + rice)) return;

    let { room } = client;
    if (room !== undefined) {
        destroyRoom(room);
    }
    let roomId;
    do { roomId = generateRoomNumber(); } 
    while(rooms.has(roomId));

    room = {
        id: roomId,
        mom: client
    };
    client.room = room;
    rooms.set(room.id, room);
    return room.id;
}

function joinRoom(ip_ignore: string, id: string, secret: string, rice:string, room_id: string): string | void {
    const client = clients.get(id);
    // INFO: no such client - fail
    if (client === undefined) return;
    if (secret !== sha1(client.secret + rice)) return;

    const room = rooms.get(room_id);
    // INFO: no such room - fail
    if (room === undefined) return;

    // client already in other/this room?
    const clientsPrevRoom = client.room;
    if (clientsPrevRoom !== undefined) {
        if (clientsPrevRoom === room) {
            return room_id;
        }
        destroyRoom(clientsPrevRoom);
    }

    // room already full?, im in?
    if (room.dad !== undefined) {
        if (room.dad === client) {
            return room_id;
        }
        return;
    }

    room.dad = client;
    client.room = room;

    return room_id;
}

function addConnection(connection: AuthSocketClient, req: IncomingMessage) {
    const path = req.url?.split('/');
    const ip = req.socket.remoteAddress;
    // INFO: incorrect path, no ip - close
    if (path == null || path.length < 3 || ip == null) {
        connection.close();
        return;
    }

    const [_, roomId, id] = path;
    const room = rooms.get(roomId);
    const client = clients.get(id);
    // INFO: no such room, client - close
    if (room === undefined || client === undefined) {
        connection.close();
        return;
    }

    // INFO: room and client exist but client not member of room - close
    if (room.mom.id !== id && room.dad?.id !== id) {        
        connection.close();
        return;        
    } 

    // TODO: hey you are welcome in this room!
    client.connection = connection;
    connection.gameClient = client;
    connection.gameRoom = room;
    connection.gamePing = 0;
    const opnt = room.mom === client ? room.dad : room.mom;
    if (opnt !== undefined && opnt.connection !== undefined) {
        connection.gameReady |= ((opnt.connection.gameReady & 0b00101) << 1);
    }

    connection.on('error', console.error);
    connection.on('close', function(e, r) {
        // INFO: usually blank
        // console.log(`closed bcuz`, r.toString());
        const conn = <AuthSocketClient>this;
        conn.gameClient.connection = undefined;
        destroyRoom(conn.gameRoom);        
    });
    connection.on('message', function message(data) {
        const conn = <AuthSocketClient>this;
        if (conn.gameExpire < Date.now()) conn.close();
        try {
            const json = JSON.parse(data.toString());
            // INFO: closing
            if (json.t === `bye`) {
                conn.close();
                return;
            }
            const opponentClient = conn.gameRoom.mom === client ? conn.gameRoom.dad : conn.gameRoom.mom;
            // INFO: block - if not ready
            if ((conn.gameReady & 0b00001) === 0) {
                // INFO: only takes hi(hash check) and time
                switch (json.t) {
                    case 'hi':
                        const { r, s } = json;
                        if (s !== sha1(conn.gameClient.secret + ":socket_join:" + r)) {
                            return conn.close();
                        }
                        conn.gameExpire = Date.now() + 1000 * TIME_COUNT;

                        // INFO: reponse to hi
                        conn.lastGameSync = performance.now();
                        conn.send(JSON.stringify({
                            t: `time`,
                            l: conn.lastGameSync,
                            c: 0
                        }));
                        break;
                    case 'time':
                        const { l, d, c } = json; // localtime, diff, count
                        const perfNow = performance.now();
                        const ping = perfNow - conn.lastGameSync;
                        const offset = (d + l - perfNow) / 2;
                        conn.gamePing = (conn.gamePing * 9 + ping) / 10;
                        if (c === 0) {
                            conn.gameTimeOffsets = [];
                        }
                        conn.gameTimeOffsets.push(offset);
                        // INFO: ping pong for TIME_COUNT times w/ interval 100ms
                        if (c + 1 < TIME_COUNT) {
                            setTimeout(() => {
                                conn.lastGameSync = performance.now();
                                conn.send(JSON.stringify({
                                    t: `time`,
                                    l: conn.lastGameSync,
                                    c: c + 1
                                }));
                            }, 100);
                            return;
                        }
                        // TODO: offset variance too big?
                        conn.gameTimeOffset = conn.gameTimeOffsets.reduce((a,b)=>a+b) / TIME_COUNT;
                        // const variance = conn.gameTimeOffsets.map(a=>Math.pow(a-conn.gameTimeOffset, 2)).reduce((a,b)=>a+b) / (TIME_COUNT - 1);

                        // INFO: update opponent this client is ready
                        const opponentReady = opponentClient?.connection !== undefined;
                        if (opponentReady) {
                            opponentClient.connection!.gameReady |= 0b00010;
                        }
                        conn.gameExpire = Date.now() + 1000 * 60 * 10;
                        conn.gameReady |= 0b00001;
                        conn.send(JSON.stringify({
                            t: `ready`,
                            s: true, 
                            o: opponentReady,
                            m: room.mom === conn.gameClient
                            // TODO: remove or organize
                            , offset: conn.gameTimeOffset
                            , ping: conn.gamePing
                        }));
                        return;
                    default: 
                        return conn.close();
                }
            }

            if (json.t === `knock`) {
                const { n } = json;
                if ((conn.gameReady & 0b00011) !== 0b00011) return;
                conn.gameReady |= 0b00100;
                if (opponentClient?.connection === undefined) return;
                opponentClient.connection.gameReady |= 0b01000;
                opponentClient.connection.send(JSON.stringify({ 
                    t: `knock`,
                    id: conn.gameClient.id, n,
                    o: opponentClient.connection.gameTimeOffset - conn.gameTimeOffset
                }));
                return;
            }
            
            if (json.t === `balls`) {
                const { p, c, pi } = json;
                if (conn.gameReady !== 0b01111) return;
                if (conn.gameRoom.mom !== conn.gameClient) return;
                conn.gameRoom.dad?.connection?.send(JSON.stringify({
                    t: `balls`,
                    p, c, pi
                }));
                // INFO: set game state playing
                conn.gameReady = 0b11111;

                if (opponentClient?.connection === undefined) return;
                opponentClient.connection.gameReady = 0b11111;
            }
            

            // TODO: game 
            if (conn.gameReady !== 0b11111) return;
            if (opponentClient === undefined) return;
            gameHandler(conn, opponentClient, json);

        } catch(e) {
            console.error(e);
            // if (e instanceof SyntaxError) {
            //     // INFO: JSON parse error
            //     conn.close();
            //     return;
            // }
            conn.close();
        }
    });

}

export {
    registerClient,
    unregisterClient,
    renewClient,
    createRoom,
    joinRoom,
    addConnection
};