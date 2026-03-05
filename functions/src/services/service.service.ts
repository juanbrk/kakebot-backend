import * as admin from "firebase-admin";
import { getDb } from "./db";
import { Service, ServiceInstallment } from "../types/index";

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

export async function saveInstallment(
  telegramUserId: string,
  serviceId: string,
  serviceName: string,
  amount: number,
  dueDate: Date,
  dueMonth: string
): Promise<string> {
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

export async function updateInstallmentDueDay(
  installmentId: string,
  newDay: number
): Promise<void> {
  const doc = await getDb()
    .collection("service_installments")
    .doc(installmentId)
    .get();

  if (!doc.exists) {
    return;
  }

  const data = doc.data() as ServiceInstallment;
  const currentDueDate = data.dueDate.toDate();
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
