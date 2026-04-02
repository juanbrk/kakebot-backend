import * as admin from "firebase-admin";
import { getDb } from "./db";
import { CreditCard, CardStatement, CreditCardProcessor } from "../types/index";

/**
 * Returns all credit cards for a user, ordered by creation date.
 *
 * @param {string} telegramUserId
 * @return {CreditCard[]} Cards sorted by createdAt ascending
 */
export async function getCardsByUser(
  telegramUserId: string,
): Promise<CreditCard[]> {
  const snapshot = await getDb()
    .collection("credit_cards")
    .where("telegramUserId", "==", telegramUserId)
    .orderBy("createdAt", "asc")
    .get();

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Omit<CreditCard, "id">),
  }));
}

/**
 * Returns a single credit card by Firestore document ID.
 *
 * @param {string} cardId
 * @return {CreditCard | null}
 */
export async function getCardById(cardId: string): Promise<CreditCard | null> {
  const doc = await getDb().collection("credit_cards").doc(cardId).get();

  if (!doc.exists) return null;

  return {
    id: doc.id,
    ...(doc.data() as Omit<CreditCard, "id">),
  };
}

/**
 * Creates a new credit card document.
 *
 * @param {object} params
 * @param {string} params.telegramUserId
 * @param {string} params.lastFourDigits - Exactly 4 numeric characters
 * @param {string} params.bank - Bank name
 * @param {CreditCardProcessor} params.processor
 * @param {number} params.expiryMonth - 1-12
 * @param {number} params.expiryYear - 4-digit year
 * @return {Promise<string>} New Firestore document ID
 */
export async function createCard({
  telegramUserId,
  lastFourDigits,
  bank,
  processor,
  expiryMonth,
  expiryYear,
}: {
  telegramUserId: string;
  lastFourDigits: string;
  bank: string;
  processor: CreditCardProcessor;
  expiryMonth: number;
  expiryYear: number;
}): Promise<string> {
  const docRef = await getDb().collection("credit_cards").add({
    telegramUserId,
    lastFourDigits,
    bank,
    processor,
    expiryMonth,
    expiryYear,
    createdAt: admin.firestore.Timestamp.now(),
  });
  return docRef.id;
}

/**
 * Returns the statement for a card+month combination, or null if none exists.
 *
 * @param {string} cardId
 * @param {string} month - YYYY-MM format
 * @return {CardStatement | null}
 */
export async function getStatementByCardAndMonth(
  cardId: string,
  month: string,
): Promise<CardStatement | null> {
  const snapshot = await getDb()
    .collection("card_statements")
    .where("cardId", "==", cardId)
    .where("month", "==", month)
    .get();

  if (snapshot.empty) return null;

  const doc = snapshot.docs[0];
  return {
    id: doc.id,
    ...(doc.data() as Omit<CardStatement, "id">),
  };
}

/**
 * Returns a single statement by Firestore document ID.
 *
 * @param {string} statementId
 * @return {CardStatement | null}
 */
export async function getStatementById(
  statementId: string,
): Promise<CardStatement | null> {
  const doc = await getDb()
    .collection("card_statements")
    .doc(statementId)
    .get();

  if (!doc.exists) return null;

  return {
    id: doc.id,
    ...(doc.data() as Omit<CardStatement, "id">),
  };
}

/**
 * Returns all statements for a user in a given month.
 * Used for the monthly report TARJETAS section.
 *
 * @param {string} telegramUserId
 * @param {string} month - YYYY-MM format
 * @return {CardStatement[]}
 */
export async function getStatementsByUserAndMonth(
  telegramUserId: string,
  month: string,
): Promise<CardStatement[]> {
  const snapshot = await getDb()
    .collection("card_statements")
    .where("telegramUserId", "==", telegramUserId)
    .where("month", "==", month)
    .get();

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Omit<CardStatement, "id">),
  }));
}

/**
 * Creates a new card statement document.
 *
 * @param {object} params
 * @param {string} params.cardId
 * @param {string} params.telegramUserId
 * @param {string} params.month - YYYY-MM format
 * @param {number} params.amountARS
 * @param {number} params.amountUSD - 0 if no USD charge
 * @param {Date} params.dueDate
 * @return {Promise<string>} New Firestore document ID
 */
export async function createStatement({
  cardId,
  telegramUserId,
  month,
  amountARS,
  amountUSD,
  dueDate,
}: {
  cardId: string;
  telegramUserId: string;
  month: string;
  amountARS: number;
  amountUSD: number;
  dueDate: Date;
}): Promise<string> {
  const docRef = await getDb()
    .collection("card_statements")
    .add({
      cardId,
      telegramUserId,
      month,
      amountARS,
      amountUSD,
      dueDate: admin.firestore.Timestamp.fromDate(dueDate),
      createdAt: admin.firestore.Timestamp.now(),
    });
  return docRef.id;
}

/**
 * Saves the receipt URL on an existing statement document.
 *
 * @param {string} statementId
 * @param {string} receiptUrl
 */
export async function saveStatementReceiptUrl(
  statementId: string,
  receiptUrl: string,
): Promise<void> {
  await getDb()
    .collection("card_statements")
    .doc(statementId)
    .update({ receiptUrl });
}
