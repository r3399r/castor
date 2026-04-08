import axios, { type AxiosRequestConfig, type RawAxiosRequestHeaders } from 'axios';
import { auth } from 'src/firebase/config';
import packageJson from '../../package.json';

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
const publicRequestConfig = async <D = unknown, P = any>(
  method: string,
  url: string,
  options?: Options<D, P>,
) => {
  const user = auth.currentUser;
  const token = user ? await user.getIdToken(true) : null;

  return {
    ...defaultConfig,
    headers: {
      Authorization: token ?? 'NO_AUTH',
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
const get = async <T, P = any>(url: string, options?: Options<any, P>) => {
  const config = await publicRequestConfig<unknown, P>('get', url, options);
  return await axios.request<T>(config);
};

const post = async <T, D = unknown>(url: string, options?: Options<D>) => {
  const config = await publicRequestConfig<D>('post', url, options);
  return await axios.request<T>(config);
};

const put = async <T, D = unknown>(url: string, options?: Options<D>) => {
  const config = await publicRequestConfig<D>('put', url, options);
  return await axios.request<T>(config);
};

const patch = async <T, D = unknown>(url: string, options?: Options<D>) => {
  const config = await publicRequestConfig<D>('patch', url, options);
  return await axios.request<T>(config);
};

const sendDelete = async <T, D = unknown>(url: string, options?: Options<D>) => {
  const config = await publicRequestConfig<D>('delete', url, options);
  return await axios.request<T>(config);
};

export default {
  get,
  post,
  put,
  patch,
  delete: sendDelete,
};
