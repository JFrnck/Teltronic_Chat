import { getDriveServiceToken } from "../utils/google_oauth.ts";
import { createDriveFolder } from "./drive.ts";

/**
 * Busca una carpeta por nombre y parentId
 */
export async function searchDriveFolder(folderName: string, parentId?: string): Promise<string | null> {
  const token = await getDriveServiceToken();
  let query = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  if (parentId) {
    query += ` and '${parentId}' in parents`;
  } else {
    query += ` and 'root' in parents`;
  }

  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`, {
    headers: { "Authorization": `Bearer ${token}` }
  });

  if (!res.ok) throw new Error(`Error buscando carpeta: ${await res.text()}`);

  const data = await res.json();
  if (data.files && data.files.length > 0) {
    return data.files[0].id;
  }
  return null;
}

/**
 * Recibe una ruta jerárquica (ej. 'empresas/andes_corp/instalaciones/ins-1')
 * y se asegura de que exista todo el árbol de carpetas en Google Drive.
 * Retorna el ID de la carpeta final.
 */
export async function getOrCreateFolderPath(pathString: string): Promise<string> {
  // Limpiar y separar la ruta
  const pathParts = pathString.split('/').filter(p => p.trim() !== "");
  
  let currentParentId: string | undefined = undefined;

  for (const part of pathParts) {
    // Buscar si existe dentro del parent actual
    const existingFolderId = await searchDriveFolder(part, currentParentId);
    
    if (existingFolderId) {
      currentParentId = existingFolderId;
    } else {
      // Si no existe, lo creamos
      const newFolder = await createDriveFolder(part, currentParentId);
      currentParentId = newFolder.id;
    }
  }

  if (!currentParentId) {
    throw new Error("No se pudo resolver o crear la ruta en Drive.");
  }

  return currentParentId;
}
