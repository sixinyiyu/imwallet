import { Router, Request, Response } from "express";
import * as fiatService from "../services/fiatService";

const router = Router();

router.get("/rates", async (_req: Request, res: Response) => {
  const rates = await fiatService.getFiatRates();
  res.json({ rates });
});

export default router;
