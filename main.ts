// main.ts
import { approveTask, requestPermission } from "./core/async_permissions.ts";
import { route } from "./core/router.ts";
import { initDB, addMessage, getHistory } from "./core/memory.ts";
import { loadConfig } from "./config/user_prefs.ts";

const WHATSAPP_VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") || "teltronic_secreto_123";
const PORT = parseInt(Deno.env.get("PORT") || "8000");

// Inicializar la base de datos de historial de SQLite
initDB();

const handler = async (request: Request): Promise<Response> => {
  const url = new URL(request.url);

  // ==========================================
  // 1. RUTAS DINÁMICAS (MICROFRONTENDS / APPs)
  // ==========================================
  if (request.method === "GET" && url.pathname.startsWith("/app/")) {
    const sessionId = url.pathname.split("/")[2];
    
    // HTML temporal inyectado con Tailwind vía CDN (Reutilizaremos los de teltronic-frontend después)
    const html = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>CRM App - Revisión de Tarea ${sessionId}</title>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body class="bg-slate-50 flex items-center justify-center h-screen">
        <div class="bg-white p-8 rounded-xl shadow-lg text-center max-w-sm w-full">
          <div class="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
             <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
          </div>
          <h1 class="text-2xl font-bold text-slate-800 mb-2">Aprobación Pendiente</h1>
          <p class="text-slate-500 mb-6">Tarea ID: <span class="font-mono text-slate-700 bg-slate-100 px-2 py-1 rounded">${sessionId}</span></p>
          <button class="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors">
            Aprobar Ejecución
          </button>
        </div>
      </body>
      </html>
    `;
    
    return new Response(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // ==========================================
  // 2. VERIFICACIÓN DE WHATSAPP META API
  // ==========================================
  if (request.method === "GET" && url.pathname === "/webhook") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token === WHATSAPP_VERIFY_TOKEN) {
      console.log("✅ ¡Webhook verificado por Meta!");
      return new Response(challenge || "", { status: 200 });
    }
    return new Response("Prohibido", { status: 403 });
  }

  // ==========================================
  // 3. RECIBIR MENSAJES DE USUARIOS (POST Webhook)
  // ==========================================
  if (request.method === "POST" && url.pathname === "/webhook") {
    try {
      const body = await request.json();

      if (body.object === "whatsapp_business_account") {
        const entry = body.entry?.[0];
        const changes = entry?.changes?.[0];
        const message = changes?.value?.messages?.[0];

        if (message && message.type === "text") {
          const numeroUsuario = message.from;
          const textoUsuario = message.text.body.trim();

          console.log(`\n💬 Mensaje de ${numeroUsuario}: "${textoUsuario}"`);

          // 3.1 INTERCEPCIÓN DE ADMINISTRADOR (Aprobaciones asíncronas de Tareas)
          if (textoUsuario.toUpperCase().startsWith("APROBAR ")) {
            const taskId = textoUsuario.split(" ")[1];
            if (taskId) {
              const task = await approveTask(taskId);
              if (task) {
                console.log(`✅ [HITL] Tarea ${taskId} aprobada por el Admin.`);
                console.log(`⚙️ Ejecutando payload pendiente...`);
                // AQUÍ: Despachar el payload al CRM Agent para que lo aplique en DB
                
                // Responder via WhatsApp (Mock)
                console.log(`🤖 WhatsApp Outbound -> "Comando ejecutado exitosamente tras aprobación."`);
              } else {
                console.log(`❌ [HITL] Tarea ${taskId} no encontrada o ya expiró.`);
              }
            }
          } 
          // 3.2 FLUJO NORMAL: Enrutador Semántico de Jean
          else {
            console.log(`🤖 Enrutador analizando petición...`);
            
            // Usamos el número de WhatsApp como sessionId para mantener el contexto
            const sessionId = numeroUsuario;
            
            // Si simulamos una petición destructiva manual:
            if (textoUsuario.toLowerCase().includes("borrar") || textoUsuario.toLowerCase().includes("peligroso")) {
               const taskId = await requestPermission("DB_ADMIN_AGENT", `Usuario solicitó: "${textoUsuario}"`, { action: "drop_tables" });
               console.log(`🤖 WhatsApp Outbound -> "He pausado esta acción por seguridad. He notificado al Administrador. ID: ${taskId}"`);
            } else {
               // Conectar con el core/router de Jean real
               try {
                  const config = await loadConfig();
                  if (config.apiKey) Deno.env.set("OPENAI_API_KEY", config.apiKey);
                  
                  // Agregamos el mensaje del usuario a SQLite
                  addMessage(sessionId, { role: "user", content: textoUsuario });
                  const history = getHistory(sessionId);
                  
                  // Despachamos al enrutador original
                  const respuestaAgente = await route(textoUsuario, sessionId, history);
                  console.log(`🤖 WhatsApp Outbound -> "${respuestaAgente}"`);
               } catch (e) {
                  console.log(`🤖 WhatsApp Outbound -> "Lo siento, ocurrió un error procesando tu solicitud: ${e}"`);
               }
            }
          }
        }
      }

      // 200 OK rápido para Meta
      return new Response("OK", { status: 200 });

    } catch (error) {
      console.error("Error procesando el webhook:", error);
      return new Response("Error interno", { status: 500 });
    }
  }

  // Ruta raíz fallback
  return new Response("Jean CRM Webhook Activo. Endpoint: /webhook", { status: 200 });
};

// Cargar variables de entorno iniciales para los modelos LLM
try {
  const config = await loadConfig();
  if (config.apiKey) Deno.env.set("OPENAI_API_KEY", config.apiKey);
} catch (e) {
  // Config no generada aún, ignorar
}

console.log(`🚀 Servidor CRM Webhook escuchando en http://localhost:${PORT}`);
Deno.serve({ port: PORT }, handler);
