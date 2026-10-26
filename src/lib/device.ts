import "server-only";
import { cookies } from "next/headers";
import { randomToken } from "./tokens";

const COOKIE = "asolink_device";

export async function getDevice() {
  const jar = await cookies();
  const existing = jar.get(COOKIE)?.value;
  if (existing) return existing;
  const device = randomToken(16);
  jar.set(COOKIE, device, { httpOnly: true, sameSite: "lax", secure: true, maxAge: 60 * 60 * 24 * 180, path: "/" });
  return device;
}
