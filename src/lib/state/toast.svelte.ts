/**
 * Toast Notification State - Svelte 5 Runes
 *
 * Provides a centralized service for showing toast notifications
 * from anywhere in the application.
 */

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration: number;
  dismissible: boolean;
}

export interface ToastOptions {
  duration?: number;
  dismissible?: boolean;
  dedupe?: boolean;
}

const DEFAULT_DURATION = 5000;
const MAX_TOASTS = 5;

class ToastState {
  toasts = $state<Toast[]>([]);
  private timeouts = new Map<string, ReturnType<typeof setTimeout>>();

  private generateId(): string {
    return `toast-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  private add(type: ToastType, message: string, options?: ToastOptions): string | null {
    const dedupe = options?.dedupe ?? true;

    if (dedupe) {
      const existing = this.toasts.find((t) => t.type === type && t.message === message);
      if (existing) {
        return null;
      }
    }

    const id = this.generateId();
    const duration = options?.duration ?? DEFAULT_DURATION;
    const dismissible = options?.dismissible ?? true;

    const toast: Toast = {
      id,
      type,
      message,
      duration,
      dismissible,
    };

    let newToasts = [...this.toasts, toast];

    while (newToasts.length > MAX_TOASTS) {
      const oldest = newToasts[0];
      this.clearTimeout(oldest.id);
      newToasts = newToasts.slice(1);
    }

    this.toasts = newToasts;

    if (duration > 0) {
      const timeout = setTimeout(() => {
        this.dismiss(id);
      }, duration);
      this.timeouts.set(id, timeout);
    }

    return id;
  }

  private clearTimeout(id: string): void {
    const timeout = this.timeouts.get(id);
    if (timeout) {
      clearTimeout(timeout);
      this.timeouts.delete(id);
    }
  }

  success(message: string, options?: ToastOptions): string | null {
    return this.add('success', message, options);
  }

  error(message: string, options?: ToastOptions): string | null {
    return this.add('error', message, options);
  }

  info(message: string, options?: ToastOptions): string | null {
    return this.add('info', message, options);
  }

  warning(message: string, options?: ToastOptions): string | null {
    return this.add('warning', message, options);
  }

  dismiss(id: string): void {
    this.clearTimeout(id);
    this.toasts = this.toasts.filter((t) => t.id !== id);
  }

  dismissAll(): void {
    for (const timeout of this.timeouts.values()) {
      clearTimeout(timeout);
    }
    this.timeouts.clear();
    this.toasts = [];
  }
}

export const toast = new ToastState();
