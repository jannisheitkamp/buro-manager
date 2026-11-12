/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

// qrcode bringt keine Typen mit; genutzt wird nur toDataURL
declare module 'qrcode' {
  export function toDataURL(text: string, options?: Record<string, unknown>): Promise<string>;
  const QRCode: { toDataURL: typeof toDataURL };
  export default QRCode;
}
