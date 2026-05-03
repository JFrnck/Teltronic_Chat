import { chat, ChatMessage } from "../core/llm_client.ts";
import { coderTools } from "../tools/registry.ts";
import { getSoul } from "../config/user_prefs.ts";
import { selectPlaybook } from "../utils/playbooks.ts";

export async function executeCrmTask(sessionId: string, history: ChatMessage[]): Promise<string> {
  const soul = await getSoul();
  const playbook = await selectPlaybook("dev");
  
  const { getProfiles } = await import("../config/ai_profiles.ts");
  const profiles = await getProfiles();
  const profileKeys = Object.keys(profiles).join(", ");
  
  const { listDocs } = await import("../core/knowledge_base.ts");
  const knownDocs = await listDocs();
  const memoryInfo = knownDocs.length > 0 
    ? `Tu memoria local (KV) contiene las documentaciones de: [${knownDocs.join(", ")}]. Si el usuario solicita usar una tecnología que NO está en esta lista, utiliza la herramienta 'web_search_and_learn' para buscar su documentación oficial, aprenderla y guardarla en KV antes de proceder.`
    : `Tu memoria local (KV) está vacía. Si necesitas documentación de una tecnología nueva, utiliza la herramienta 'web_search_and_learn' para buscarla, aprenderla y guardarla permanentemente.`;

  let systemPrompt = `${soul}\n\n[CONTEXTO ESPECIALIZADO: CRM AGENT]\nEres un especialista en ventas, inventarios y atención al cliente. Utiliza las herramientas disponibles para consultar la base de datos local y ayudar al administrador del CRM o al cliente directamente por WhatsApp.\n\n[MEMORIA A LARGO PLAZO]\n${memoryInfo}\n\n[ORQUESTACIÓN DE SUB-AGENTES]\nTienes a tu disposición los siguientes perfiles de IA para delegar tareas usando delegate_task: [${profileKeys}]. Elige el modelo más barato/rápido para tareas repetitivas o analíticas aisladas (ej. Llama, Gemini) y reserva tu propio poder cognitivo para orquestar la solución principal.`;
  
  if (playbook) {
    systemPrompt += `\n\n[DIRECTIVA DE PLAYBOOK ACTIVA]\n${playbook}`;
  }
  
  return await chat(sessionId, history, coderTools, systemPrompt);
}
