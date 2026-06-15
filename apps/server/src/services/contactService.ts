import prisma from "../config/prisma";
import { createError } from "../middleware/errorHandler";

export interface ContactInput {
  name: string;
  address: string;
  memo?: string;
}

export interface ContactResult {
  id: string;
  name: string;
  address: string;
  memo: string | null;
  createdAt: Date;
}

export async function getContacts(userId: string): Promise<ContactResult[]> {
  return prisma.contact.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      address: true,
      memo: true,
      createdAt: true,
    },
  });
}

export async function createContact(
  userId: string,
  input: ContactInput
): Promise<ContactResult> {
  return prisma.contact.create({
    data: {
      userId,
      name: input.name,
      address: input.address,
      memo: input.memo || "",
    },
    select: {
      id: true,
      name: true,
      address: true,
      memo: true,
      createdAt: true,
    },
  });
}

export async function updateContact(
  contactId: string,
  userId: string,
  input: Partial<ContactInput>
): Promise<ContactResult> {
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, userId },
  });

  if (!contact) {
    throw createError(404, "Contact not found");
  }

  return prisma.contact.update({
    where: { id: contactId },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.address !== undefined && { address: input.address }),
      ...(input.memo !== undefined && { memo: input.memo }),
    },
    select: {
      id: true,
      name: true,
      address: true,
      memo: true,
      createdAt: true,
    },
  });
}

export async function deleteContact(
  contactId: string,
  userId: string
): Promise<void> {
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, userId },
  });

  if (!contact) {
    throw createError(404, "Contact not found");
  }

  await prisma.contact.delete({
    where: { id: contactId },
  });
}

/** 根据钱包地址查找对应的用户名信息 */
export async function lookupAddress(address: string): Promise<{ username: string } | null> {
  const wallet = await prisma.wallet.findUnique({
    where: { address },
  });

  if (!wallet) {
    return null;
  }

  const userWallet = await prisma.userWallet.findFirst({
    where: { walletId: wallet.id },
    include: {
      user: {
        select: { username: true },
      },
    },
  });

  if (!userWallet) {
    return null;
  }

  return { username: userWallet.user.username };
}