import * as admin from "firebase-admin";

export function getDb(): FirebaseFirestore.Firestore {
  return admin.firestore();
}
