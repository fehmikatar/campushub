/** Notification renvoyée par le notification-service (Laravel). `id` numérique. */
export interface AppNotification {
  id: number;
  type: string;
  title: string;
  message: string;
  data: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
}

/** Pagination Laravel (seuls les champs utilisés). */
export interface Page<T> {
  data: T[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
}

export interface NotificationPreferences {
  email: string | null;
  email_enabled: boolean;
  /** Types de notifications coupés (ex. « forum.like »). */
  muted_types: string[];
}
