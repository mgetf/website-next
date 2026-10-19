declare module 'web-push' {
  export class WebPushError extends Error {
    statusCode: number;
    endpoint: string;
  }

  export function setVapidDetails(subject: string, publicKey: string, privateKey: string): void;

  export function sendNotification(
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    payload?: string | null,
  ): Promise<{ statusCode: number; body: string }>;

  const webpush: {
    WebPushError: typeof WebPushError;
    setVapidDetails: typeof setVapidDetails;
    sendNotification: typeof sendNotification;
  };

  export default webpush;
}
