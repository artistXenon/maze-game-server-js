import { WebSocketServer } from 'ws';
import { Connection } from './db/connection';
import { Client } from './db/client';


function startWS() {
    const wss = new WebSocketServer({ port: 3001 });

    wss.on('connection', (ws, req) => {
        Client.attachWebSocket(ws, req);
    });
}

export { 
    startWS
};

