import CryptoJS from 'crypto-js';

export const encrypt = (input: string, key: string) => CryptoJS.AES.encrypt(input, key).toString();

export const decrypt = (input: string, key: string) => {
  const bytes = CryptoJS.AES.decrypt(input, key);

  return bytes.toString(CryptoJS.enc.Utf8);
};
