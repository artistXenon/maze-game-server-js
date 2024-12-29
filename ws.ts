import { WebSocketServer } from 'ws';
import { addConnection, AuthSocketClient, Client } from './states/db';


function startWS() {
    const wss = new WebSocketServer({ port: 3001 });

    wss.on('connection', function(ws, req) {
        const client: AuthSocketClient = <AuthSocketClient>ws;
        client.gameExpire = Date.now() + 1000 * 5;
        client.gameReady = 0;
        addConnection(client, req);
    });
}

function gameHandler(ws: AuthSocketClient, opponentClient: Client, json: any) {
    switch (json.t) {
        case `move`:
            // TODO: maybe check valid
            const { from, to, since, t, gt } = json;
            opponentClient.connection?.send(JSON.stringify({ from, to, since, t, gt }));
            break;
    
        // TODO: etc
    }
}

export { 
    startWS,
    gameHandler
};

