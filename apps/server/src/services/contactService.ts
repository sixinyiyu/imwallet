import prisma from "../config/prisma";
import { createError } from "../middleware/errorHandler";
import { logger } from "../utils/logger";

export interface ContactInput {
  name: string;
  address: string;
  memo?: string;
}

export interface ContactResult {
  id: string;
  name: string;
  address: string;
  memo: string;
  createdAt: Date;
  updatedAt: Date;
}

/** 获取设备的联系人列表 */
export async function getDeviceContacts(deviceDbId: number): Promise<ContactResult[]> {
  const contacts = await prisma.contact.findMany({
    where: { device_id: deviceDbId },
    orderBy: { createdAt: "desc" },
  });

  return contacts.map((c: any) => ({
    id: c.id,
    name: c.name,
    address: c.address,
    memo: c.memo,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  }));
}

/** 创建联系人 */
export async function createContact(deviceDbId: number, input: ContactInput): Promise<ContactResult> {
  logger.info("CONTACT", `创建联系人: device_id=${deviceDbId}, name=${input.name}`);

  const contact = await prisma.contact.create({
    data: {
      device_id: deviceDbId,
      name: input.name,
      address: input.address,
      memo: input.memo || "",
    },
  });

  return {
    id: contact.id,
    name: contact.name,
    address: contact.address,
    memo: contact.memo,
    createdAt: contact.createdAt,
    updatedAt: contact.updatedAt,
  };
}

/** 更新联系人 */
export async function updateContact(
  contactId: string,
  deviceDbId: number,
  input: Partial<ContactInput>
): Promise<ContactResult> {
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
  });

  if (!contact || contact.device_id !== deviceDbId) {
    throw createError(404, "Contact not found");
  }

  const updated = await prisma.contact.update({
    where: { id: contactId },
    data: {
      name: input.name,
      address: input.address,
      memo: input.memo,
    },
  });

  return {
    id: updated.id,
    name: updated.name,
    address: updated.address,
    memo: updated.memo,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  };
}

/** 删除联系人 */
export async function deleteContact(contactId: string, deviceDbId: number): Promise<void> {
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
  });

  if (!contact || contact.device_id !== deviceDbId) {
    throw createError(404, "Contact not found");
  }

  await prisma.contact.delete({
    where: { id: contactId },
  });
}
