/** 辰记水印 (r10): which watermark (`plan`), its sizes (`layout`), canvas drawing (`draw`) and a small QR encoder. */
export * from './layout';
export * from './plan';
export * from './draw';
export { encodeQr, type QrCode, type QrEcc } from './qr';
export { watermarkFile } from './browser';
