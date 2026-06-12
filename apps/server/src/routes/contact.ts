import { Router, Request, Response } from "express";
import { authMiddleware } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { createContactSchema, updateContactSchema } from "../validators/contact";
import * as contactService from "../services/contactService";

const router = Router();

router.use(authMiddleware);

router.get("/", async (req: Request, res: Response) => {
  const contacts = await contactService.getContacts(req.user!.userId);
  res.json({ contacts });
});

router.post(
  "/",
  validate(createContactSchema),
  async (req: Request, res: Response) => {
    const contact = await contactService.createContact(
      req.user!.userId,
      req.body
    );
    res.status(201).json(contact);
  }
);

router.put(
  "/:id",
  validate(updateContactSchema),
  async (req: Request, res: Response) => {
    const contact = await contactService.updateContact(
      req.params.id as string,
      req.user!.userId,
      req.body
    );
    res.json(contact);
  }
);

router.delete("/:id", async (req: Request, res: Response) => {
  await contactService.deleteContact(req.params.id as string, req.user!.userId);
  res.status(204).send();
});

export default router;
