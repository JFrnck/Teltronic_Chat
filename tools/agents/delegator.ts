import { oneShotChat } from "../../core/llm_client.ts";
import { CodieSpinner } from "../../utils/ui.ts";

export async function delegate_task(
  task_description: string,
  input_context: string,
  ai_profile: string
): Promise<string> {
  const systemPrompt = `Eres un sub-agente delegado por Jean (el Orquestador principal).
Tu única función es ejecutar la siguiente tarea analítica/generativa de manera estricta:
[TAREA]
${task_description}

Procesa el input del usuario siguiendo esas directivas, sé directo y no incluyas preámbulos.`;

  CodieSpinner.start(`Delegando subtarea a sub-agente [${ai_profile}]...`);
  
  try {
    const result = await oneShotChat(ai_profile, systemPrompt, input_context);
    return `Resultado del sub-agente (${ai_profile}):\n\n${result}`;
  } catch (error) {
    return `Error durante la delegación al perfil ${ai_profile}: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    CodieSpinner.stop();
  }
}
