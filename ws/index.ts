import { WebSocketServer } from 'ws';
import { Connection } from '../db/connection';
import { Client } from '../db/client';


function startWS() {
    const wss = new WebSocketServer({ port: 3001 });

    wss.on('connection', (ws, req) => {
        const path = req.url?.split('/');
        const ip = req.socket.remoteAddress;
        // INFO: incorrect path, no ip - close
        if (path == null || path.length < 3 || ip == null) {
            return undefined;
        }
        if (path[1] === `random`) {
            // TODO: create client pool
            // TODO: if match 2 client, mark faster client as creator and send client to create room.
            // TODO: http create will check 
        } else Client.attachWebSocket(ws, req);
    });
}

export { 
    startWS
};

