import { getActiveProfile } from "../config/ai_profiles.ts";
import { loadConfig } from "../config/user_prefs.ts";
import { dispatchTool } from "../tools/registry.ts";
import { addMessage } from "./memory.ts";
import { CodieSpinner } from "../utils/ui.ts";
import { buildAnthropicPayload, parseAnthropicResponse } from "./anthropic_adapter.ts";

export interface ToolCall {
  id: string;
  type: string;
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export async function chat(
  sessionId: string, 
  messages: ChatMessage[], 
  tools: any[], 
  agentSystemPrompt: string,
  maxSteps: number = 5
): Promise<string> {
  if (maxSteps <= 0) {
    return "He superado el límite máximo de iteraciones (5) intentando resolver este problema y me he atascado. Por favor, revisa mi historial y dame nuevas instrucciones o aborda el problema de otra manera.";
  }

  const profile = await getActiveProfile();
  const apiKey = Deno.env.get(profile.apiKeyEnvVar) || "";

  let payload: any;
  const headers: any = { "Content-Type": "application/json" };
  const endpoint = profile.protocol === "anthropic" ? profile.baseURL : `${profile.baseURL}/chat/completions`;

  const payloadMessages: ChatMessage[] = [
    { role: "system", content: agentSystemPrompt },
    ...messages
  ];

  if (profile.protocol === "anthropic") {
    payload = buildAnthropicPayload(profile.model, messages, tools, agentSystemPrompt);
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
  } else {
    payload = {
      model: profile.model,
      messages: payloadMessages,
      temperature: 0.7
    };
    if (tools && tools.length > 0) {
      payload.tools = tools.map((t: any) => ({
        type: t.type,
        function: {
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters
        }
      }));
      payload.tool_choice = "auto";
    }
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Error del LLM (${response.status}): ${errorData}`);
  }

  const data = await response.json();
  let responseMessage: ChatMessage;

  if (profile.protocol === "anthropic") {
    responseMessage = parseAnthropicResponse(data);
  } else {
    const choice = data.choices[0];
    responseMessage = choice.message as ChatMessage;
  }
  
  // Guardar respuesta inicial del asistente (con content o tool_calls)
  addMessage(sessionId, responseMessage);

  if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
    payloadMessages.push(responseMessage);

    const { isToolSafe } = await import("../tools/registry.ts");
    
    const safeTools: ToolCall[] = [];
    const unsafeTools: ToolCall[] = [];
    
    for (const toolCall of responseMessage.tool_calls) {
      if (isToolSafe(toolCall.function.name)) {
        safeTools.push(toolCall);
      } else {
        unsafeTools.push(toolCall);
      }
    }
    
    const resultsMap = new Map<string, string>();
    
    // 1. Ejecutar herramientas seguras inmediatamente
    for (const toolCall of safeTools) {
      CodieSpinner.stop();
      try {
        const result = await dispatchTool(toolCall.function.name, toolCall.function.arguments);
        resultsMap.set(toolCall.id, result);
      } catch (err) {
        resultsMap.set(toolCall.id, `Error crítico de ejecución: ${err instanceof Error ? err.message : String(err)}`);
      }
      CodieSpinner.start("Re-analizando resultados...");
    }
    
    // 2. Interceptar y solicitar aprobación para herramientas inseguras
    if (unsafeTools.length > 0) {
      CodieSpinner.stop();
      
      const isCli = sessionId === "CLI" || sessionId === "local";
      
      if (isCli) {
        const { requestUserApproval } = await import("./permission_queue.ts");
        const isApproved = await requestUserApproval(unsafeTools);
        
        if (isApproved) {
          for (const toolCall of unsafeTools) {
            try {
              const result = await dispatchTool(toolCall.function.name, toolCall.function.arguments);
              resultsMap.set(toolCall.id, result);
            } catch (err) {
              resultsMap.set(toolCall.id, `Error crítico de ejecución: ${err instanceof Error ? err.message : String(err)}`);
            }
          }
        } else {
          for (const toolCall of unsafeTools) {
            resultsMap.set(toolCall.id, "El usuario ha denegado el permiso para ejecutar esta acción.");
          }
        }
      } else {
        // Modo Webhook (Telegram/WhatsApp)
        const { requestPermission } = await import("./async_permissions.ts");
        for (const toolCall of unsafeTools) {
          try {
            const taskId = await requestPermission("CRM_AGENT", `Ejecutar herramienta: ${toolCall.function.name}`, { action: toolCall.function.name, payload: JSON.parse(toolCall.function.arguments) }, sessionId);
            resultsMap.set(toolCall.id, `¡ATENCIÓN! La tarea '${toolCall.function.name}' fue bloqueada por seguridad. Se ha enviado una solicitud interactiva al administrador (ID: ${taskId}). Dile al usuario que revise sus mensajes y apruebe la acción mediante el botón interactivo que acaba de recibir.`);
          } catch (e) {
            resultsMap.set(toolCall.id, `Error solicitando permiso asíncrono: ${e}`);
          }
        }
      }
      CodieSpinner.start("Re-analizando resultados...");
    }

    // 3. Empaquetar resultados en el orden original
    for (const toolCall of responseMessage.tool_calls) {
      const toolMsg: ChatMessage = {
        role: "tool",
        content: resultsMap.get(toolCall.id) || "",
        tool_call_id: toolCall.id,
        name: toolCall.function.name
      };
      
      addMessage(sessionId, toolMsg);
      payloadMessages.push(toolMsg);
    }
    
    // Llamada recursiva con los mensajes actualizados sin duplicar el system
    const updatedMessages = payloadMessages.slice(1);
    return await chat(sessionId, updatedMessages, tools, agentSystemPrompt, maxSteps - 1);
  }

  return responseMessage.content ?? "";
}

export async function oneShotChat(
  profileId: string,
  systemPrompt: string,
  userInput: string
): Promise<string> {
  const { getProfiles } = await import("../config/ai_profiles.ts");
  const profiles = await getProfiles();
  const profile = profiles[profileId];

  if (!profile) {
    throw new Error(`El perfil '${profileId}' no existe en la configuración.`);
  }

  const apiKey = Deno.env.get(profile.apiKeyEnvVar) || "";
  let payload: any;
  const headers: any = { "Content-Type": "application/json" };
  const endpoint = profile.protocol === "anthropic" ? profile.baseURL : `${profile.baseURL}/chat/completions`;

  const messages: ChatMessage[] = [
    { role: "user", content: userInput }
  ];

  if (profile.protocol === "anthropic") {
    payload = buildAnthropicPayload(profile.model, messages, [], systemPrompt);
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
  } else {
    payload = {
      model: profile.model,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages
      ],
      temperature: 0.7
    };
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Error del Sub-Agente (${response.status}): ${errorData}`);
  }

  const data = await response.json();
  
  if (profile.protocol === "anthropic") {
    const responseMessage = parseAnthropicResponse(data);
    return responseMessage.content ?? "";
  } else {
    const choice = data.choices[0];
    return choice.message.content ?? "";
  }
}
