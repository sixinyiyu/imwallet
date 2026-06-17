import { Router, Request, Response, NextFunction } from "express";
import { deviceAuthMiddleware } from "../middleware/deviceAuth";
import { validate } from "../middleware/validate";
import { contactSchema } from "../validators/contact";
import * as contactService from "../services/contactService";

const router = Router();

const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res, next).catch(next);

router.use(deviceAuthMiddleware);

// 获取当前设备的联系人列表
router.get("/", asyncHandler(async (req: Request, res: Response) => {
  const contacts = await contactService.getDeviceContacts(req.device!.dbId);
  res.json({ contacts });
}));

// 创建联系人
router.post(
  "/",
  validate(contactSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const contact = await contactService.createContact(req.device!.dbId, req.body);
    res.status(201).json(contact);
  })
);

// 更新联系人
router.put("/:id", asyncHandler(async (req: Request, res: Response) => {
  const contact = await contactService.updateContact(req.params.id as string, req.device!.dbId, req.body);
  res.json(contact);
}));

// 删除联系人
router.delete("/:id", asyncHandler(async (req: Request, res: Response) => {
  await contactService.deleteContact(req.params.id as string, req.device!.dbId);
  res.status(204).send();
}));

export default router;
