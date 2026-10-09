// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import 'unplugin-icons/types/svelte';

declare global {
  namespace App {
    interface Error {
      code?: string;
    }
    interface Locals {
      user: import('#lib/types/user.js').SessionUser | null;
      /** Current deployment environment (production, staging, development) */
      appEnvironment: import('#lib/server/utils/environment.js').AppEnvironment;
      /** True if user is blocked from accessing the site (staging mode, non-admin) */
      devGated?: boolean;
    }
    interface PageData {
      /** Optional per-page Open Graph / Discord preview metadata */
      seo?: import('#lib/types/seo.js').PageSeo;
    }
    // interface PageState {}
    // interface Platform {}
  }
}

export {};
