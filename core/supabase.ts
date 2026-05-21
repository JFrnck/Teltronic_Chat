import { createClient, SupabaseClient } from "npm:@supabase/supabase-js";
import { loadConfig } from "../config/user_prefs.ts";
import { requestPermission } from "./async_permissions.ts";

let supabaseInstance: SupabaseClient | null = null;

export async function getSupabaseClient(): Promise<SupabaseClient> {
  if (supabaseInstance) return supabaseInstance;

  const config = await loadConfig();
  const url = config.supabaseUrl || Deno.env.get("SUPABASE_URL");
  const key = config.supabaseServiceKey || Deno.env.get("SUPABASE_SERVICE_KEY");

  if (!url || !key) {
    throw new Error("No se pudo inicializar Supabase. Faltan las credenciales (SUPABASE_URL o SUPABASE_SERVICE_KEY). Configúralas con `jean setup`.");
  }

  supabaseInstance = createClient(url, key);
  return supabaseInstance;
}

/**
 * Consulta de datos (Lectura rápida, sin requerir escudo humano)
 */
export async function query_database(table: string, select = "*", match?: Record<string, any>): Promise<string> {
  try {
    const supabase = await getSupabaseClient();
    
    let query = supabase.from(table).select(select);
    
    if (match && Object.keys(match).length > 0) {
      query = query.match(match);
    }
    
    // Limitamos a 50 para evitar saturar el LLM con respuestas masivas
    const { data, error } = await query.limit(50);
    
    if (error) {
      return `Error consultando la base de datos: ${error.message}`;
    }
    
    return `Datos obtenidos de ${table}:\n${JSON.stringify(data, null, 2)}`;
  } catch (error) {
    return `Error inicializando el cliente BD: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * Mutación de datos (Requiere aprobación del Escudo Humano asíncrono)
 */
export async function mutate_database(
  action: "insert" | "update" | "delete", 
  table: string, 
  payload?: any, 
  match?: Record<string, any>
): Promise<string> {
  
  // Detenemos la ejecución y mandamos la solicitud al Escudo Humano
  const commandContext = { action, table, payload, match };
  const humanReadableAction = action.toUpperCase();
  
  let description = `Acción: ${humanReadableAction} en tabla: '${table}'`;
  if (payload) description += `\nDatos: ${JSON.stringify(payload).substring(0, 100)}...`;
  if (match) description += `\nCondición: ${JSON.stringify(match)}`;

  // Se delega al administrador a través del sistema de Async Permissions (WhatsApp/Telegram)
  const taskId = await requestPermission("DB_ADMIN_AGENT", description, commandContext);
  
  return `[SEGURIDAD ASÍNCRONA] La acción destructiva en base de datos ('${action}' en '${table}') ha sido interceptada y puesta en cuarentena. Se ha enviado una notificación al Administrador de la base de datos.\nTu flujo se pausa aquí. Dile al usuario que debe aprobar la tarea (ID: ${taskId}) si desea proceder con la acción.`;
}

/**
 * Función que se llama cuando el Admin pulsa el botón "Aprobar"
 */
export async function execute_mutation_payload(context: any): Promise<boolean> {
  if (!context || !context.action || !context.table) return false;
  
  try {
    const supabase = await getSupabaseClient();
    const { action, table, payload, match } = context;
    
    let query = supabase.from(table);
    
    if (action === "insert") {
      await query.insert(payload);
    } else if (action === "update") {
      if (!match) throw new Error("Update requiere condición match");
      await query.update(payload).match(match);
    } else if (action === "delete") {
      if (!match) throw new Error("Delete requiere condición match");
      await query.delete().match(match);
    }
    
    return true;
  } catch (error) {
    console.error("Error ejecutando mutación aprobada:", error);
    return false;
  }
}

import { getOrCreateFolderPath } from "./drive_manager.ts";

/**
 * Resuelve el ID de la carpeta de Drive de un cliente usando Supabase como fuente de verdad.
 * Si no tiene, la crea en Drive y actualiza Supabase.
 */
export async function resolveClientFolder(clientName: string): Promise<{ folderId: string, clientId: string }> {
  const supabase = await getSupabaseClient();
  
  // 1. Buscar al cliente
  const { data: clients, error } = await supabase
    .from("clientes")
    .select("id, nombre, drive_folder_id")
    .ilike("nombre", `%${clientName}%`)
    .limit(1);

  if (error) throw new Error(`Fallo buscando cliente en BD: ${error.message}`);
  
  let clientId = "";
  let folderId = "";

  if (!clients || clients.length === 0) {
    // Si no existe el cliente, lo creamos
    folderId = await getOrCreateFolderPath(`Empresas/${clientName}`);
    const { data: newClient, error: insError } = await supabase
      .from("clientes")
      .insert({ nombre: clientName, drive_folder_id: folderId })
      .select()
      .single();
      
    if (insError) throw new Error(`Fallo creando cliente: ${insError.message}`);
    clientId = newClient.id;
  } else {
    clientId = clients[0].id;
    folderId = clients[0].drive_folder_id;
    
    // Si el cliente existe pero no tiene carpeta, la creamos y actualizamos
    if (!folderId) {
      folderId = await getOrCreateFolderPath(`Empresas/${clients[0].nombre}`);
      await supabase.from("clientes").update({ drive_folder_id: folderId }).match({ id: clientId });
    }
  }

  return { folderId, clientId };
}

/**
 * Resuelve el ID de la carpeta de una Instalación.
 */
export async function resolveInstallationFolder(clientId: string, clientName: string, installationDate: string): Promise<string> {
  const supabase = await getSupabaseClient();
  
  const { data: installs, error } = await supabase
    .from("instalaciones")
    .select("id, drive_folder_id")
    .match({ cliente_id: clientId, fecha_instalacion: installationDate })
    .limit(1);

  if (error) throw new Error(`Fallo buscando instalación: ${error.message}`);

  let folderId = "";
  
  if (!installs || installs.length === 0) {
    folderId = await getOrCreateFolderPath(`Empresas/${clientName}/Instalaciones/ins-${installationDate}`);
    await supabase.from("instalaciones").insert({
      cliente_id: clientId,
      fecha_instalacion: installationDate,
      drive_folder_id: folderId
    });
  } else {
    folderId = installs[0].drive_folder_id;
    if (!folderId) {
      folderId = await getOrCreateFolderPath(`Empresas/${clientName}/Instalaciones/ins-${installationDate}`);
      await supabase.from("instalaciones").update({ drive_folder_id: folderId }).match({ id: installs[0].id });
    }
  }

  return folderId;
}
