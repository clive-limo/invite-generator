export interface PresignGetOptions {
  /** Signing window in seconds. */
  expiresIn?: number;
  /**
   * Snap the signing time to the start of this many seconds, so repeated calls in
   * the same window produce the same URL and browsers can reuse their cached copy.
   */
  stableFor?: number;
  downloadName?: string;
}

export interface Storage {
  /** A URL the browser can PUT the object to; it must send exactly `contentType`. */
  presignPut(key: string, contentType: string, expiresIn?: number): Promise<string>;
  presignGet(key: string, options?: PresignGetOptions): Promise<string>;
  headObject(key: string): Promise<{ size: number; contentType: string | null } | null>;
  /** The first `length` bytes, for sniffing image headers. */
  readObjectStart(key: string, length?: number): Promise<Uint8Array>;
  copyObject(fromKey: string, toKey: string): Promise<void>;
  deleteObject(key: string): Promise<void>;
}
