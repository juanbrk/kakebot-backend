import * as admin from "firebase-admin";
import { getDb } from "./db";
import {
  Service,
  ServiceInstallment,
  ServicePaymentMethod,
  SaveInstallmentParams,
} from "../types/service.types";
import { getDaysInMonth } from "../helpers/format";

export async function createService(
  telegramUserId: string,
  name: string
): Promise<string> {
  const normalizedName = name.toLowerCase().trim();
  const docRef = await getDb()
    .collection("services")
    .add({
      telegramUserId,
      name,
      normalizedName,
      createdAt: admin.firestore.Timestamp.now(),
    });
  return docRef.id;
}

export async function getServicesByUser(
  telegramUserId: string
): Promise<Service[]> {
  const snapshot = await getDb()
    .collection("services")
    .where("telegramUserId", "==", telegramUserId)
    .orderBy("createdAt", "asc")
    .get();

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Omit<Service, "id">),
  }));
}

export async function getServiceById(serviceId: string): Promise<Service | null> {
  const doc = await getDb()
    .collection("services")
    .doc(serviceId)
    .get();

  if (!doc.exists) {
    return null;
  }

  return {
    id: doc.id,
    ...(doc.data() as Omit<Service, "id">),
  };
}

/**
 * Updates the payment method of a service document.
 *
 * @param {string} serviceId - The service document ID
 * @param {ServicePaymentMethod} paymentMethod - The new payment method
 */
export async function updateServicePaymentMethod(
  serviceId: string,
  paymentMethod: ServicePaymentMethod
): Promise<void> {
  await getDb()
    .collection("services")
    .doc(serviceId)
    .update({ paymentMethod });
}

export async function updateServiceName(
  serviceId: string,
  newName: string
): Promise<void> {
  await getDb()
    .collection("services")
    .doc(serviceId)
    .update({
      name: newName,
      normalizedName: newName.toLowerCase().trim(),
    });
}

export async function deleteService(serviceId: string): Promise<void> {
  const batch = getDb().batch();

  batch.delete(getDb().collection("services").doc(serviceId));

  const installmentsSnapshot = await getDb()
    .collection("service_installments")
    .where("serviceId", "==", serviceId)
    .get();

  installmentsSnapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });

  await batch.commit();
}

/**
 * Saves a service installment to Firestore.
 */
export async function saveInstallment({
  telegramUserId,
  serviceId,
  serviceName,
  amount,
  dueDate,
  dueMonth,
}: SaveInstallmentParams): Promise<string> {
  const docRef = await getDb()
    .collection("service_installments")
    .add({
      telegramUserId,
      serviceId,
      serviceName,
      amount,
      dueDate: admin.firestore.Timestamp.fromDate(dueDate),
      dueMonth,
      isPaid: false,
      createdAt: admin.firestore.Timestamp.now(),
    });
  return docRef.id;
}

export async function markInstallmentAsPaid(
  installmentId: string
): Promise<void> {
  await getDb()
    .collection("service_installments")
    .doc(installmentId)
    .update({
      isPaid: true,
      paidAt: admin.firestore.Timestamp.now(),
    });
}

export async function getInstallment(
  serviceId: string,
  dueMonth: string
): Promise<ServiceInstallment | null> {
  const snapshot = await getDb()
    .collection("service_installments")
    .where("serviceId", "==", serviceId)
    .where("dueMonth", "==", dueMonth)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  const doc = snapshot.docs[0];
  return {
    id: doc.id,
    ...(doc.data() as Omit<ServiceInstallment, "id">),
  };
}

export async function replaceInstallment(
  installmentId: string,
  amount: number,
  dueDate: Date
): Promise<void> {
  await getDb()
    .collection("service_installments")
    .doc(installmentId)
    .update({
      amount,
      dueDate: admin.firestore.Timestamp.fromDate(dueDate),
    });
}

export async function updateInstallmentAmount(
  installmentId: string,
  amount: number
): Promise<void> {
  await getDb()
    .collection("service_installments")
    .doc(installmentId)
    .update({ amount });
}

/**
 * Updates the due day of an installment. Validates the day against the
 * installment's month before applying.
 *
 * @param {string} installmentId - Firestore document ID
 * @param {number} newDay - New day of month (1-28/29/30/31)
 * @return {boolean} True if updated, false if installment not found or day invalid
 */
export async function updateInstallmentDueDay(
  installmentId: string,
  newDay: number
): Promise<boolean> {
  const doc = await getDb()
    .collection("service_installments")
    .doc(installmentId)
    .get();

  if (!doc.exists) {
    return false;
  }

  const data = doc.data() as ServiceInstallment;
  const currentDueDate = data.dueDate.toDate();
  const monthStr = String(currentDueDate.getMonth() + 1).padStart(2, "0");
  const yearMonth = `${currentDueDate.getFullYear()}-${monthStr}`;
  const maxDay = getDaysInMonth(yearMonth);

  if (newDay < 1 || newDay > maxDay) {
    return false;
  }

  const newDueDate = new Date(
    currentDueDate.getFullYear(),
    currentDueDate.getMonth(),
    newDay
  );

  await getDb()
    .collection("service_installments")
    .doc(installmentId)
    .update({
      dueDate: admin.firestore.Timestamp.fromDate(newDueDate),
    });

  return true;
}

export async function saveReceiptUrl(
  installmentId: string,
  receiptUrl: string
): Promise<void> {
  await getDb()
    .collection("service_installments")
    .doc(installmentId)
    .update({ receiptUrl });
}

export async function saveInvoiceUrl(
  installmentId: string,
  invoiceUrl: string
): Promise<void> {
  await getDb()
    .collection("service_installments")
    .doc(installmentId)
    .update({ invoiceUrl });
}

export async function getInstallmentById(
  installmentId: string
): Promise<ServiceInstallment | null> {
  const doc = await getDb()
    .collection("service_installments")
    .doc(installmentId)
    .get();

  if (!doc.exists) {
    return null;
  }

  return {
    id: doc.id,
    ...(doc.data() as Omit<ServiceInstallment, "id">),
  };
}

export async function getInstallmentsByService(
  serviceId: string,
  telegramUserId: string
): Promise<ServiceInstallment[]> {
  const snapshot = await getDb()
    .collection("service_installments")
    .where("serviceId", "==", serviceId)
    .where("telegramUserId", "==", telegramUserId)
    .get();

  const installments = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Omit<ServiceInstallment, "id">),
  }));

  return installments.sort((a, b) => b.dueMonth.localeCompare(a.dueMonth));
}

/**
 * Returns unpaid installments for a user due within the next N days, ordered by dueDate ascending.
 *
 * @param {string} telegramUserId - User's Telegram ID
 * @param {number} daysAhead - Number of days to look ahead from today
 * @return {ServiceInstallment[]} Matching installments sorted by dueDate
 */
export async function getUpcomingUnpaidInstallments(
  telegramUserId: string,
  daysAhead: number
): Promise<ServiceInstallment[]> {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const futureDate = new Date(now);
  futureDate.setDate(futureDate.getDate() + daysAhead);

  const snapshot = await getDb()
    .collection("service_installments")
    .where("telegramUserId", "==", telegramUserId)
    .where("isPaid", "==", false)
    .where("dueDate", ">=", admin.firestore.Timestamp.fromDate(now))
    .where("dueDate", "<=", admin.firestore.Timestamp.fromDate(futureDate))
    .orderBy("dueDate", "asc")
    .get();

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Omit<ServiceInstallment, "id">),
  }));
}

export async function getInstallmentsForMonth(
  telegramUserId: string,
  dueMonth: string
): Promise<ServiceInstallment[]> {
  const snapshot = await getDb()
    .collection("service_installments")
    .where("telegramUserId", "==", telegramUserId)
    .where("dueMonth", "==", dueMonth)
    .orderBy("serviceName", "asc")
    .get();

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Omit<ServiceInstallment, "id">),
  }));
}
