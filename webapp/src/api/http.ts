import axios, { type AxiosRequestConfig, type RawAxiosRequestHeaders } from 'axios';
import packageJson from '../../package.json';
import { decrypt } from 'src/util/crypto';

// eslint-disable-next-line
type Options<D = any, P = any> = {
  headers?: RawAxiosRequestHeaders;
  data?: D;
  params?: P;
};

const defaultConfig: AxiosRequestConfig = {
  baseURL: '/api/',
  timeout: 30000,
};

const defaultHeader: RawAxiosRequestHeaders = {
  'Content-type': 'application/json',
  Accept: 'application/json',
  'x-api-version': packageJson.version,
};

// eslint-disable-next-line
const publicRequestConfig = <D = unknown, P = any>(
  method: string,
  url: string,
  options?: Options<D, P>,
) => {
  const userId = localStorage.getItem('userId');
  const deviceId = localStorage.getItem('deviceId');
  const headerUser = userId && deviceId ? decrypt(userId, deviceId) : 'no-user-id';

  return {
    ...defaultConfig,
    headers: {
      'x-user-id': headerUser,
      ...defaultHeader,
      ...options?.headers,
    },
    data: options?.data,
    params: options?.params,
    url,
    method,
  };
};

// eslint-disable-next-line
const get = async <T, P = any>(url: string, options?: Options<any, P>) =>
  await axios.request<T>(publicRequestConfig<unknown, P>('get', url, options));

const post = async <T, D = unknown>(url: string, options?: Options<D>) =>
  await axios.request<T>(publicRequestConfig<D>('post', url, options));

const put = async <T, D = unknown>(url: string, options?: Options<D>) =>
  await axios.request<T>(publicRequestConfig<D>('put', url, options));

const patch = async <T, D = unknown>(url: string, options?: Options<D>) =>
  await axios.request<T>(publicRequestConfig<D>('patch', url, options));

const sendDelete = async <T, D = unknown>(url: string, options?: Options<D>) =>
  await axios.request<T>(publicRequestConfig<D>('delete', url, options));

export default {
  get,
  post,
  put,
  patch,
  delete: sendDelete,
};
