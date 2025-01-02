import express from "express";
import cors from "cors";
import { Client } from "../db/client";
import { Room } from "../db/room";
import { router } from "./v2";

function startHTTP() {
    const app = express();
    app.use(cors());
    
    app.set("port", 3000);

    app.use("/v2", router);
    
    app.get("/", (req, res) => {
        res.status(400).send();
    });
    
    app.get("/hi", (req, res) => {
        
        const client = req.ip ? Client.register(req.ip) : undefined;
        res.json(client !== undefined ? { q: true, id: client.Id, s: client.Secret } : { q: false });
    });

    app.get("/bye", (req, res) => {
        const { id, s, r } = req.query;
        const client = Client.get(String(id));
        const q = client !== undefined ? client.unregister(String(s), String(`:unregister_client:` + r)) : true;
        res.json({ q });
    });

    app.get("/plz", (req, res) => {
        const { id, s, r } = req.query;
        const client = Client.get(String(id));
        const q = client !== undefined ? client.renew(req.ip ?? "", String(s), String(`:renew_client:` + r)) : false;
        res.json({ q });
    });

    app.get("/random", (req, res) => {
    // TODO: how :waaaat:
    });

    app.get("/room", (req, res) => {
        const { id, s, r } = req.query;
        const client = Client.get(String(id));
        const room = client?.createRoom(String(s), String(`:create_room:` + r));
        if (room === undefined) {
            res.json({ q: false });
            return;
        }
        res.json({ q: true, id: room.Id });
    });

    app.get("/room/:roomid", (req, res) => {
        const { roomid } = req.params;
        const { id, s, r } = req.query;
        const client = Client.get(String(id));
        const room = Room.get(roomid);
        if (client === undefined || room === undefined) {
            res.json({ q: false });
            return;
        }
        const joinedRoom = client.joinRoom(room, String(s), String(`:join_room:` + r));
        res.json(joinedRoom !== undefined ? { q: true, id: room.Id } : { q: false });
    });

    app.listen(app.get("port"));
}

export { startHTTP };
