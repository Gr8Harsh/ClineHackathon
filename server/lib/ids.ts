import { randomBytes, randomUUID } from 'node:crypto';
export const uuid = () => randomUUID();
export const token = () => randomBytes(24).toString('base64url');
export const nowIso = () => new Date().toISOString();