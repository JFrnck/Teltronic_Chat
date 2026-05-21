import { loadConfig } from "../config/user_prefs.ts";

/**
 * Función base para enviar un request a WhatsApp Cloud API
 */
async function sendToWhatsAppAPI(payload: any): Promise<boolean> {
  const config = await loadConfig();
  const waPhoneNumberId = config.waPhoneNumberId || Deno.env.get("WA_PHONE_NUMBER_ID");
  const waAccessToken = config.waAccessToken || Deno.env.get("WA_ACCESS_TOKEN");

  if (!waPhoneNumberId || !waAccessToken) {
    console.warn("⚠️ No se puede enviar el mensaje de WhatsApp. Faltan credenciales (WA_PHONE_NUMBER_ID o WA_ACCESS_TOKEN).");
    console.log(`[MOCK WHATSAPP OUTBOUND]: ${JSON.stringify(payload, null, 2)}`);
    return false;
  }

  const url = `https://graph.facebook.com/v19.0/${waPhoneNumberId}/messages`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${waAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error(`❌ Error en API de WhatsApp (${response.status}):`, errorData);
      return false;
    }

    return true;
  } catch (error) {
    console.error("❌ Excepción al enviar mensaje de WhatsApp:", error);
    return false;
  }
}

/**
 * Envía un mensaje de texto plano por WhatsApp.
 */
export async function sendWhatsAppMessage(to: string, text: string): Promise<boolean> {
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: to,
    type: "text",
    text: {
      preview_url: true,
      body: text,
    },
  };

  return await sendToWhatsAppAPI(payload);
}

/**
 * Envía un mensaje interactivo con un botón.
 * Ideal para el Escudo Humano (Aprobaciones asíncronas).
 */
export async function sendWhatsAppInteractiveButton(
  to: string,
  bodyText: string,
  buttonId: string,
  buttonTitle: string
): Promise<boolean> {
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: to,
    type: "interactive",
    interactive: {
      type: "button",
      body: {
        text: bodyText,
      },
      action: {
        buttons: [
          {
            type: "reply",
            reply: {
              id: buttonId,
              title: buttonTitle.substring(0, 20), // Máximo 20 caracteres por política de Meta
            },
          },
        ],
      },
    },
  };

  return await sendToWhatsAppAPI(payload);
}

/**
 * Descarga un archivo multimedia enviado por un usuario a través de WhatsApp.
 */
export async function downloadWhatsAppMedia(mediaId: string): Promise<{ buffer: Uint8Array, mimeType: string } | null> {
  const config = await loadConfig();
  const waAccessToken = config.waAccessToken || Deno.env.get("WA_ACCESS_TOKEN");

  if (!waAccessToken) return null;

  try {
    // 1. Obtener la URL del media
    const urlRes = await fetch(`https://graph.facebook.com/v19.0/${mediaId}`, {
      headers: { "Authorization": `Bearer ${waAccessToken}` }
    });
    
    if (!urlRes.ok) throw new Error("Fallo al obtener URL del media");
    
    const urlData = await urlRes.json();
    const mediaUrl = urlData.url;
    const mimeType = urlData.mime_type;

    // 2. Descargar el binario
    const mediaRes = await fetch(mediaUrl, {
      headers: { "Authorization": `Bearer ${waAccessToken}` }
    });

    if (!mediaRes.ok) throw new Error("Fallo al descargar el archivo multimedia");

    const arrayBuffer = await mediaRes.arrayBuffer();
    return {
      buffer: new Uint8Array(arrayBuffer),
      mimeType
    };
  } catch (error) {
    console.error("Error descargando media de WhatsApp:", error);
    return null;
  }
}
