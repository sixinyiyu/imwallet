import { decryptPassword } from "./rsaService";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import prisma from "../config/prisma";
import { config } from "../config";
import { createError } from "../middleware/errorHandler";
import { logger } from "../utils/logger";
import type { AuthPayload } from "../middleware/auth";

// 内置默认用户，不可删除/停用
const BUILT_IN_USERS = ["admin", "damotou"];

export interface RegisterInput {
  username: string;
  password: string;
  deviceInfo?: string;
}

export interface LoginInput {
  username: string;
  password: string;
}

export interface AuthResult {
  token: string;
  user: {
    id: string;
    username: string;
    role: string;
  };
}

export interface RegisterResult {
  message: string;
  user: {
    id: string;
    username: string;
    status: string;
  };
}

export async function register(input: RegisterInput): Promise<RegisterResult> {
  logger.info("AUTH", `用户注册请求: username=${input.username}`);

  const existing = await prisma.user.findUnique({
    where: { username: input.username },
  });

  if (existing) {
    logger.warn("AUTH", `用户注册失败: 用户名已存在 - username=${input.username}`);
    throw createError(409, "Username already exists", "USERNAME_EXISTS");
  }

  // Decrypt RSA-encrypted password from client
  const plainPassword = decryptPassword(input.password);

  const passwordHash = await bcrypt.hash(plainPassword, config.bcrypt.saltRounds);

  const user = await prisma.user.create({
    data: {
      username: input.username,
      passwordHash,
      deviceInfo: input.deviceInfo || "",
      status: "PENDING", // 新注册用户默认待审核
      role: "NORMAL",
    },
  });

  logger.info("AUTH", `用户注册成功: username=${user.username}, id=${user.id}, status=PENDING`);

  return {
    message: "Registration successful, pending admin approval",
    user: { id: user.id, username: user.username, status: user.status },
  };
}

export async function login(input: LoginInput): Promise<AuthResult> {
  logger.info("AUTH", `用户登录请求: username=${input.username}`);

  const user = await prisma.user.findUnique({
    where: { username: input.username },
  });

  if (!user) {
    logger.warn("AUTH", `用户登录失败: 用户名不存在或密码错误 - username=${input.username}`);
    throw createError(401, "用户名或密码错误", "AUTH_FAILED");
  }

  // 检查软删除
  if (user.deletedAt) {
    logger.warn("AUTH", `用户登录失败: 账号已删除 - username=${input.username}`);
    throw createError(401, "用户名或密码错误", "AUTH_FAILED");
  }

  // 检查账号状态
  if (user.status === "PENDING") {
    logger.warn("AUTH", `用户登录失败: 账号待审核 - username=${input.username}`);
    throw createError(403, "账号待审核，请等待管理员激活", "ACCOUNT_PENDING");
  }

  if (user.status === "REJECTED") {
    logger.warn("AUTH", `用户登录失败: 账号已被拒绝 - username=${input.username}`);
    throw createError(403, "账号已被拒绝，请联系管理员", "ACCOUNT_REJECTED");
  }

  // Decrypt RSA-encrypted password from client
  const plainPassword = decryptPassword(input.password);

  const valid = await bcrypt.compare(plainPassword, user.passwordHash);

  if (!valid) {
    logger.warn("AUTH", `用户登录失败: 密码错误 - username=${input.username}`);
    throw createError(401, "用户名或密码错误", "AUTH_FAILED");
  }

  const token = generateToken(user.id, user.username, user.role);

  logger.info("AUTH", `用户登录成功: username=${user.username}, id=${user.id}, role=${user.role}`);

  return {
    token,
    user: { id: user.id, username: user.username, role: user.role },
  };
}

function generateToken(userId: string, username: string, role: string): string {
  const payload: AuthPayload = { userId, username, role };
  const expiresIn = (config.jwt.expiresIn || "7d") as jwt.SignOptions["expiresIn"];
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn,
  });
}

/** 管理员：获取待审核用户列表 */
export async function getPendingUsers() {
  return prisma.user.findMany({
    where: { status: "PENDING", deletedAt: null },
    select: {
      id: true,
      username: true,
      status: true,
      role: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });
}

/** 管理员：获取所有用户列表（排除软删除，含钱包余额） */
export async function getAllUsers() {
  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      username: true,
      status: true,
      role: true,
      createdAt: true,
      updatedAt: true,
      wallets: {
        select: {
          walletId: true,
          isActive: true,
          wallet: {
            select: {
              id: true,
              alias: true,
              address: true,
              tokenBalances: {
                select: {
                  id: true,
                  balance: true,
                  token: {
                    select: {
                      symbol: true,
                      name: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Flatten wallet info
  return users.map((u: any) => ({
    ...u,
    wallets: u.wallets.map((uw: any) => ({
      id: uw.wallet.id,
      alias: uw.wallet.alias,
      address: uw.wallet.address,
      tokenBalances: uw.wallet.tokenBalances.map((tb: any) => ({
        id: tb.id,
        symbol: tb.token.symbol,
        name: tb.token.name,
        balance: tb.balance.toString(),
      })),
      isActive: uw.isActive,
    })),
  }));
}

/** 管理员：激活用户 */
export async function activateUser(userId: string, operatorId?: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw createError(404, "User not found", "USER_NOT_FOUND");
  }
  if (user.deletedAt) {
    throw createError(400, "该用户已被删除", "ACCOUNT_DELETED");
  }
  if (user.status === "ACTIVE") {
    throw createError(400, "User is already active", "ALREADY_ACTIVE");
  }
  const result = await prisma.user.update({
    where: { id: userId },
    data: { status: "ACTIVE" },
    select: { id: true, username: true, status: true, role: true },
  });

  logger.info("ADMIN", `用户审核-激活: username=${user.username}, id=${userId}, operator=${operatorId || "unknown"}`);

  // 发送通知
  await prisma.notification.create({
    data: {
      userId,
      title: "账号已激活",
      content: "您的账号已通过管理员审核并激活，现在可以正常使用。",
      type: "ACCOUNT_ACTIVATED",
    },
  });

  return result;
}

/** 管理员：拒绝用户 */
export async function rejectUser(userId: string, operatorId?: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw createError(404, "User not found", "USER_NOT_FOUND");
  }
  if (user.deletedAt) {
    throw createError(400, "该用户已被删除", "ACCOUNT_DELETED");
  }
  if (user.status === "REJECTED") {
    throw createError(400, "User is already rejected", "ALREADY_REJECTED");
  }
  const result = await prisma.user.update({
    where: { id: userId },
    data: { status: "REJECTED" },
    select: { id: true, username: true, status: true, role: true },
  });

  logger.info("ADMIN", `用户审核-拒绝: username=${user.username}, id=${userId}, operator=${operatorId || "unknown"}`);

  // 发送通知
  await prisma.notification.create({
    data: {
      userId,
      title: "账号审核未通过",
      content: "您的账号审核未通过，请联系管理员了解详情。",
      type: "ACCOUNT_REJECTED",
    },
  });

  return result;
}

/** 管理员：停用用户（将ACTIVE改为PENDING） */
export async function deactivateUser(userId: string, operatorId?: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw createError(404, "User not found", "USER_NOT_FOUND");
  }
  if (BUILT_IN_USERS.includes(user.username)) {
    throw createError(400, "内置用户不可停用", "BUILT_IN_USER");
  }
  if (user.deletedAt) {
    throw createError(400, "该用户已被删除", "ACCOUNT_DELETED");
  }
  if (user.status !== "ACTIVE") {
    throw createError(400, "Only active users can be deactivated", "INVALID_STATUS");
  }

  logger.info("ADMIN", `用户审核-停用: username=${user.username}, id=${userId}, operator=${operatorId || "unknown"}`);

  return prisma.user.update({
    where: { id: userId },
    data: { status: "PENDING" },
    select: { id: true, username: true, status: true, role: true },
  });
}

/** 管理员：软删除用户 */
export async function softDeleteUser(userId: string, operatorId?: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw createError(404, "User not found", "USER_NOT_FOUND");
  }
  if (BUILT_IN_USERS.includes(user.username)) {
    throw createError(400, "内置用户不可删除", "BUILT_IN_USER");
  }
  if (user.deletedAt) {
    throw createError(400, "该用户已被删除", "ALREADY_DELETED");
  }

  logger.info("ADMIN", `用户审核-删除: username=${user.username}, id=${userId}, operator=${operatorId || "unknown"}`);

  return prisma.user.update({
    where: { id: userId },
    data: { deletedAt: new Date() },
    select: { id: true, username: true, status: true, role: true, deletedAt: true },
  });
}