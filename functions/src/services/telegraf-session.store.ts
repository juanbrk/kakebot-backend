import { SessionStore } from "telegraf";
import { KakebotWizardSession } from "../types/telegraf-context.types";
import { getDb } from "./db";

const TELEGRAF_SESSIONS_COLLECTION = "telegraf_sessions";

/**
 * Builds a Firestore-backed store for the Telegraf `session()` middleware.
 * Required because the bot runs as a stateless Cloud Function: the default
 * in-memory store would lose wizard state between invocations.
 *
 * @return {SessionStore<KakebotWizardSession>} Async store backed by Firestore.
 */
export function buildTelegrafSessionStore(): SessionStore<KakebotWizardSession> {
  return {
    async get(key: string): Promise<KakebotWizardSession | undefined> {
      const doc = await getDb().collection(TELEGRAF_SESSIONS_COLLECTION).doc(key).get();
      return doc.exists ? (doc.data() as KakebotWizardSession) : undefined;
    },
    async set(key: string, value: KakebotWizardSession): Promise<void> {
      // Firestore rejects undefined field values; strip them via JSON round-trip.
      const sanitized = JSON.parse(JSON.stringify(value)) as KakebotWizardSession;
      await getDb().collection(TELEGRAF_SESSIONS_COLLECTION).doc(key).set(sanitized);
    },
    async delete(key: string): Promise<void> {
      await getDb().collection(TELEGRAF_SESSIONS_COLLECTION).doc(key).delete();
    },
  };
}
