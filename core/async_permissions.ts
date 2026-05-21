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

import { sendWhatsAppInteractiveButton } from "./whatsapp.ts";

async function notifyAdminAsync(taskId: string, description: string, adminNumber: string) {
  console.log(`\n=======================================================`);
  console.log(`📱 [WHATSAPP OUTBOUND] Notificando al administrador...`);
  console.log(`=======================================================\n`);
  
  const baseUrl = Deno.env.get("PUBLIC_URL") || "https://assistant.teltronicsolutions.com";
  
  await sendWhatsAppInteractiveButton(
    adminNumber,
    `⚠️ *Solicitud de Aprobación*\nSe interceptó una acción que requiere tu permiso:\n\n_${description}_\n\nRevisa los detalles en: ${baseUrl}/app/${taskId}\n\n¿Deseas autorizar la ejecución?`,
    taskId,
    "Aprobar Acción"
  );
}

/**
 * Registra una tarea peligrosa en Deno KV y la deja en estado 'pending'.
 * Luego envía una notificación asíncrona al admin vía WhatsApp.
 */
export async function requestPermission(
  agent: string,
  description: string,
  commandPayload: unknown,
  adminNumber?: string
): Promise<string> {
  const kv = await Deno.openKv(KV_PATH);
  
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

  // Enviar alerta asíncrona real
  if (adminNumber) {
    await notifyAdminAsync(taskId, description, adminNumber);
  } else {
    // Fallback: Si no tenemos número configurado, simulamos el log
    console.log(`\n⚠️ [MOCK] Solicitud bloqueada. Aprobar con: APROBAR ${taskId}\n`);
  }

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
