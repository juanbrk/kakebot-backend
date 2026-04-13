import * as admin from "firebase-admin";
import { getDb } from "./db";
import { CreditCard, CardStatement } from "../types/index";
import {
  CreateCardParams,
  CreateStatementParams,
  UpdateStatementAmountARSParams,
  UpdateStatementAmountUSDParams,
  UpdateStatementDueDayParams,
} from "../types/card.types";

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
 * @param {CreateCardParams} params
 * @return {Promise<string>} New Firestore document ID
 */
export async function createCard(params: CreateCardParams): Promise<string> {
  const { telegramUserId, lastFourDigits, bank, processor, expiryMonth, expiryYear } = params;

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
 * @param {CreateStatementParams} params
 * @return {Promise<string>} New Firestore document ID
 */
export async function createStatement(params: CreateStatementParams): Promise<string> {
  const { cardId, telegramUserId, month, amountARS, amountUSD, dueDate } = params;

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
 * Returns all statements for a card, sorted ascending by month (oldest first).
 *
 * @param {string} cardId
 * @param {string} telegramUserId
 * @return {CardStatement[]}
 */
export async function getStatementsByCard(
  cardId: string,
  telegramUserId: string,
): Promise<CardStatement[]> {
  const snapshot = await getDb()
    .collection("card_statements")
    .where("cardId", "==", cardId)
    .where("telegramUserId", "==", telegramUserId)
    .get();

  const statements = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Omit<CardStatement, "id">),
  }));

  return statements.sort((a, b) => a.month.localeCompare(b.month));
}

/**
 * Updates the ARS amount on an existing statement.
 *
 * @param {UpdateStatementAmountARSParams} params
 */
export async function updateStatementAmountARS({
  statementId,
  amount,
}: UpdateStatementAmountARSParams): Promise<void> {
  await getDb()
    .collection("card_statements")
    .doc(statementId)
    .update({ amountARS: amount });
}

/**
 * Updates the USD amount on an existing statement.
 *
 * @param {UpdateStatementAmountUSDParams} params
 */
export async function updateStatementAmountUSD({
  statementId,
  amount,
}: UpdateStatementAmountUSDParams): Promise<void> {
  await getDb()
    .collection("card_statements")
    .doc(statementId)
    .update({ amountUSD: amount });
}

/**
 * Updates the due day of an existing statement.
 * Validates the day against the statement's month before applying.
 *
 * @param {UpdateStatementDueDayParams} params
 * @return {boolean} false if the day is out of range for the statement's month
 */
export async function updateStatementDueDay({
  statementId,
  newDay,
}: UpdateStatementDueDayParams): Promise<boolean> {
  const statement = await getStatementById(statementId);
  if (!statement) return false;

  const [year, month] = statement.month.split("-").map(Number);
  const maxDay = new Date(year, month, 0).getDate();

  if (newDay < 1 || newDay > maxDay) return false;

  const newDueDate = new Date(Date.UTC(year, month - 1, newDay));
  await getDb()
    .collection("card_statements")
    .doc(statementId)
    .update({ dueDate: admin.firestore.Timestamp.fromDate(newDueDate) });

  return true;
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
