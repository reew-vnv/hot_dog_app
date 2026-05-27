import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

const photoCountKey = (email: string) => `user:${email}:photos`;
const paidKey = (email: string) => `user:${email}:paid`;

export const FREE_LIMIT = 3;

export async function incrementPhotoCount(email: string): Promise<number> {
  return redis.incr(photoCountKey(email));
}

export async function getPhotoCount(email: string): Promise<number> {
  const value = await redis.get<number>(photoCountKey(email));
  return value ?? 0;
}

export async function isPaid(email: string): Promise<boolean> {
  const value = await redis.get<boolean>(paidKey(email));
  return value === true;
}

export async function setPaid(email: string): Promise<void> {
  await redis.set(paidKey(email), true);
}
