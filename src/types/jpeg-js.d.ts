declare module 'jpeg-js' {
  export interface RawImageData<T = Buffer> {
    data: T;
    width: number;
    height: number;
  }
  export function encode(imgData: RawImageData<Uint8Array | Buffer>, quality?: number): RawImageData<Buffer>;
  export function decode(jpegData: Uint8Array | Buffer, opts?: { useTArray?: boolean }): RawImageData<Buffer>;
}
