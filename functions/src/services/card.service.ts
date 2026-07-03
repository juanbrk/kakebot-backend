import * as admin from "firebase-admin";
import { getDb } from "./db";
import { CreditCard, CardStatement } from "../types/index";
import { buildDueDate } from "../helpers/format";
import {
  CardStatementForDue,
  CreateCardParams,
  CreateStatementParams,
  MarkStatementAsPaidParams,
  UpdateStatementAmountARSParams,
  UpdateStatementAmountUSDParams,
  UpdateStatementDueDayParams,
  UpdateStatementUSDAndRateParams,
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
      isPaid: false,
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

  const newDueDate = buildDueDate(year, month, newDay);
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

/**
 * Marks a card statement as paid, records the payment timestamp, and optionally stores the exchange rate.
 *
 * @param {MarkStatementAsPaidParams} params
 */
export async function markStatementAsPaid({
  statementId,
  exchangeRate,
  usdPaymentCurrency,
}: MarkStatementAsPaidParams): Promise<void> {
  await getDb()
    .collection("card_statements")
    .doc(statementId)
    .update({
      isPaid: true,
      paidAt: admin.firestore.Timestamp.now(),
      ...(exchangeRate !== undefined && { exchangeRate }),
      ...(usdPaymentCurrency !== undefined && { usdPaymentCurrency }),
    });
}

/**
 * Fetches upcoming unpaid card statements within `daysAhead` days, with resolved card labels.
 * Performs a compound query on card_statements, then batch-fetches unique parent cards
 * to build the display label for each result.
 *
 * @param {string} telegramUserId
 * @param {number} daysAhead - Max days ahead to include
 * @return {Promise<CardStatementForDue[]>} Statements sorted by dueDate ascending
 */
export async function getUpcomingUnpaidCardStatements(
  telegramUserId: string,
  daysAhead: number,
): Promise<CardStatementForDue[]> {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const futureDate = new Date(now);
  futureDate.setDate(futureDate.getDate() + daysAhead);

  const snapshot = await getDb()
    .collection("card_statements")
    .where("telegramUserId", "==", telegramUserId)
    .where("isPaid", "==", false)
    .where("dueDate", ">=", admin.firestore.Timestamp.fromDate(now))
    .where("dueDate", "<=", admin.firestore.Timestamp.fromDate(futureDate))
    .orderBy("dueDate", "asc")
    .get();

  if (snapshot.empty) return [];

  const statements = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Omit<CardStatement, "id">),
  }));

  const uniqueCardIds = [...new Set(statements.map((s) => s.cardId))];
  const cards = await Promise.all(uniqueCardIds.map((id) => getCardById(id)));

  const cardLabelMap = new Map<string, string>();
  uniqueCardIds.forEach((cardId, i) => {
    const card = cards[i];
    if (card) {
      const processorLabel = card.processor === "VISA" ? "Visa" : "Master";
      cardLabelMap.set(cardId, `${processorLabel} ${card.lastFourDigits} - ${card.bank}`);
    }
  });

  return statements
    .filter((s) => cardLabelMap.has(s.cardId))
    .map((s) => ({
      cardLabel: cardLabelMap.get(s.cardId) as string,
      amountARS: s.amountARS,
      amountUSD: s.amountUSD,
      dueDate: s.dueDate,
    }));
}


/**
 * Saves the ARS payment receipt URL on a statement document.
 *
 * @param {string} statementId
 * @param {string} url
 */
export async function saveStatementReceiptUrlARS(
  statementId: string,
  url: string,
): Promise<void> {
  await getDb()
    .collection("card_statements")
    .doc(statementId)
    .update({ receiptUrlARS: url });
}

/**
 * Saves the USD payment receipt URL on a statement document.
 *
 * @param {string} statementId
 * @param {string} url
 */
export async function saveStatementReceiptUrlUSD(
  statementId: string,
  url: string,
): Promise<void> {
  await getDb()
    .collection("card_statements")
    .doc(statementId)
    .update({ receiptUrlUSD: url });
}

/**
 * Updates both the USD amount and exchange rate on a statement in a single write.
 * Used when the user edits the USD amount — always requires a new TCV.
 *
 * @param {UpdateStatementUSDAndRateParams} params
 */
export async function updateStatementUSDAndRate({
  statementId,
  amountUSD,
  exchangeRate,
  usdPaymentCurrency,
}: UpdateStatementUSDAndRateParams): Promise<void> {
  await getDb()
    .collection("card_statements")
    .doc(statementId)
    .update({
      amountUSD,
      ...(exchangeRate !== undefined && { exchangeRate }),
      ...(usdPaymentCurrency !== undefined && { usdPaymentCurrency }),
    });
}
