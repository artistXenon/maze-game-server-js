import { Request, Response, Router } from "express";

const router = Router();

router.post(`/`, (req: Request, res: Response) => {
    // if signin
});

router.use((req: Request, res: Response) => {
    res.status(400).send();
});

export {
    router
};
