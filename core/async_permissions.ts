// core/async_permissions.ts

export interface PendingTask {
  id: string;
  agent: string;
  description: string;
  commandPayload: unknown;
  status: "pending" | "approved" | "rejected";
  timestamp: number;
}

const KV_PATH = "./crm_knowledge.db";

// Función "Mock" para simular el envío de WhatsApp a un administrador
async function mockSendWhatsAppToAdmin(taskId: string, description: string) {
  console.log("\n=======================================================");
  console.log(`📱 [MOCK WHATSAPP MESSAGE TO ADMIN]`);
  console.log(`⚠️ Solicitud de cambio bloqueada por el Escudo Humano Asíncrono:`);
  console.log(`Descripción: "${description}"`);
  console.log(`Para APROBAR esta tarea, responde en WhatsApp exactamente con:`);
  console.log(`APROBAR ${taskId}`);
  console.log(`O haz clic aquí para revisar el código en el navegador móvil: http://localhost:8000/app/${taskId}`);
  console.log("=======================================================\n");
}

/**
 * Registra una tarea peligrosa en Deno KV y la deja en estado 'pending'.
 * Luego envía una notificación asíncrona al admin vía WhatsApp.
 */
export async function requestPermission(
  agent: string,
  description: string,
  commandPayload: unknown
): Promise<string> {
  const kv = await Deno.openKv(KV_PATH);
  
  // Generar un ID corto y amigable (ej. de 6 caracteres)
  const taskId = Math.random().toString(36).substring(2, 8).toUpperCase();
  
  const task: PendingTask = {
    id: taskId,
    agent,
    description,
    commandPayload,
    status: "pending",
    timestamp: Date.now(),
  };

  const key = ["pending_tasks", taskId];
  await kv.set(key, task);
  kv.close();

  // Enviar alerta asíncrona
  await mockSendWhatsAppToAdmin(taskId, description);

  return taskId;
}

/**
 * Aprueba una tarea pendiente, recuperando el payload original
 * y eliminándola o marcándola como completada en KV.
 */
export async function approveTask(taskId: string): Promise<PendingTask | null> {
  const kv = await Deno.openKv(KV_PATH);
  const key = ["pending_tasks", taskId];
  
  const record = await kv.get<PendingTask>(key);
  if (!record.value) {
    kv.close();
    return null;
  }

  const task = record.value;
  task.status = "approved";
  
  // Actualizamos el registro (o podríamos borrarlo directamente para limpiar memoria)
  await kv.delete(key);
  kv.close();

  return task;
}

/**
 * Rechaza una tarea pendiente y limpia el registro.
 */
export async function rejectTask(taskId: string): Promise<boolean> {
  const kv = await Deno.openKv(KV_PATH);
  const key = ["pending_tasks", taskId];
  
  const record = await kv.get<PendingTask>(key);
  if (!record.value) {
    kv.close();
    return false;
  }

  await kv.delete(key);
  kv.close();
  return true;
}
