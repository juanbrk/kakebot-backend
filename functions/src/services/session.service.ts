import { Session } from "../types/index";
import { getDb } from "./db";

export async function getSession(
  telegramUserId: string
): Promise<Session | null> {
  const doc = await getDb().collection("sessions").doc(telegramUserId).get();
  return doc.exists ? (doc.data() as Session) : null;
}

export async function setSession(
  telegramUserId: string,
  session: Session
): Promise<void> {
  await getDb().collection("sessions").doc(telegramUserId).set(session);
}

export async function clearSession(telegramUserId: string): Promise<void> {
  await getDb().collection("sessions").doc(telegramUserId).delete();
}

export function emptySessionForPartial(telegramUserId: string): Session {
  return {
    telegramUserId,
    state: "awaiting_amount",
    pendingDescs: [],
    currentDesc: "",
    currentDisplayName: "",
    currentTotalAmount: 0,
    currentPage: 0,
    messageId: 0,
    chatId: 0,
    sessionExpenses: [],
  };
}
