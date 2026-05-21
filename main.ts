// main.ts
import "@std/dotenv/load";
import { approveTask, requestPermission } from "./core/async_permissions.ts";
import { route } from "./core/router.ts";
import { initDB, addMessage, getHistory } from "./core/memory.ts";
import { loadConfig, saveConfig, getConfigDir } from "./config/user_prefs.ts";
import { sendWhatsAppMessage, downloadWhatsAppMedia } from "./core/whatsapp.ts";
import { sendTelegramMessage, downloadTelegramMedia } from "./core/telegram.ts";
import { execute_mutation_payload } from "./core/supabase.ts";
import { uploadFileToDrive, moveDriveFile } from "./core/drive.ts";
import { execute_send_email_payload } from "./tools/integrations/gmail.ts";

import { Input, Select } from "@cliffy/prompt";
import { addNewGmailAccount } from "./utils/google_oauth.ts";
import { resolveBrandAndCategory, resolveCatalogModel } from "./core/supabase_inventory.ts";
import { getSupabaseClient } from "./core/supabase.ts";

const WHATSAPP_VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") || "teltronic_secreto_123";
const PORT = parseInt(Deno.env.get("PORT") || "8000");

// ==========================================
// MODO SETUP (jean setup)
// ==========================================
if (Deno.args[0] === "setup") {
  console.log("🛠️  Configuración de Jean CRM Agent");
  try {
    let config = await loadConfig();
    let running = true;

    while (running) {
      console.clear();
      console.log("=== JEAN CRM SETUP MENU ===");
      const mainOption = await Select.prompt({
        message: "Selecciona una categoría para configurar:",
        options: [
          { name: "1. Modelos de Lenguaje (OpenAI, Gemini, Claude, etc.)", value: "llm" },
          { name: "2. WhatsApp API (Meta)", value: "whatsapp" },
          { name: "3. Telegram API", value: "telegram" },
          { name: "4. Base de Datos (Supabase)", value: "supabase" },
          { name: "5. Configuración de Gmail (Múltiples cuentas)", value: "gmail" },
          { name: "6. Guardar y Salir", value: "exit" }
        ],
      });

      if (mainOption === "exit") {
        running = false;
        break;
      }

      switch (mainOption) {
        case "llm":
          config.apiKey = await Input.prompt({ message: "OpenAI API Key:", default: config.apiKey || "" });
          config.openrouterKey = await Input.prompt({ message: "OpenRouter API Key:", default: config.openrouterKey || "" });
          config.geminiKey = await Input.prompt({ message: "Gemini API Key:", default: config.geminiKey || "" });
          config.claudeKey = await Input.prompt({ message: "Anthropic API Key:", default: config.claudeKey || "" });
          await saveConfig(config);
          break;
        case "whatsapp":
          config.waPhoneNumberId = await Input.prompt({ message: "WhatsApp Phone Number ID:", default: config.waPhoneNumberId || "" });
          config.waAccessToken = await Input.prompt({ message: "WhatsApp Access Token:", default: config.waAccessToken || "" });
          config.waVerifyToken = await Input.prompt({ message: "WhatsApp Verify Token:", default: config.waVerifyToken || "teltronic_secreto_123" });
          await saveConfig(config);
          break;
        case "telegram": {
          config.telegramBotToken = await Input.prompt({ message: "Telegram Bot Access Token:", default: config.telegramBotToken || "" });
          const wlInput = await Input.prompt({ 
            message: "Chat IDs autorizados (separados por coma, deja vacío para bloquear a todos):", 
            default: (config.telegramWhitelist || []).join(",") 
          });
          config.telegramWhitelist = wlInput.split(",").map(id => id.trim()).filter(id => id.length > 0);
          await saveConfig(config);
          break;
        }
        case "supabase":
          config.supabaseUrl = await Input.prompt({ message: "Supabase Project URL:", default: config.supabaseUrl || "" });
          config.supabaseServiceKey = await Input.prompt({ message: "Supabase Service Role Key (Bypass RLS):", default: config.supabaseServiceKey || "" });
          await saveConfig(config);
          break;
        case "gmail": {
          let gmailRunning = true;
          while (gmailRunning) {
            console.clear();
            console.log("=== CONFIGURACIÓN DE GMAIL ===");
            
            // Primero pedimos el Client ID global si no existe
            if (!config.gmailClientId || !config.gmailClientSecret) {
              console.log("⚠️  Necesitas configurar el OAuth Client ID de Google Cloud primero.");
              config.gmailClientId = await Input.prompt({ message: "Gmail Client ID:", default: config.gmailClientId || "" });
              config.gmailClientSecret = await Input.prompt({ message: "Gmail Client Secret:", default: config.gmailClientSecret || "" });
              await saveConfig(config);
            }

            const accounts = config.gmailAccounts || [];
            const gmailOptions = accounts.map((acc, index) => ({
              name: `Cuenta ${index + 1}: ${acc.email} (Haz clic para eliminar)`,
              value: `del_${index}`
            }));
            
            gmailOptions.push({ name: "+ Agregar otra cuenta Gmail (OAuth Personal)", value: "add" });
            gmailOptions.push({ name: "⚙️  Configurar Service Account (Para Workspace y Drive)", value: "service_acc" });
            gmailOptions.push({ name: "<- Volver al menú principal", value: "back" });

            const gOption = await Select.prompt({
              message: "Gestión de cuentas y Drive:",
              options: gmailOptions,
            });

            if (gOption === "back") {
              gmailRunning = false;
            } else if (gOption === "add") {
              const success = await addNewGmailAccount();
              if (success) {
                config = await loadConfig(); // recargar
              }
            } else if (gOption === "service_acc") {
              console.log("\n🔑 Configuración de Cuenta de Servicio (Backend Robot)");
              config.serviceAccountPath = await Input.prompt({ message: "Ruta absoluta al service_account.json:", default: config.serviceAccountPath || "" });
              config.workspaceEmail = await Input.prompt({ message: "Email corporativo a suplantar (admin@...):", default: config.workspaceEmail || "" });
              await saveConfig(config);
              console.log("✅ Service Account configurado.");
            } else if (gOption.startsWith("del_")) {
              const index = parseInt(gOption.split("_")[1]);
              accounts.splice(index, 1);
              config.gmailAccounts = accounts;
              await saveConfig(config);
            }
          }
          break;
        }
      }
    }
    
    console.log("✅ Configuración guardada exitosamente en ~/.jean/config.json");
    console.log("💡 Ahora puedes ejecutar 'jean' para levantar el servidor Webhook.");
  } catch (error) {
    console.error("❌ Error en el setup:", error);
  }
  Deno.exit(0);
}

// Inicializar la base de datos de historial de SQLite
initDB();

const handler = async (request: Request): Promise<Response> => {
  const url = new URL(request.url);

  // ==========================================
  // 1. RUTAS DINÁMICAS (MICROFRONTENDS / APPs)
  // ==========================================
  if (request.method === "GET" && url.pathname.startsWith("/app/")) {
    const viewId = url.pathname.split("/")[2];
    const configDir = getConfigDir();
    const viewPath = `${configDir}/views/${viewId}.html`;
    
    try {
      const htmlContent = await Deno.readTextFile(viewPath);
      return new Response(htmlContent, {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    } catch (_err) {
      return new Response("Vista no encontrada o expirada.", { status: 404 });
    }
  }

  // ==========================================
  // 1.1 RUTAS PARA DOCUMENTOS PDF (MOCK HTML)
  // ==========================================
  if (request.method === "GET" && url.pathname.startsWith("/docs/")) {
    const docId = url.pathname.split("/")[2];
    const configDir = getConfigDir();
    const docPath = `${configDir}/views/docs/${docId}.html`;
    
    try {
      const htmlContent = await Deno.readTextFile(docPath);
      return new Response(htmlContent, {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    } catch (_err) {
      return new Response("Documento no encontrado o ha expirado.", { status: 404 });
    }
  }

  // ==========================================
  // 2. VERIFICACIÓN DE WHATSAPP META API
  // ==========================================
  if (request.method === "GET" && url.pathname === "/webhook") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    try {
      const config = await loadConfig();
      const verifyToken = config.waVerifyToken || WHATSAPP_VERIFY_TOKEN;

      if (mode === "subscribe" && token === verifyToken) {
        console.log("✅ ¡Webhook verificado por Meta!");
        return new Response(challenge || "", { status: 200 });
      }
    } catch (e) {
      console.error("Error al cargar config para verificar webhook", e);
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

        if (message) {
          const numeroUsuario = message.from;
          let textoUsuario = "";
          let isInteractive = false;
          let buttonPayload = "";

          if (message.type === "text") {
            textoUsuario = message.text.body.trim();
          } else if (message.type === "interactive" && message.interactive.type === "button_reply") {
            isInteractive = true;
            textoUsuario = message.interactive.button_reply.title;
            buttonPayload = message.interactive.button_reply.id;
          } else if (message.type === "image") {
            console.log("📸 Imagen detectada en WhatsApp, procesando subida a Drive...");
            const mediaId = message.image.id;
            try {
               const media = await downloadWhatsAppMedia(mediaId);
               if (media) {
                  const driveData = await uploadFileToDrive(`whatsapp_img_${Date.now()}.jpg`, media.mimeType, media.buffer);
                  textoUsuario = `[SYSTEM] El usuario acaba de enviar una imagen por WhatsApp. Ya la he descargado y guardado en Google Drive en este enlace: ${driveData.url}`;
               } else {
                  textoUsuario = `[SYSTEM] El usuario envió una imagen, pero hubo un error descargándola.`;
               }
            } catch (e) {
               console.error("Error guardando imagen en drive:", e);
               textoUsuario = `[SYSTEM] El usuario envió una imagen, pero hubo un error subiéndola a Drive.`;
            }
          } else {
             // Ignorar otros tipos de mensaje
             return new Response("OK", { status: 200 });
          }

          console.log(`\n💬 Mensaje de ${numeroUsuario}: "${textoUsuario}"`);

          // 3.1 INTERCEPCIÓN DE ADMINISTRADOR (Aprobaciones asíncronas de Tareas)
          if (isInteractive && buttonPayload) {
             const taskId = buttonPayload;
             const task = await approveTask(taskId);
             if (task) {
                 console.log(`✅ [HITL] Tarea ${taskId} aprobada por el Admin.`);
                 console.log(`⚙️ Ejecutando payload pendiente...`);
                 
                 // Aplicar el cambio real en la Base de Datos si es una tarea de Supabase nativa
                 if (task.context && task.context.action && task.context.table) {
                    const success = await execute_mutation_payload(task.context);
                    if (success) {
                       await sendWhatsAppMessage(numeroUsuario, "✅ Mutación en base de datos ejecutada exitosamente tras tu aprobación.");
                    } else {
                       await sendWhatsAppMessage(numeroUsuario, "❌ La tarea fue aprobada pero ocurrió un error al inyectar los datos a Supabase.");
                    }
                 } 
                 // Aplicar envío de correo si es una tarea de Gmail
                 else if (task.context && task.context.action === "send_email") {
                    const success = await execute_send_email_payload(task.context);
                    if (success) {
                       await sendWhatsAppMessage(numeroUsuario, "✅ Correo electrónico enviado exitosamente tras tu aprobación.");
                    } else {
                       await sendWhatsAppMessage(numeroUsuario, "❌ La tarea fue aprobada pero ocurrió un error al enviar el correo vía Gmail.");
                    }
                 }
                 else {
                    // Otras tareas pendientes
                    await sendWhatsAppMessage(numeroUsuario, "✅ Comando ejecutado exitosamente tras tu aprobación.");
                 }
              } else {
                 await sendWhatsAppMessage(numeroUsuario, "❌ Tarea no encontrada o ya expiró.");
              }
           }
          else if (textoUsuario.toUpperCase().startsWith("APROBAR ")) {
            const taskId = textoUsuario.split(" ")[1];
            if (taskId) {
              const task = await approveTask(taskId);
              if (task) {
                console.log(`✅ [HITL] Tarea ${taskId} aprobada por el Admin.`);
                await sendWhatsAppMessage(numeroUsuario, "✅ Comando ejecutado exitosamente tras tu aprobación.");
              } else {
                await sendWhatsAppMessage(numeroUsuario, "❌ Tarea no encontrada o ya expiró.");
              }
            }
          } 
          // 3.2 FLUJO NORMAL: Enrutador Semántico de Jean
          else {
            console.log(`🤖 Enrutador analizando petición...`);
            const sessionId = numeroUsuario;
            
            if (textoUsuario.toLowerCase().includes("borrar") || textoUsuario.toLowerCase().includes("peligroso")) {
               const taskId = await requestPermission("DB_ADMIN_AGENT", `Usuario solicitó: "${textoUsuario}"`, { action: "drop_tables" }, numeroUsuario);
               await sendWhatsAppMessage(numeroUsuario, `He pausado esta acción por seguridad. He notificado al Administrador. ID: ${taskId}`);
            } else {
               try {
                  const config = await loadConfig();
                  if (config.apiKey) Deno.env.set("OPENAI_API_KEY", config.apiKey);
                  
                  addMessage(sessionId, { role: "user", content: textoUsuario });
                  const history = getHistory(sessionId);
                  
                  const respuestaAgente = await route(textoUsuario, sessionId, history);
                  console.log(`🤖 WhatsApp Outbound -> Generado, enviando vía API...`);
                  await sendWhatsAppMessage(numeroUsuario, respuestaAgente);
               } catch (e) {
                  await sendWhatsAppMessage(numeroUsuario, `Lo siento, ocurrió un error procesando tu solicitud: ${e}`);
               }
            }
          }
        }
      }

      // 200 OK rápido para Meta
      return new Response("OK", { status: 200 });

    } catch (error) {
      console.error("Error procesando el webhook de WhatsApp:", error);
      return new Response("Error interno", { status: 500 });
    }
  }

  // ==========================================
  // 4. RECIBIR MENSAJES DE TELEGRAM (POST Webhook)
  // ==========================================
  if (request.method === "POST" && url.pathname === "/webhook/telegram") {
    try {
      const update = await request.json();

      // 4.1 Manejar Botones (Callback Queries)
      if (update.callback_query) {
        const callbackQuery = update.callback_query;
        const data = callbackQuery.data;
        const chatId = callbackQuery.message.chat.id.toString();

        if (data.startsWith("reject_")) {
          // Lógica de rechazo de documento
          await sendTelegramMessage(chatId, "❌ Borrador rechazado y descartado. ¿Qué datos deseas corregir para generar uno nuevo?");
        } else {
          // Lógica de aprobación (HITL)
          const taskId = data;
          const task = await approveTask(taskId);
          
          if (task) {
            console.log(`✅ [HITL Telegram] Tarea ${taskId} aprobada.`);
            
            // Retrocompatibilidad con la antigua propiedad 'context'
            const payload: any = task.commandPayload || (task as any).context;
            
            if (payload && payload.action === "save_document") {
              try {
                await moveDriveFile(payload.fileId, payload.newFolderId);
                if (payload.table) {
                  await execute_mutation_payload(payload);
                }
                await sendTelegramMessage(chatId, "✅ Documento oficializado correctamente y movido a su carpeta final.");
              } catch (e) {
                await sendTelegramMessage(chatId, `❌ Error al oficializar el documento: ${e}`);
              }
            } else if (payload && payload.action) {
              try {
                console.log(`⚙️ Ejecutando herramienta asíncrona: ${payload.action}`);
                const { dispatchTool } = await import("./tools/registry.ts");
                const toolArgs = payload.payload || payload;
                const result = await dispatchTool(payload.action, JSON.stringify(toolArgs));
                await sendTelegramMessage(chatId, `✅ Acción ejecutada exitosamente.\n\nResultado:\n${result}`);
              } catch (e) {
                await sendTelegramMessage(chatId, `❌ Error crítico al ejecutar la acción: ${e}`);
              }
            } else {
              await sendTelegramMessage(chatId, "✅ Acción aprobada (sin comandos ejecutables adjuntos).");
            }
          } else {
            await sendTelegramMessage(chatId, "❌ La tarea ya expiró o no existe.");
          }
        }
        return new Response("OK", { status: 200 });
      }

      // 4.2 Manejar Mensajes (Texto o Fotos)
      const message = update.message;
      if (message) {
        const chatId = message.chat.id.toString();
        
        // --- INICIO DE VALIDACIÓN DE WHITELIST ---
        const config = await loadConfig();
        const whitelist = config.telegramWhitelist || [];
        
        // Si la lista está vacía (bloqueo total por defecto) o el ID no está en la lista
        if (whitelist.length === 0 || !whitelist.includes(chatId)) {
          console.warn(`[TELEGRAM SECURITY] Acceso denegado al Chat ID: ${chatId}`);
          await sendTelegramMessage(chatId, `❌ **Acceso Denegado**\n\nTu Chat ID es \`${chatId}\`.\nNo estás autorizado para interactuar con este bot corporativo.\n\nComunícate con el Administrador para que te añada a la lista blanca.`);
          return new Response("OK", { status: 200 }); // Retornar 200 para que Telegram no reintente
        }
        // --- FIN DE VALIDACIÓN ---

        let textoUsuario = "";

        if (message.text) {
          textoUsuario = message.text.trim();
        } else if (message.photo && message.photo.length > 0) {
          // Telegram envía varios tamaños, tomamos el último (mayor resolución)
          const photo = message.photo[message.photo.length - 1];
          const fileId = photo.file_id;
          console.log("📸 Imagen detectada en Telegram, procesando...");
          
          try {
            const media = await downloadTelegramMedia(fileId);
            if (media) {
              const driveData = await uploadFileToDrive(`telegram_img_${Date.now()}.jpg`, media.mimeType, media.buffer);
              textoUsuario = `[SYSTEM] El usuario acaba de enviar una imagen por Telegram. Ya la he descargado y guardado en Google Drive temporalmente. Enlace: ${driveData.url}. ID: ${driveData.id}`;
            } else {
              textoUsuario = `[SYSTEM] Error descargando imagen de Telegram.`;
            }
          } catch (e) {
            textoUsuario = `[SYSTEM] Error subiendo imagen a Drive: ${e}`;
          }
        }

        if (textoUsuario) {
          console.log(`\n💬 [Telegram] Mensaje de ${chatId}: "${textoUsuario}"`);
          
          try {
            const config = await loadConfig();
            if (config.apiKey) Deno.env.set("OPENAI_API_KEY", config.apiKey);

            const sessionId = `telegram_${chatId}`;
            addMessage(sessionId, { role: "user", content: textoUsuario });
            const history = getHistory(sessionId);

            const respuestaAgente = await route(textoUsuario, sessionId, history);
            await sendTelegramMessage(chatId, respuestaAgente);
          } catch (e) {
            console.error("Error en router para Telegram:", e);
            await sendTelegramMessage(chatId, `Lo siento, ocurrió un error procesando tu solicitud: ${e}`);
          }
        }
      }

      return new Response("OK", { status: 200 });
    } catch (error) {
      console.error("Error procesando el webhook de Telegram:", error);
      return new Response("Error interno", { status: 500 });
    }
  }

  // ==========================================
  // 5. API INTERNA PARA MICROFRONTENDS
  // ==========================================
  if (request.method === "POST" && url.pathname === "/api/inventory/add") {
    try {
      const data = await request.json();
      
      const { brandId, categoryId } = await resolveBrandAndCategory(data.brandName, data.categoryName);
      const catalogId = await resolveCatalogModel(brandId, categoryId, data.brandName, data.modelName);
      
      const supabase = await getSupabaseClient();
      const { error } = await supabase.from("unidades_inventario").insert({
        catalogo_id: catalogId,
        numero_serie: data.serialNumber,
        precio_compra: data.buyPrice,
        precio_venta: data.sellPrice,
        condicion: data.condition || "Nuevo",
        comentarios: data.comments || ""
      });

      if (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), { status: 400, headers: { "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { "Content-Type": "application/json" } });
    } catch (e) {
      return new Response(JSON.stringify({ success: false, error: String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
  }

  // Ruta raíz fallback
  return new Response("Jean CRM Webhook Activo. Endpoints: /webhook (WhatsApp), /webhook/telegram (Telegram), /api/inventory/add (POST)", { status: 200 });
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
