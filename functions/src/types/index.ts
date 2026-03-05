export interface Expense {
  id?: string;
  telegramUserId: string;
  description: string;
  normalizedDesc: string;
  amount: number;
  categoryId: string | null;
  date: FirebaseFirestore.Timestamp;
  createdAt: FirebaseFirestore.Timestamp;
}

export interface SubcategoryMapping {
  id?: string;
  normalizedDesc: string;
  displayName: string;
  categoryId: string;
  telegramUserId: string;
  createdAt: FirebaseFirestore.Timestamp;
}

export interface Category {
  id: string;
  name: string;
  type: "income" | "expense" | "both";
  icon?: string;
  color?: string;
  subcategories?: string[];
  isFixed?: boolean;
}

export interface PendingDescEntry {
  normalizedDesc: string;
  displayName: string;
  totalAmount: number;
}

export interface SessionExpenseEntry {
  desc: string;
  displayName: string;
  amount: number;
  categoryName: string;
}

export interface BulkExpenseEntry {
  description: string;
  amount: number;
}

export interface Service {
  id?: string;
  telegramUserId: string;
  name: string;
  normalizedName: string;
  createdAt: FirebaseFirestore.Timestamp;
}

export interface ServiceInstallment {
  id?: string;
  telegramUserId: string;
  serviceId: string;
  serviceName: string;
  amount: number;
  dueDate: FirebaseFirestore.Timestamp;
  dueMonth: string;
  isPaid: boolean;
  paidAt?: FirebaseFirestore.Timestamp;
  createdAt: FirebaseFirestore.Timestamp;
}

export interface Session {
  telegramUserId: string;
  state:
    | "categorizing"
    | "awaiting_new_category_name"
    | "awaiting_amount"
    | "awaiting_description"
    | "bulk_pending"
    | "svc_awaiting_name"
    | "svc_awaiting_amount"
    | "svc_awaiting_day"
    | "svc_awaiting_edit_name"
    | "svc_awaiting_edit_amount"
    | "svc_awaiting_edit_day";
  pendingDescs: PendingDescEntry[];
  currentDesc: string;
  currentDisplayName: string;
  currentTotalAmount: number;
  currentPage: number;
  messageId: number;
  chatId: number;
  sessionExpenses: SessionExpenseEntry[];
  partialDescription?: string;
  partialAmount?: number;
  bulkExpenses?: BulkExpenseEntry[];
  serviceId?: string;
  serviceName?: string;
  installmentId?: string;
  selectedMonth?: string;
}
