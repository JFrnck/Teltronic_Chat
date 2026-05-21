import { loadConfig } from "../config/user_prefs.ts";

/**
 * Envía un mensaje de texto plano por Telegram usando la API de Bots.
 */
export async function sendTelegramMessage(chatId: string | number, text: string): Promise<boolean> {
  const config = await loadConfig();
  const token = config.telegramBotToken || Deno.env.get("TELEGRAM_BOT_TOKEN");

  if (!token) {
    console.warn("⚠️ No se puede enviar el mensaje de Telegram. Falta el TELEGRAM_BOT_TOKEN en la configuración.");
    console.log(`[MOCK TELEGRAM OUTBOUND a ${chatId}]: ${text}`);
    return false;
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  
  const payload = {
    chat_id: chatId,
    text: text,
    parse_mode: "Markdown"
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.text();
      
      // FALLBACK: Si falla por un error de sintaxis Markdown, intentarlo en texto plano.
      if (errorData.includes("can't parse entities")) {
        console.warn("⚠️ Telegram Markdown Error. Reintentando como texto plano puro...");
        delete (payload as any).parse_mode;
        
        const fallbackResponse = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        
        if (!fallbackResponse.ok) {
          console.error(`❌ Error definitivo en API de Telegram:`, await fallbackResponse.text());
          return false;
        }
        return true;
      }

      console.error(`❌ Error en API de Telegram (${response.status}):`, errorData);
      return false;
    }

    return true;
  } catch (error) {
    console.error("❌ Excepción al enviar mensaje de Telegram:", error);
    return false;
  }
}

/**
 * Descarga un archivo multimedia enviado por un usuario a través de Telegram.
 */
export async function downloadTelegramMedia(fileId: string): Promise<{ buffer: Uint8Array, mimeType: string } | null> {
  const config = await loadConfig();
  const token = config.telegramBotToken || Deno.env.get("TELEGRAM_BOT_TOKEN");

  if (!token) return null;

  try {
    // 1. Obtener la ruta del archivo
    const urlRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
    if (!urlRes.ok) throw new Error("Fallo al obtener URL del archivo de Telegram");
    
    const urlData = await urlRes.json();
    if (!urlData.ok) throw new Error(urlData.description);

    const filePath = urlData.result.file_path;
    const mediaUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;

    // Determinar MIME type rudimentario basado en la extensión
    let mimeType = "application/octet-stream";
    if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) mimeType = "image/jpeg";
    else if (filePath.endsWith(".png")) mimeType = "image/png";
    else if (filePath.endsWith(".pdf")) mimeType = "application/pdf";

    // 2. Descargar el binario
    const mediaRes = await fetch(mediaUrl);
    if (!mediaRes.ok) throw new Error("Fallo al descargar el archivo multimedia de Telegram");

    const arrayBuffer = await mediaRes.arrayBuffer();
    return {
      buffer: new Uint8Array(arrayBuffer),
      mimeType
    };
  } catch (error) {
    console.error("Error descargando media de Telegram:", error);
    return null;
  }
}

/**
 * Envía un documento PDF o archivo por Telegram con botones interactivos.
 * Ideal para el envío de Borradores de Cotizaciones.
 */
export async function sendTelegramDocument(
  chatId: string | number,
  documentUrl: string,
  caption: string,
  approveCallbackData: string,
  rejectCallbackData: string
): Promise<boolean> {
  const config = await loadConfig();
  const token = config.telegramBotToken || Deno.env.get("TELEGRAM_BOT_TOKEN");

  if (!token) return false;

  const url = `https://api.telegram.org/bot${token}/sendDocument`;
  
  const payload = {
    chat_id: chatId,
    document: documentUrl,
    caption: caption,
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "✅ Aprobar Oficial", callback_data: approveCallbackData },
          { text: "❌ Rechazar/Corregir", callback_data: rejectCallbackData }
        ]
      ]
    }
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return response.ok;
  } catch (error) {
    console.error("Error enviando documento por Telegram:", error);
    return false;
  }
}

/**
 * Envía un mensaje de texto con botones interactivos (Inline Keyboard).
 */
export async function sendTelegramInteractiveButton(
  chatId: string | number,
  text: string,
  buttonId: string,
  buttonTitle: string
): Promise<boolean> {
  const config = await loadConfig();
  const token = config.telegramBotToken || Deno.env.get("TELEGRAM_BOT_TOKEN");

  if (!token) return false;

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  
  const payload = {
    chat_id: chatId,
    text: text,
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [
          { text: buttonTitle, callback_data: buttonId }
        ]
      ]
    }
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    
    if (!response.ok) {
      const errorData = await response.text();
      if (errorData.includes("can't parse entities")) {
        console.warn("⚠️ Telegram Markdown Error en botón interactivo. Reintentando como texto plano puro...");
        delete (payload as any).parse_mode;
        
        const fallbackResponse = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        
        if (!fallbackResponse.ok) {
           console.error(`❌ Error definitivo en botón de Telegram:`, await fallbackResponse.text());
           return false;
        }
        return true;
      }
      
      console.error(`❌ Error en botón de Telegram (${response.status}):`, errorData);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error("Error enviando botones por Telegram:", error);
    return false;
  }
}
