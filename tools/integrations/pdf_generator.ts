import { PDFDocument, rgb } from "npm:pdf-lib";
import { uploadFileToDrive } from "../../core/drive.ts";
import { requestPermission } from "../../core/async_permissions.ts";
import { sendTelegramDocument } from "../../core/telegram.ts";
import { resolveClientFolder } from "../../core/supabase.ts";

export async function generateDraftDocument(
  chatId: string | number,
  clientName: string, 
  documentType: string, 
  contentLines: string[]
): Promise<string> {
  try {
    // 1. Resolver el ID del Cliente en Supabase y su carpeta en Drive
    const { folderId: clientFolderId, clientId } = await resolveClientFolder(clientName);

    // 2. Crear el PDF
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage();
    const { width, height } = page.getSize();
    
    page.drawText(`Teltronic Solutions - ${documentType.toUpperCase()}`, {
      x: 50,
      y: height - 50,
      size: 24,
      color: rgb(0, 0.53, 0.71)
    });

    page.drawText(`Cliente: ${clientName}`, { x: 50, y: height - 90, size: 14 });
    page.drawText(`Fecha: ${new Date().toLocaleDateString()}`, { x: 50, y: height - 110, size: 14 });

    let yOffset = height - 150;
    for (const line of contentLines) {
      page.drawText(line, { x: 50, y: yOffset, size: 12 });
      yOffset -= 20;
    }

    const pdfBytes = await pdfDoc.save();

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
      `📄 *Borrador Generado: ${documentType}*\nRevisa el documento en el enlace de arriba. Si está correcto, apruébalo para oficializarlo.`,
      taskId,
      `reject_${taskId}`
    );

    if (sent) {
      return `[SYSTEM] El borrador del documento ha sido generado y enviado al usuario por Telegram para su revisión (ID Tarea: ${taskId}). Tu ejecución termina aquí.`;
    } else {
      return `[SYSTEM] El borrador se subió a Drive en ${driveData.url}, pero hubo un fallo al enviarlo por Telegram.`;
    }
  } catch (error) {
    return `Error generando el borrador PDF: ${error}`;
  }
}
