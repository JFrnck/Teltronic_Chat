import { loadConfig } from "../../config/user_prefs.ts";
import { getValidAccessToken } from "../../utils/google_oauth.ts";
import { requestPermission } from "../../core/async_permissions.ts";

export async function readRecentEmails(accountEmail: string, query: string, maxResults: number): Promise<string> {
  const config = await loadConfig();
  if (!config.gmailClientId || !config.gmailClientSecret) {
    return "Error: Las credenciales OAuth de Gmail no están configuradas en el menú principal.";
  }

  let accessToken: string;
  try {
    accessToken = await getValidAccessToken(accountEmail);
  } catch (error) {
    return `Error obteniendo Token para ${accountEmail}: ${error instanceof Error ? error.message : String(error)}`;
  }

  try {
    const qParam = query ? `&q=${encodeURIComponent(query)}` : "";
    const listRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}${qParam}`, {
      headers: { "Authorization": `Bearer ${accessToken}` }
    });
    
    if (!listRes.ok) throw new Error(`Fallo al listar correos (${listRes.status}): ${await listRes.text()}`);
    
    const listData = await listRes.json();
    if (!listData.messages || listData.messages.length === 0) {
      return `La bandeja de entrada de ${accountEmail} está vacía o no se encontraron correos para esta búsqueda.`;
    }

    const msgPromises = listData.messages.map((msg: any) => 
      fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`, {
        headers: { "Authorization": `Bearer ${accessToken}` }
      }).then(r => r.json())
    );
    
    const messages = await Promise.all(msgPromises);

    let resultText = `Resultados de correos en ${accountEmail} (Query: ${query || "Todos"}):\n\n`;
    
    messages.forEach((msg: any, i: number) => {
      const headers = msg.payload?.headers || [];
      const subject = headers.find((h: any) => h.name === "Subject")?.value || "Sin Asunto";
      const from = headers.find((h: any) => h.name === "From")?.value || "Desconocido";
      const snippet = msg.snippet || "Sin vista previa";
      
      resultText += `${i + 1}. De: ${from}\n   Asunto: ${subject}\n   Resumen: ${snippet}\n\n`;
    });

    return resultText.trim();
  } catch (error) {
    return `Error crítico consumiendo la API de Gmail: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export async function sendEmail(fromEmail: string, to: string, subject: string, body: string): Promise<string> {
  const taskId = await requestPermission("EMAIL_AGENT", `Se solicitó enviar un correo desde ${fromEmail} a ${to}.\nAsunto: ${subject}\nCuerpo:\n${body}`, {
    action: "send_email",
    fromEmail,
    to,
    subject,
    body
  });
  
  return `[SEGURIDAD ASÍNCRONA] Se ha interceptado el intento de enviar un correo desde ${fromEmail} a ${to}. El Administrador ha recibido una notificación por WhatsApp.\nTu flujo se pausa aquí. Dile al usuario que debe aprobar la tarea (ID: ${taskId}) para despachar el correo.`;
}

/**
 * Función llamada por main.ts cuando el usuario aprueba el envío
 */
export async function execute_send_email_payload(context: any): Promise<boolean> {
  if (!context || !context.fromEmail || !context.to) return false;
  
  const { fromEmail, to, subject, body } = context;

  try {
    const accessToken = await getValidAccessToken(fromEmail);
    
    // Construir mensaje MIME RFC 2822
    const messageParts = [
      `From: ${fromEmail}`,
      `To: ${to}`,
      `Subject: =?utf-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=utf-8",
      "Content-Transfer-Encoding: 7bit",
      "",
      body
    ];
    const message = messageParts.join('\r\n');
    
    // Base64Url encode
    const encodedMessage = btoa(unescape(encodeURIComponent(message)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ raw: encodedMessage })
    });

    if (!response.ok) {
      console.error("Error enviando correo:", await response.text());
      return false;
    }

    return true;
  } catch (error) {
    console.error("Fallo ejecutando send_email aprobado:", error);
    return false;
  }
}
