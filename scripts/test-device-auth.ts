/**
 * Web 端设备签名测试脚本
 * 
 * 使用方法：
 *   npx ts-node scripts/test-device-auth.ts
 * 
 * 或直接运行：
 *   node -e "require('./scripts/test-device-auth.ts')"
 * 
 * 功能：
 *   1. 生成 Ed25519 密钥对
 *   2. 注册设备
 *   3. 签名请求并创建钱包
 *   4. 查询设备钱包列表
 */

import { generateKeyPair, sign } from "@noble/ed25519";
import { createHash } from "crypto";

const BASE_URL = process.env.API_URL || "http://localhost:3000/api/v1";

// ===== 工具函数 =====

/** 生成 Ed25519 密钥对 */
async function generateDeviceKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const privateKey = Buffer.from(await generateKeyPair()).toString("hex");
  // @noble/ed25519: getPublicKey 接受 hex 私钥
  const { getPublicKey } = await import("@noble/ed25519");
  const publicKey = Buffer.from(await getPublicKey(privateKey)).toString("hex");
  return { publicKey, privateKey };
}

/** 计算请求体的 SHA-256 hash */
function computeBodyHash(body: any): string {
  if (!body || Object.keys(body).length === 0) return "";
  const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
  return createHash("sha256").update(bodyStr).digest("hex");
}

/** 构造签名消息 */
function buildSignMessage(timestamp: string, method: string, path: string, bodyHash: string): string {
  return `${timestamp}${method}${path}${bodyHash}`;
}

/** 对消息进行 Ed25519 签名 */
async function signMessage(message: string, privateKeyHex: string): Promise<string> {
  const msgBytes = new TextEncoder().encode(message);
  const sig = await sign(msgBytes, privateKeyHex);
  return Buffer.from(sig).toString("hex");
}

/** 生成随机 nonce */
function generateNonce(): string {
  return createHash("sha256")
    .update(`${Date.now()}-${Math.random()}`)
    .digest("hex")
    .slice(0, 32);
}

/** 发送带签名的请求 */
async function signedRequest(
  method: string,
  path: string,
  body: any,
  publicKey: string,
  privateKey: string
): Promise<any> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = generateNonce();
  const bodyHash = computeBodyHash(body);
  const message = buildSignMessage(timestamp, method, path, bodyHash);
  const signature = await signMessage(message, privateKey);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-device-id": publicKey,
    "x-signature": signature,
    "x-timestamp": timestamp,
    "x-nonce": nonce,
  };

  const url = `${BASE_URL}${path}`;
  const fetchOptions: any = {
    method,
    headers,
  };

  if (body && Object.keys(body).length > 0) {
    fetchOptions.body = JSON.stringify(body);
  }

  console.log(`\n→ ${method} ${path}`);
  console.log(`  Headers: x-device-id=${publicKey.slice(0, 8)}..., x-timestamp=${timestamp}`);

  const response = await fetch(url, fetchOptions);
  const data = await response.json();

  console.log(`← ${response.status} ${response.statusText}`);
  console.log(`  Response:`, JSON.stringify(data, null, 2).slice(0, 500));

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} - ${JSON.stringify(data)}`);
  }

  return data;
}

/** 发送无签名请求（设备注册） */
async function unsignedRequest(method: string, path: string, body: any): Promise<any> {
  const url = `${BASE_URL}${path}`;
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  console.log(`\n→ ${method} ${path} (unsigned)`);
  console.log(`← ${response.status} ${response.statusText}`);
  console.log(`  Response:`, JSON.stringify(data, null, 2).slice(0, 500));

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} - ${JSON.stringify(data)}`);
  }

  return data;
}

// ===== 主测试流程 =====

async function main() {
  console.log("========================================");
  console.log("  imwallet 设备签名认证测试");
  console.log("========================================\n");

  // Step 1: 生成密钥对
  console.log("Step 1: 生成 Ed25519 密钥对...");
  const keys = await generateDeviceKeys();
  console.log(`  公钥 (deviceId): ${keys.publicKey}`);
  console.log(`  私钥: ${keys.privateKey.slice(0, 8)}...`);

  // Step 2: 注册设备
  console.log("\nStep 2: 注册设备...");
  await unsignedRequest("POST", "/devices", {
    device_id: keys.publicKey,
    platform: "web",
    os: "Chrome 120",
    model: "Web Browser",
    locale: "zh-CN",
    version: "1.0.0",
    currency: "CNY",
  });

  // Step 3: 获取设备信息
  console.log("\nStep 3: 获取设备信息...");
  await signedRequest("GET", "/devices/me", {}, keys.publicKey, keys.privateKey);

  // Step 4: 创建钱包
  console.log("\nStep 4: 创建钱包...");
  const walletResult = await signedRequest("POST", "/wallets", {
    alias: "TestWallet",
  }, keys.publicKey, keys.privateKey);

  // Step 5: 获取设备钱包列表
  console.log("\nStep 5: 获取设备钱包列表...");
  await signedRequest("GET", "/devices/wallets", {}, keys.publicKey, keys.privateKey);

  // Step 6: 获取钱包列表
  console.log("\nStep 6: 获取钱包列表...");
  await signedRequest("GET", "/wallets", {}, keys.publicKey, keys.privateKey);

  console.log("\n========================================");
  console.log("  ✅ 全部测试通过！");
  console.log("========================================");
}

main().catch((err) => {
  console.error("\n❌ 测试失败:", err.message);
  process.exit(1);
});
