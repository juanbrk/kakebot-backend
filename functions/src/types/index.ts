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
