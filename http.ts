import express from "express";
import cors from "cors";
import { createRoom, registerClient, joinRoom, renewClient, unregisterClient } from "./states/db";

function startHTTP() {
    const app = express();
    app.use(cors());
    
    app.set("port", 3000);
    
    app.get("/", (req, res) => {
        res.status(400).send();
    });
    
    app.get("/hi", (req, res) => {
        const client = req.ip ? registerClient(req.ip) : undefined;
        res.json(client ? { q: true, id: client.id, s: client.secret } : { q: false });
    });

    app.get("/bye", (req, res) => {
        const { id, s, r } = req.query;
        const q = unregisterClient(req.ip ?? "", String(id), String(s), String(`:unregister_client:` + r));
        res.json({ q });
    });

    app.get("/plz", (req, res) => {
        const { id, s, r } = req.query;
        const q = renewClient(req.ip ?? "", String(id), String(s), String(`:renew_client:` + r));
        res.json({ q });
    });

    app.get("/room", (req, res) => {
        const { id, s, r } = req.query;
        const result = createRoom(req.ip ?? "", String(id), String(s), String(`:create_room:` + r));
        res.json(result ? { q: true, id: result } : { q: false });
    });

    app.get("/room/:roomid", (req, res) => {
        const { roomid } = req.params;
        const { id, s, r } = req.query;
        const result = joinRoom(req.ip ?? "", String(id), String(s), String(`:join_room:` + r), roomid);
        res.json(result ? { q: true, id: result } : { q: false });
    });

    app.listen(app.get("port"));
}

export { startHTTP };
