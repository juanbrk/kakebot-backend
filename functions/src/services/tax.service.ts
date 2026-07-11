import * as admin from "firebase-admin";
import { getDb } from "./db";
import {
  Tax,
  TaxInstallment,
  SaveTaxInstallmentParams,
  CreateTaxParams,
  UpdateTaxPaymentMethodParams,
} from "../types/tax.types";

/**
 * Creates a new tax document and returns its Firestore ID.
 *
 * @param {CreateTaxParams} params - Tax creation parameters
 * @return {string} Firestore ID of the created tax
 */
export async function createTax({
  telegramUserId,
  name,
  paymentMethod,
}: CreateTaxParams): Promise<string> {
  const normalizedName = name.toLowerCase().trim();
  const data: Record<string, unknown> = {
    telegramUserId,
    name,
    normalizedName,
    createdAt: admin.firestore.Timestamp.now(),
  };
  if (paymentMethod !== undefined) {
    data.paymentMethod = paymentMethod;
  }
  const docRef = await getDb().collection("taxes").add(data);
  return docRef.id;
}

/**
 * Updates (or removes) the payment method of an existing tax.
 * Pass paymentMethod as undefined to delete the field.
 *
 * @param {UpdateTaxPaymentMethodParams} params - taxId and optional paymentMethod
 * @return {void}
 */
export async function updateTaxPaymentMethod({
  taxId,
  paymentMethod,
}: UpdateTaxPaymentMethodParams): Promise<void> {
  const value =
    paymentMethod !== undefined
      ? paymentMethod
      : admin.firestore.FieldValue.delete();
  await getDb().collection("taxes").doc(taxId).update({ paymentMethod: value });
}

/**
 * Updates the due date of a tax installment.
 *
 * @param {string} installmentId - Tax installment document ID
 * @param {Date} dueDate - New due date, already validated against its month
 * @return {void}
 */
export async function updateTaxInstallmentDueDay(
  installmentId: string,
  dueDate: Date
): Promise<void> {
  await getDb()
    .collection("tax_installments")
    .doc(installmentId)
    .update({ dueDate: admin.firestore.Timestamp.fromDate(dueDate) });
}

/**
 * Returns all taxes for a user, ordered by creation date ascending.
 *
 * @param {string} telegramUserId - User's Telegram ID
 * @return {Tax[]} Sorted list of taxes
 */
export async function getTaxesByUser(telegramUserId: string): Promise<Tax[]> {
  const snapshot = await getDb()
    .collection("taxes")
    .where("telegramUserId", "==", telegramUserId)
    .get();

  const taxes = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Omit<Tax, "id">),
  }));

  return taxes.sort((a, b) => a.createdAt.toMillis() - b.createdAt.toMillis());
}

/**
 * Returns a tax by its Firestore ID, or null if not found.
 *
 * @param {string} taxId - Tax document ID
 * @return {Tax | null} Tax or null
 */
export async function getTaxById(taxId: string): Promise<Tax | null> {
  const doc = await getDb()
    .collection("taxes")
    .doc(taxId)
    .get();

  if (!doc.exists) {
    return null;
  }

  return { id: doc.id, ...(doc.data() as Omit<Tax, "id">) };
}

/**
 * Saves a monthly tax installment.
 */
export async function saveTaxInstallment({
  telegramUserId,
  taxId,
  taxName,
  amount,
  dueDate,
  dueMonth,
}: SaveTaxInstallmentParams): Promise<string> {
  const docRef = await getDb()
    .collection("tax_installments")
    .add({
      telegramUserId,
      taxId,
      taxName,
      amount,
      dueDate: admin.firestore.Timestamp.fromDate(dueDate),
      dueMonth,
      isPaid: false,
      createdAt: admin.firestore.Timestamp.now(),
    });
  return docRef.id;
}

/**
 * Returns the installment for a given tax and month, or null if none exists.
 *
 * @param {string} taxId - Tax document ID
 * @param {string} dueMonth - Month in "YYYY-MM" format
 * @return {TaxInstallment | null} Installment or null
 */
export async function getTaxInstallment(
  taxId: string,
  dueMonth: string
): Promise<TaxInstallment | null> {
  const snapshot = await getDb()
    .collection("tax_installments")
    .where("taxId", "==", taxId)
    .where("dueMonth", "==", dueMonth)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  const doc = snapshot.docs[0];
  return { id: doc.id, ...(doc.data() as Omit<TaxInstallment, "id">) };
}

/**
 * Returns a tax installment by its Firestore ID, or null if not found.
 *
 * @param {string} installmentId - Installment document ID
 * @return {TaxInstallment | null} Installment or null
 */
export async function getTaxInstallmentById(
  installmentId: string
): Promise<TaxInstallment | null> {
  const doc = await getDb()
    .collection("tax_installments")
    .doc(installmentId)
    .get();

  if (!doc.exists) {
    return null;
  }

  return { id: doc.id, ...(doc.data() as Omit<TaxInstallment, "id">) };
}

/**
 * Marks a tax installment as paid, recording the payment timestamp.
 *
 * @param {string} installmentId - Installment document ID
 * @return {void}
 */
export async function markTaxInstallmentAsPaid(
  installmentId: string
): Promise<void> {
  await getDb()
    .collection("tax_installments")
    .doc(installmentId)
    .update({
      isPaid: true,
      paidAt: admin.firestore.Timestamp.now(),
    });
}

/**
 * Saves the GCS receipt URL on a tax installment document.
 *
 * @param {string} installmentId - Installment document ID
 * @param {string} receiptUrl - Public GCS URL of the uploaded receipt
 * @return {void}
 */
export async function saveTaxReceiptUrl(
  installmentId: string,
  receiptUrl: string
): Promise<void> {
  await getDb()
    .collection("tax_installments")
    .doc(installmentId)
    .update({ receiptUrl });
}

/**
 * Returns all installments for a given tax, sorted by dueMonth descending (newest first).
 * Used by the installment history view.
 *
 * @param {string} taxId - Tax document ID
 * @return {TaxInstallment[]} All installments sorted ascending by dueMonth (oldest first)
 */
export async function getTaxInstallmentsByTaxId(
  taxId: string
): Promise<TaxInstallment[]> {
  const snapshot = await getDb()
    .collection("tax_installments")
    .where("taxId", "==", taxId)
    .get();

  const installments = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Omit<TaxInstallment, "id">),
  }));

  return installments.sort((a, b) => a.dueMonth.localeCompare(b.dueMonth));
}

/**
 * Returns unpaid tax installments for a user due within the next N days, ordered by dueDate ascending.
 *
 * @param {string} telegramUserId - User's Telegram ID
 * @param {number} daysAhead - Number of days to look ahead from today
 * @return {TaxInstallment[]} Matching installments sorted by dueDate
 */
export async function getUpcomingUnpaidTaxInstallments(
  telegramUserId: string,
  daysAhead: number
): Promise<TaxInstallment[]> {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const futureDate = new Date(now);
  futureDate.setDate(futureDate.getDate() + daysAhead);

  const snapshot = await getDb()
    .collection("tax_installments")
    .where("telegramUserId", "==", telegramUserId)
    .where("isPaid", "==", false)
    .where("dueDate", ">=", admin.firestore.Timestamp.fromDate(now))
    .where("dueDate", "<=", admin.firestore.Timestamp.fromDate(futureDate))
    .orderBy("dueDate", "asc")
    .get();

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Omit<TaxInstallment, "id">),
  }));
}

/**
 * Returns all tax installments for a user in a given month.
 * Used by the monthly report generator.
 *
 * @param {string} telegramUserId - User's Telegram ID
 * @param {string} dueMonth - Month in "YYYY-MM" format
 * @return {TaxInstallment[]} Installments ordered by taxName ascending
 */
export async function getTaxInstallmentsForMonth(
  telegramUserId: string,
  dueMonth: string
): Promise<TaxInstallment[]> {
  const snapshot = await getDb()
    .collection("tax_installments")
    .where("telegramUserId", "==", telegramUserId)
    .where("dueMonth", "==", dueMonth)
    .get();

  const installments = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Omit<TaxInstallment, "id">),
  }));

  return installments.sort((a, b) => a.taxName.localeCompare(b.taxName));
}
