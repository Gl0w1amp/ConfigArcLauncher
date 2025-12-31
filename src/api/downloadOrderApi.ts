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
