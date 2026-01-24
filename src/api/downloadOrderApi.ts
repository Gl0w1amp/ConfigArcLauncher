import { invokeTauri } from './tauriClient';

export type DownloadOrderPayload = {
  url: string;
  gameId: string;
  ver: string;
  serial: string;
  headers: string[];
  proxy?: string;
  timeoutSecs?: number;
  encodeRequest?: boolean;
};

export type DownloadOrderResponse = {
  raw: string;
  decoded: string;
  decode_error?: string | null;
  status_code: number;
  status_text: string;
  content_length?: number | null;
};

export const requestDownloadOrder = (payload: DownloadOrderPayload) =>
  invokeTauri<DownloadOrderResponse>('download_order_cmd', { payload });

export type DownloadOrderDownloadItem = {
  url: string;
  filename?: string;
};

export type DownloadOrderDownloadResult = {
  url: string;
  filename: string;
  path: string;
};

export const fetchDownloadOrderInstruction = (url: string, userAgent?: string) =>
  invokeTauri<string>('download_order_fetch_text_cmd', { url, user_agent: userAgent });

export const downloadOrderFiles = (items: DownloadOrderDownloadItem[]) =>
  invokeTauri<DownloadOrderDownloadResult[]>('download_order_download_files_cmd', { items });

export const cancelDownloadOrder = () =>
  invokeTauri<void>('download_order_cancel_cmd');
