import * as admin from "firebase-admin";
import { BulkExpenseEntry } from "../types/index";
import { getDb } from "./db";

export async function saveExpense(
  telegramUserId: string,
  description: string,
  amount: number
): Promise<string | null> {
  const normalizedDesc = description.toLowerCase().trim();

  const existingMapping = await getDb()
    .collection("subcategory_mappings")
    .where("normalizedDesc", "==", normalizedDesc)
    .where("telegramUserId", "==", telegramUserId)
    .limit(1)
    .get();

  const categoryId = existingMapping.empty ?
    null :
    existingMapping.docs[0].data().categoryId;

  await getDb().collection("expenses").add({
    telegramUserId,
    description,
    normalizedDesc,
    amount,
    categoryId,
    date: admin.firestore.Timestamp.now(),
    createdAt: admin.firestore.Timestamp.now(),
  });

  return categoryId;
}

export async function saveBulkExpenses(
  telegramUserId: string,
  expenses: BulkExpenseEntry[]
): Promise<void> {
  const mappingsSnapshot = await getDb()
    .collection("subcategory_mappings")
    .where("telegramUserId", "==", telegramUserId)
    .get();

  const categoryByDesc = new Map<string, string>();
  for (const doc of mappingsSnapshot.docs) {
    const mapping = doc.data();
    categoryByDesc.set(mapping.normalizedDesc, mapping.categoryId);
  }

  const batch = getDb().batch();
  const expensesRef = getDb().collection("expenses");
  const now = admin.firestore.Timestamp.now();

  for (const entry of expenses) {
    const normalizedDesc = entry.description.toLowerCase().trim();
    const categoryId = categoryByDesc.get(normalizedDesc) || null;

    batch.set(expensesRef.doc(), {
      telegramUserId,
      description: entry.description,
      normalizedDesc,
      amount: entry.amount,
      categoryId,
      date: now,
      createdAt: now,
    });
  }

  await batch.commit();
}
