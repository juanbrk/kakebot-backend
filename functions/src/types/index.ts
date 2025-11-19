// Tipos compartidos del backend

export interface User {
  id: string;
  email: string;
  name: string;
  familyId: string;
  role: "admin" | "member";
  telegramId?: string;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

export interface Family {
  id: string;
  name: string;
  members: string[]; // Array de user IDs
  createdBy: string;
  createdAt: FirebaseFirestore.Timestamp;
}

export interface Transaction {
  id?: string;
  familyId: string;
  userId: string;
  type: "income" | "expense";
  amount: number;
  currency: "ARS" | "USD";
  category: string;
  subcategory?: string;
  description: string;
  date: Date | FirebaseFirestore.Timestamp;
  paymentMethod?: string;
  tags?: string[];
  createdBy: string;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

export interface Category {
  id: string;
  name: string;
  type: "income" | "expense" | "both";
  icon?: string;
  color?: string;
  subcategories?: string[];
  isFixed?: boolean;
  parentId?: string;
}

export interface MonthlyReport {
  id?: string;
  familyId: string;
  month: number;
  year: number;
  totalIncome: number;
  totalExpense: number;
  balance: number;
  byCategory: Record<string, number>;
  byUser: Record<string, UserStats>;
  fixedExpenses: number;
  variableExpenses: number;
  createdAt: FirebaseFirestore.Timestamp;
}

export interface UserStats {
  totalExpenses: number;
  totalIncome: number;
  transactionCount: number;
}
