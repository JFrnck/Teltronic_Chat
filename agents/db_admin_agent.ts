import { chat, ChatMessage } from "../core/llm_client.ts";
import { prodTools } from "../tools/registry.ts";
import { getSoul } from "../config/user_prefs.ts";
import { selectPlaybook } from "../utils/playbooks.ts";

export async function executeDbAdminTask(sessionId: string, history: ChatMessage[]): Promise<string> {
  const soul = await getSoul();
  const playbook = await selectPlaybook("prod");
  
  const { getProfiles } = await import("../config/ai_profiles.ts");
  const profiles = await getProfiles();
  const profileKeys = Object.keys(profiles).join(", ");
  
  let systemPrompt = `${soul}\n\n[CONTEXTO ESPECIALIZADO: DB ADMIN AGENT]\nEres un administrador de base de datos de alta seguridad de Teltronic. Tu trabajo es gestionar la base de datos Supabase usando la herramienta executeSupabaseCommand.\n\nDIRECTIVAS ESTRICTAS:\n1. INVESTIGACIÓN PREVIA: Siempre que te pidan crear una tabla o investigar un error, usa la herramienta executeSupabaseCommand con command="db" y args=["dump"] para analizar el esquema actual antes de proponer cambios.\n2. COMANDOS PELIGROSOS: Cuando quieras crear migraciones (command="migration", args=["new", "name"]) o subir esquemas (command="db", args=["push"]), tu petición entrará en cuarentena. Deberás informarle amablemente al administrador por WhatsApp que requiere aprobar con el comando que te regrese la herramienta.\n\n[ORQUESTACIÓN DE SUB-AGENTES]\nTienes a tu disposición los siguientes perfiles de IA para delegar tareas usando delegate_task: [${profileKeys}]. Elige el modelo más barato/rápido para tareas repetitivas o analíticas aisladas (ej. procesar y resumir un texto largo con Gemini) y reserva tu propio poder cognitivo para orquestar la solución principal.`;
  
  if (playbook) {
    systemPrompt += `\n\n[DIRECTIVA DE PLAYBOOK ACTIVA]\n${playbook}`;
  }
  
  return await chat(sessionId, history, prodTools, systemPrompt);
}
