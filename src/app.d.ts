// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
  namespace App {
    interface Error {
      message: string;
      code?: string;
    }
    interface Locals {
      user: import('$lib/types/user').SessionUser | null;
      /** Current deployment environment (production, staging, development) */
      appEnvironment: import('$lib/server/utils/environment').AppEnvironment;
      /** True if user is blocked from accessing the site (staging mode, non-admin) */
      devGated?: boolean;
    }
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }
}

export {};
