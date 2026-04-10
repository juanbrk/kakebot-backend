/** Entity type for an upcoming due item. */
export type UpcomingDueEntityType = "service" | "tax";

/** A single upcoming unpaid due item, normalized across entity types. */
export interface UpcomingDueItem {
  entityName: string;
  amount: number;
  dueDate: Date;
  entityType: UpcomingDueEntityType;
}

/** A time-range bucket grouping upcoming due items. */
export interface UpcomingDuesBucket {
  label: string;
  days: number;
  items: UpcomingDueItem[];
  subtotal: number;
}

/** Result returned by getUpcomingDues. */
export interface UpcomingDuesResult {
  buckets: UpcomingDuesBucket[];
  hasAny: boolean;
}
