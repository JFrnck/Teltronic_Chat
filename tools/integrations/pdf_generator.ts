import puppeteer from "npm:puppeteer";
import { uploadFileToDrive } from "../../core/drive.ts";
import { requestPermission } from "../../core/async_permissions.ts";
import { sendTelegramDocument } from "../../core/telegram.ts";
import { resolveClientFolder } from "../../core/supabase.ts";
import { generateDocumentHtml } from "../doc_generator.ts";

export async function generateDraftDocument(
  chatId: string | number,
  documentType: string, 
  datos: any
): Promise<string> {
  try {
    const clientName = datos.cliente_nombre || "Cliente General";
    
    // 1. Resolver el ID del Cliente en Supabase y su carpeta en Drive
    const { folderId: clientFolderId, clientId } = await resolveClientFolder(clientName);

    // 2. Generar el HTML de la plantilla
    const htmlContent = await generateDocumentHtml(documentType.toLowerCase() === "recibo" ? "recibo" : "cotizacion", datos);

    // 3. Crear el PDF con Puppeteer
    const browser = await puppeteer.launch({
      executablePath: Deno.env.get("PUPPETEER_EXECUTABLE_PATH") || undefined,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' }); // Esperar a que cargue Tailwind CDN
    
    const pdfBytesUint8Array = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' }
    });
    
    await browser.close();
    
    // Puppeteer devuelve un Uint8Array, uploadFileToDrive acepta Uint8Array
    const pdfBytes = new Uint8Array(pdfBytesUint8Array);

    // 2. Subir a Drive (Carpeta temporal de Borradores o Root temporalmente)
    const fileName = `${documentType}_${clientName.replace(/\s+/g, '_')}_DRAFT.pdf`;
    const driveData = await uploadFileToDrive(fileName, "application/pdf", pdfBytes);

    // 4. Crear Tarea del Escudo Humano
    const taskId = await requestPermission("DOC_AGENT", `Aprobación de documento: ${fileName}`, {
      action: "save_document",
      fileId: driveData.id,
      newFolderId: clientFolderId, // Lo movemos a la carpeta base del cliente
      table: "documentos_oficiales",
      payload: {
        cliente_id: clientId,
        tipo: documentType,
        drive_file_id: driveData.id,
        drive_url: driveData.url
      }
    });

    // 5. Enviar a Telegram con botones interactivos
    const sent = await sendTelegramDocument(
      chatId, 
      driveData.url, 
      `📄 <b>Borrador Generado: ${documentType}</b>\nRevisa el documento en el enlace de abajo. Si está correcto, apruébalo para oficializarlo.`,
      taskId,
      `reject_${taskId}`
    );

    if (sent) {
      return `[SYSTEM] El borrador del documento ha sido generado y enviado al usuario por Telegram para su revisión (ID Tarea: ${taskId}). Dile al usuario que revise el mensaje interactivo que acaba de recibir y que lo apruebe para oficializarlo.`;
    } else {
      return `[SYSTEM] El borrador se subió a Drive en ${driveData.url}, pero hubo un fallo al enviarlo por Telegram. Dile al usuario que hubo un error y entrégale el link directamente.`;
    }
  } catch (error) {
    return `Error generando el borrador PDF: ${error}`;
  }
}
