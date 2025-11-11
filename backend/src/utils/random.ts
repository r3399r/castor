import { randomInt } from 'crypto';

export const randomBase10 = (length: number) => random('0123456789', length);

export const randomBase36 = (length: number): string =>
  random('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', length);

export const randomBase58 = (length: number): string =>
  // Base64 without I, l, O, 0, +, /
  random('123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz', length);

const random = (chars: string, length: number): string => {
  const n = chars.length;
  let str = '';
  for (let i = 0; i < length; ++i) str += chars[randomInt(n)];

  return str;
};
