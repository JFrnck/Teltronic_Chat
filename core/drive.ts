import { getDriveServiceToken } from "../utils/google_oauth.ts";

/**
 * Sube un archivo a Google Drive
 * @param fileName Nombre con el que se guardará el archivo
 * @param mimeType Tipo MIME (ej. "image/jpeg")
 * @param buffer Contenido binario del archivo
 * @param parentFolderId ID de la carpeta destino (opcional)
 * @returns Object con el ID y la URL pública (webViewLink)
 */
export async function uploadFileToDrive(fileName: string, mimeType: string, buffer: Uint8Array, parentFolderId?: string): Promise<{ id: string, url: string }> {
  const token = await getDriveServiceToken();
  
  const metadata: any = {
    name: fileName,
    mimeType: mimeType
  };
  
  if (parentFolderId) {
    metadata.parents = [parentFolderId];
  }

  const boundary = "-------314159265358979323846";
  const delimiter = "\r\n--" + boundary + "\r\n";
  const close_delim = "\r\n--" + boundary + "--";

  const base64Data = btoa(String.fromCharCode.apply(null, Array.from(buffer)));
  
  const multipartRequestBody =
    delimiter +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    JSON.stringify(metadata) +
    delimiter +
    "Content-Type: " + mimeType + "\r\n" +
    "Content-Transfer-Encoding: base64\r\n\r\n" +
    base64Data +
    close_delim;

  const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body: multipartRequestBody
  });

  if (!res.ok) {
    throw new Error(`Fallo subiendo archivo a Drive: ${await res.text()}`);
  }

  const data = await res.json();
  
  // Opcional: Hacer el archivo público de solo lectura para poder verlo sin iniciar sesión
  await fetch(`https://www.googleapis.com/drive/v3/files/${data.id}/permissions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      role: "reader",
      type: "anyone"
    })
  });

  return { id: data.id, url: data.webViewLink };
}

/**
 * Crea una carpeta en Google Drive
 */
export async function createDriveFolder(folderName: string, parentFolderId?: string): Promise<{ id: string, url: string }> {
  const token = await getDriveServiceToken();
  
  const metadata: any = {
    name: folderName,
    mimeType: "application/vnd.google-apps.folder"
  };
  
  if (parentFolderId) {
    metadata.parents = [parentFolderId];
  }

  const res = await fetch("https://www.googleapis.com/drive/v3/files?fields=id,webViewLink", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(metadata)
  });

  if (!res.ok) {
    throw new Error(`Fallo creando carpeta en Drive: ${await res.text()}`);
  }

  const data = await res.json();
  return { id: data.id, url: data.webViewLink };
}

/**
 * Mueve un archivo existente a otra carpeta
 */
export async function moveDriveFile(fileId: string, newParentFolderId: string): Promise<string> {
  const token = await getDriveServiceToken();
  
  // 1. Obtener los parents actuales
  const getRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=parents`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  const fileData = await getRes.json();
  const previousParents = fileData.parents ? fileData.parents.join(',') : '';

  // 2. Mover actualizando la lista de parents
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?addParents=${newParentFolderId}&removeParents=${previousParents}&fields=id,parents`, {
    method: "PATCH",
    headers: { "Authorization": `Bearer ${token}` }
  });

  if (!res.ok) {
    throw new Error(`Fallo moviendo archivo en Drive: ${await res.text()}`);
  }

  return `Archivo movido exitosamente a la carpeta ID: ${newParentFolderId}`;
}
