import { Router } from "express";
import { pgPool } from "../db/index.js";

const router = Router();

router.get( "/api/users/db", async (req, res) => {
    const result = await pgPool.query('SELECT 1');
    res.send({ db: 'ok', result: result.rows });
} );

export { router as dbRouter };