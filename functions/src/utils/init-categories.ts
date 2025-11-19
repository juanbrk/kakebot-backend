/**
 * Script para inicializar las categorías en Firestore
 * Ejecutar una vez después de configurar Firebase
 */

import * as admin from "firebase-admin";

const categories = [
  // Categorías de Gastos
  {
    id: "tarjetas",
    name: "Tarjetas",
    type: "expense",
    icon: "💳",
    color: "#ef4444",
    isFixed: false,
    subcategories: [
      "Visa Galicia",
      "MasterCard Galicia",
      "Visa Frances",
      "MasterCard Frances",
      "Visa HSBC",
    ],
  },
  {
    id: "servicios",
    name: "Servicios",
    type: "expense",
    icon: "📱",
    color: "#3b82f6",
    isFixed: true,
    subcategories: [
      "Internet",
      "Celular",
      "Streaming",
      "Cable",
      "Expensas",
      "Agua",
      "Gas",
      "Luz",
    ],
  },
  {
    id: "comida",
    name: "Comida",
    type: "expense",
    icon: "🍕",
    color: "#10b981",
    isFixed: false,
    subcategories: [
      "Verdulería",
      "Carnicería",
      "Supermercado",
      "Panadería",
      "Delivery",
    ],
  },
  {
    id: "salud",
    name: "Salud",
    type: "expense",
    icon: "🏥",
    color: "#8b5cf6",
    isFixed: true,
    subcategories: ["Obra Social", "Medicamentos", "Consultas", "Gimnasio"],
  },
  {
    id: "esparcimiento",
    name: "Esparcimiento",
    type: "expense",
    icon: "🎉",
    color: "#f59e0b",
    isFixed: false,
    subcategories: ["Restaurantes", "Cafeterías", "Salidas", "Entretenimiento"],
  },
  {
    id: "limpieza",
    name: "Limpieza",
    type: "expense",
    icon: "🧹",
    color: "#06b6d4",
    isFixed: true,
    subcategories: ["Empleada", "Productos de limpieza"],
  },
  {
    id: "cuidado",
    name: "Cuidado",
    type: "expense",
    icon: "👶",
    color: "#ec4899",
    isFixed: false,
    subcategories: ["Niñera", "Pañales", "Higiene"],
  },
  {
    id: "educacion",
    name: "Educación",
    type: "expense",
    icon: "📚",
    color: "#6366f1",
    isFixed: true,
    subcategories: ["Colegio", "Cursos", "Libros", "Material escolar"],
  },
  {
    id: "transporte",
    name: "Transporte",
    type: "expense",
    icon: "🚗",
    color: "#14b8a6",
    isFixed: false,
    subcategories: ["Combustible", "Uber", "Taxi", "Transporte público", "ITV"],
  },
  {
    id: "impuestos",
    name: "Impuestos",
    type: "expense",
    icon: "📋",
    color: "#64748b",
    isFixed: true,
    subcategories: ["Monotributo", "Automotor", "Inmueble", "Municipal"],
  },
  {
    id: "extra",
    name: "Extra",
    type: "expense",
    icon: "➕",
    color: "#9ca3af",
    isFixed: false,
    subcategories: ["Ropa", "Regalos", "Hogar", "Varios"],
  },

  // Categorías de Ingresos
  {
    id: "sueldo",
    name: "Sueldo",
    type: "income",
    icon: "💼",
    color: "#10b981",
  },
  {
    id: "alquiler",
    name: "Alquiler",
    type: "income",
    icon: "🏠",
    color: "#3b82f6",
  },
  {
    id: "inversiones",
    name: "Inversiones",
    type: "income",
    icon: "📈",
    color: "#8b5cf6",
    subcategories: ["COCOs", "Plazo Fijo", "FCI", "Acciones"],
  },
  {
    id: "venta_dolar",
    name: "Venta Dólar",
    type: "income",
    icon: "💵",
    color: "#10b981",
  },
  {
    id: "trabajos",
    name: "Trabajos",
    type: "income",
    icon: "💻",
    color: "#f59e0b",
    subcategories: ["Freelance", "Proyectos"],
  },
  {
    id: "otros_ingresos",
    name: "Otros",
    type: "income",
    icon: "➕",
    color: "#9ca3af",
  },
];

export async function initializeCategories() {
  const db = admin.firestore();

  console.log("Inicializando categorías...");

  for (const category of categories) {
    try {
      await db.collection("categories").doc(category.id).set({
        ...category,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log(`✓ Categoría "${category.name}" creada`);
    } catch (error) {
      console.error(`✗ Error creando categoría "${category.name}":`, error);
    }
  }

  console.log("\n¡Categorías inicializadas correctamente!");
}

// Si se ejecuta directamente
if (require.main === module) {
  admin.initializeApp();
  initializeCategories()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("Error:", error);
      process.exit(1);
    });
}
