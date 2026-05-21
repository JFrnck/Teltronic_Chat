import { executeShell } from "./system/shell.ts";
import { leer_archivo, escribir_archivo } from "./system/fs.ts";
import { requestPermission } from "../core/async_permissions.ts";
import { createNotionPage } from "./integrations/notion.ts";
import { readRecentEmails, sendEmail } from "./integrations/gmail.ts";
import { read_documentation, get_tech_docs, web_search_and_learn } from "./system/web_reader.ts";
import { run_background_command, kill_background_process } from "./system/background_jobs.ts";
import { executeSupabaseCommand } from "./supabase_cli.ts";
import { query_database, mutate_database, resolveClientFolder, resolveInstallationFolder, getSupabaseClient } from "../core/supabase.ts";
import { resolveBrandAndCategory, resolveCatalogModel } from "../core/supabase_inventory.ts";
import { createDriveFolder, moveDriveFile } from "../core/drive.ts";
import { createCalendarEvent, updateCalendarEvent, listUpcomingEvents } from "../core/calendar.ts";
import { generateDraftDocument } from "./integrations/pdf_generator.ts";
import { delegate_task } from "./agents/delegator.ts";
import { generateView } from "./ui_generator.ts";
import { generateDocument } from "./doc_generator.ts";

export const coderTools = [
  {
    type: "function",
    safe: true,
    function: {
      name: "delegate_task",
      description: "Delega una tarea analítica o generativa a otro modelo de lenguaje (Sub-Agente) más barato o rápido.",
      parameters: {
        type: "object",
        properties: {
          task_description: { type: "string", description: "Instrucciones detalladas de la tarea" },
          input_context: { type: "string", description: "El texto, código o log a analizar" },
          ai_profile: { type: "string", description: "El ID del perfil de IA a usar (ej. 'gemini', 'openrouter', 'ollama')" }
        },
        required: ["task_description", "input_context", "ai_profile"]
      }
    }
  },
  {
    type: "function",
    safe: true,
    function: {
      name: "generateView",
      description: "Genera una vista (Microfrontend) y retorna su URL para enviarla por WhatsApp.",
      parameters: {
        type: "object",
        properties: {
          viewType: { type: "string", description: "Tipo de vista: 'scanner_qr' o 'form_ingreso'" },
          sessionId: { type: "string", description: "El número de WhatsApp o ID de sesión del usuario" },
          params: { type: "object", description: "Parámetros opcionales para la vista" }
        },
        required: ["viewType", "sessionId"]
      }
    }
  },
  {
    type: "function",
    safe: true,
    function: {
      name: "generateDocument",
      description: "Genera una cotización o recibo en formato PDF (Microfrontend) y retorna su URL para enviarla al cliente.",
      parameters: {
        type: "object",
        properties: {
          tipo: { type: "string", description: "'cotizacion' o 'recibo'" },
          datos: { 
            type: "object", 
            description: "Datos del documento. Contiene información del cliente y los items.",
            properties: {
              cliente_nombre: { type: "string" },
              cliente_ruc: { type: "string" },
              vendedor: { type: "string" },
              descuento: { type: "number" },
              items: {
                type: "array",
                description: "Lista de productos o servicios",
                items: {
                  type: "object",
                  properties: {
                    nombre: { type: "string" },
                    cantidad: { type: "number" },
                    precio: { type: "number", description: "Precio unitario" },
                    comentario: { type: "string" }
                  },
                  required: ["nombre", "cantidad", "precio"]
                }
              }
            },
            required: ["cliente_nombre", "items"]
          },
          sessionId: { type: "string", description: "El número de WhatsApp del usuario" }
        },
        required: ["tipo", "datos", "sessionId"]
      }
    }
  },
  {
    type: "function",
    safe: false,
    function: {
      name: "executeShell",
      description: "Ejecuta un comando de bash en el sistema del usuario. Utilízalo para listar archivos, crear scripts o cualquier operación en la terminal.",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "El comando bash a ejecutar."
          }
        },
        required: ["command"]
      }
    }
  },
  {
    type: "function",
    safe: true,
    function: {
      name: "leer_archivo",
      description: "Lee silenciosamente el contenido de un archivo local. Utilízalo para entender el código fuente antes de modificarlo.",
      parameters: {
        type: "object",
        properties: {
          ruta: {
            type: "string",
            description: "Ruta relativa o absoluta al archivo a leer."
          }
        },
        required: ["ruta"]
      }
    }
  },
  {
    type: "function",
    safe: false,
    function: {
      name: "escribir_archivo",
      description: "Crea o sobreescribe un archivo en el sistema local. El usuario deberá autorizar esta acción mediante un prompt.",
      parameters: {
        type: "object",
        properties: {
          ruta: {
            type: "string",
            description: "Ruta del archivo a crear o sobreescribir."
          },
          contenido: {
            type: "string",
            description: "El código fuente o contenido exacto a escribir."
          }
        },
        required: ["ruta", "contenido"]
      }
    }
  },
  {
    type: "function",
    safe: true,
    function: {
      name: "get_tech_docs",
      description: "Recupera la documentación de una tecnología desde la Memoria a Largo Plazo (Deno KV). Usa esta herramienta SIEMPRE antes de intentar buscar en internet.",
      parameters: {
        type: "object",
        properties: {
          tech_name: { type: "string", description: "Nombre de la tecnología (ej. 'react', 'tailwindcss')" }
        },
        required: ["tech_name"]
      }
    }
  },
  {
    type: "function",
    safe: false,
    function: {
      name: "web_search_and_learn",
      description: "Lee la documentación desde una URL usando Jina AI y la memoriza permanentemente en Deno KV para consultas futuras.",
      parameters: {
        type: "object",
        properties: {
          tech_name: { type: "string", description: "Nombre de la tecnología a memorizar (ej. 'nextjs')" },
          url: { type: "string", description: "URL oficial de la documentación a extraer" }
        },
        required: ["tech_name", "url"]
      }
    }
  },
  {
    type: "function",
    safe: true,
    function: {
      name: "read_documentation",
      description: "Usa esta herramienta obligatoriamente cuando necesites leer documentación actualizada desde una URL proporcionada por el usuario o por un Playbook.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "La URL a escanear" }
        },
        required: ["url"]
      }
    }
  },
  {
    type: "function",
    safe: false,
    function: {
      name: "run_background_command",
      description: "Úsala ÚNICAMENTE para iniciar servidores de desarrollo, watchers, o procesos que no terminan por sí solos (ej. npm run dev). NO la uses para comandos rápidos.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "El comando base a ejecutar" },
          args: { type: "array", items: { type: "string" }, description: "Argumentos del comando" },
          cwd: { type: "string", description: "Directorio de trabajo (opcional)" }
        },
        required: ["command", "args"]
      }
    }
  },
  {
    type: "function",
    safe: false,
    function: {
      name: "kill_background_process",
      description: "Úsala para detener un proceso en segundo plano que iniciaste previamente si el usuario te pide apagar el servidor o liberar el puerto.",
      parameters: {
        type: "object",
        properties: {
          pid: { type: "number", description: "El Process ID (PID) del proceso a terminar" }
        },
        required: ["pid"]
      }
    }
  }
];

export const prodTools = [
  {
    type: "function",
    safe: true,
    function: {
      name: "delegate_task",
      description: "Delega una tarea analítica o generativa a otro modelo de lenguaje (Sub-Agente) más barato o rápido.",
      parameters: {
        type: "object",
        properties: {
          task_description: { type: "string", description: "Instrucciones detalladas de la tarea" },
          input_context: { type: "string", description: "El texto, código o log a analizar" },
          ai_profile: { type: "string", description: "El ID del perfil de IA a usar (ej. 'gemini', 'openrouter', 'ollama')" }
        },
        required: ["task_description", "input_context", "ai_profile"]
      }
    }
  },
  {
    type: "function",
    safe: true,
    function: {
      name: "create_drive_folder",
      description: "Crea una nueva carpeta en Google Drive. Útil para organizar fotos o documentos de clientes. Retorna el ID de la nueva carpeta.",
      parameters: {
        type: "object",
        properties: {
          folderName: { type: "string", description: "Nombre de la carpeta" },
          parentFolderId: { type: "string", description: "ID de la carpeta padre (Opcional)" }
        },
        required: ["folderName"]
      }
    }
  },
  {
    type: "function",
    safe: true,
    function: {
      name: "move_drive_file",
      description: "Mueve un archivo existente en Google Drive a una nueva carpeta. Úsalo para organizar fotos que el usuario te acaba de enviar.",
      parameters: {
        type: "object",
        properties: {
          fileId: { type: "string", description: "ID del archivo a mover" },
          newParentFolderId: { type: "string", description: "ID de la carpeta destino" }
        },
        required: ["fileId", "newParentFolderId"]
      }
    }
  },
  {
    type: "function",
    safe: true,
    function: {
      name: "generate_draft_document",
      description: "Genera un borrador de un PDF (Cotización, Nota de Venta) y lo envía al usuario por Telegram para su revisión y aprobación. Usa esto cuando el usuario te pida crear un documento.",
      parameters: {
        type: "object",
        properties: {
          chatId: { type: "string", description: "El ID de chat (telegram_1234) o número de usuario" },
          clientName: { type: "string", description: "Nombre del cliente" },
          documentType: { type: "string", description: "Tipo de documento, ej: 'Cotizacion', 'Nota_de_Venta'" },
          contentLines: { type: "array", items: { type: "string" }, description: "Líneas de texto que compondrán el cuerpo del documento" }
        },
        required: ["chatId", "clientName", "documentType", "contentLines"]
      }
    }
  },
  {
    type: "function",
    safe: true,
    function: {
      name: "link_photo_to_installation",
      description: "Mueve una foto que te acaban de enviar a la estructura oficial de carpetas de Drive (Empresas/X/Instalaciones/Y/Fotos) y registra el link en Supabase.",
      parameters: {
        type: "object",
        properties: {
          clientName: { type: "string", description: "Nombre del cliente, ej: 'Andes_Corp'" },
          installationDate: { type: "string", description: "Fecha de instalación, ej: '12_05_2025'" },
          photoDriveId: { type: "string", description: "ID de la foto en Drive" }
        },
        required: ["clientName", "installationDate", "photoDriveId"]
      }
    }
  },
  {
    type: "function",
    safe: true,
    function: {
      name: "add_inventory_unit",
      description: "Agrega UNA sola unidad física al inventario. ¡CRÍTICO! DEBES usar esta herramienta directamente cada vez que el usuario te pase los datos de equipos. Si te envían múltiples equipos, llama a esta herramienta varias veces simultáneamente. NUNCA generes vistas de interfaz si ya tienes los datos.",
      parameters: {
        type: "object",
        properties: {
          brandName: { type: "string", description: "Marca (ej. MOTOROLA)" },
          categoryName: { type: "string", description: "Categoría (ej. RADIO PORTATIL)" },
          modelName: { type: "string", description: "Modelo (ej. DEP450 VHF)" },
          serialNumber: { type: "string", description: "Número de serie único de esta unidad" },
          buyPrice: { type: "number", description: "Precio de compra" },
          sellPrice: { type: "number", description: "Precio de venta al público" },
          condition: { type: "string", description: "Estado de la unidad (ej. NUEVA, USADA)" },
          comments: { type: "string", description: "Comentarios adicionales" }
        },
        required: ["brandName", "categoryName", "modelName", "serialNumber", "buyPrice", "sellPrice"]
      }
    }
  },
  {
    type: "function",
    safe: true,
    function: {
      name: "search_inventory",
      description: "Busca unidades en el inventario basándose en marca, modelo, o estado. Usa esto cuando el usuario te pregunte por stock disponible.",
      parameters: {
        type: "object",
        properties: {
          brand: { type: "string", description: "Marca a filtrar (opcional)" },
          model: { type: "string", description: "Modelo a filtrar (opcional)" },
          status: { type: "string", description: "Estado de disponibilidad, ej. 'En Almacén' (opcional)" }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    safe: false,
    function: {
      name: "update_inventory_status",
      description: "Actualiza el estado de disponibilidad o condición de un equipo físico específico (por su número de serie).",
      parameters: {
        type: "object",
        properties: {
          serialNumber: { type: "string", description: "Número de serie de la unidad" },
          newStatus: { type: "string", description: "Nuevo estado (ej. Vendido, En Reparación)" }
        },
        required: ["serialNumber", "newStatus"]
      }
    }
  },
  {
    type: "function",
    safe: false,
    function: {
      name: "schedule_installation",
      description: "Programa una instalación en Google Calendar y la guarda en la base de datos Supabase. Usa esta herramienta cuando el usuario te pida agendar o programar una instalación para una empresa.",
      parameters: {
        type: "object",
        properties: {
          clientName: { type: "string", description: "Nombre de la empresa o cliente" },
          description: { type: "string", description: "Descripción del trabajo a realizar" },
          startDateTime: { type: "string", description: "Fecha y hora de inicio en formato ISO 8601 (ej. 2026-05-15T15:00:00-05:00)." },
          endDateTime: { type: "string", description: "Fecha y hora de fin en formato ISO 8601" }
        },
        required: ["clientName", "description", "startDateTime", "endDateTime"]
      }
    }
  },
  {
    type: "function",
    safe: false,
    function: {
      name: "reschedule_installation",
      description: "Reprograma una instalación existente modificando su fecha en Google Calendar y en Supabase.",
      parameters: {
        type: "object",
        properties: {
          calendarEventId: { type: "string", description: "El ID del evento de Google Calendar a modificar" },
          newStartDateTime: { type: "string", description: "Nueva fecha y hora de inicio en formato ISO 8601" },
          newEndDateTime: { type: "string", description: "Nueva fecha y hora de fin en formato ISO 8601" }
        },
        required: ["calendarEventId", "newStartDateTime", "newEndDateTime"]
      }
    }
  },
  {
    type: "function",
    safe: true,
    function: {
      name: "check_availability",
      description: "Consulta los eventos agendados en Google Calendar en un rango de fechas. Usa esto para ver si hay espacio antes de agendar a un cliente.",
      parameters: {
        type: "object",
        properties: {
          timeMin: { type: "string", description: "Fecha inicial en formato ISO 8601 (ej. 2026-05-15T00:00:00Z)" },
          timeMax: { type: "string", description: "Fecha final en formato ISO 8601 (ej. 2026-05-15T23:59:59Z)" }
        },
        required: ["timeMin", "timeMax"]
      }
    }
  },
  {
    type: "function",
    safe: false,
    function: {
      name: "createNotionPage",
      description: "Crea una página o nota en Notion.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Título de la página" },
          content: { type: "string", description: "Contenido principal" }
        },
        required: ["title", "content"]
      }
    }
  },
  {
    type: "function",
    safe: true,
    function: {
      name: "readRecentEmails",
      description: "Busca y lee correos recientes en la cuenta de Gmail especificada.",
      parameters: {
        type: "object",
        properties: {
          accountEmail: { type: "string", description: "El correo del cual leer (ej. admin@teltronicsolutions.com)" },
          query: { type: "string", description: "Términos de búsqueda, ej. 'urgente' o vacío para todos" },
          maxResults: { type: "number", description: "Cantidad máxima de correos a leer" }
        },
        required: ["accountEmail", "query", "maxResults"]
      }
    }
  },
  {
    type: "function",
    safe: false,
    function: {
      name: "send_email",
      description: "Envía un correo electrónico. Requiere aprobación asíncrona del Escudo Humano.",
      parameters: {
        type: "object",
        properties: {
          fromEmail: { type: "string", description: "Cuenta desde la cual se enviará el correo" },
          to: { type: "string", description: "Correo del destinatario" },
          subject: { type: "string", description: "Asunto del correo" },
          body: { type: "string", description: "Cuerpo del mensaje en texto plano" }
        },
        required: ["fromEmail", "to", "subject", "body"]
      }
    }
  },
  {
    type: "function",
    safe: true,
    function: {
      name: "executeSupabaseCommand",
      description: "Ejecuta comandos CLI de Supabase de forma segura. Usa comandos como 'db dump' o 'status' para lecturas inmediatas. Los comandos destructivos (push, reset, migration new) se interceptarán asíncronamente.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "El subcomando de supabase a ejecutar (ej. 'status', 'db', 'migration')" },
          args: { type: "array", items: { type: "string" }, description: "Lista de argumentos adicionales, (ej. ['dump'], ['new', 'mi_tabla'])" }
        },
        required: ["command", "args"]
      }
    }
  },
  {
    type: "function",
    safe: true,
    function: {
      name: "query_database",
      description: "Consulta datos en Supabase nativamente a alta velocidad. Úsalo para buscar clientes, inventarios u otra data.",
      parameters: {
        type: "object",
        properties: {
          table: { type: "string", description: "Nombre de la tabla" },
          select: { type: "string", description: "Columnas a seleccionar (por defecto '*')" },
          match: { type: "object", description: "Filtros exactos (ej. { nombre: 'Acme SAC' })" }
        },
        required: ["table"]
      }
    }
  },
  {
    type: "function",
    safe: false,
    function: {
      name: "mutate_database",
      description: "Inserta, actualiza o borra registros en la base de datos Supabase nativa. Requiere aprobación asíncrona del administrador.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", description: "'insert', 'update' o 'delete'" },
          table: { type: "string", description: "Nombre de la tabla" },
          payload: { type: "object", description: "Datos a insertar o actualizar (opcional para delete)" },
          match: { type: "object", description: "Condición para actualizar o borrar (ej. { id: 123 })" }
        },
        required: ["action", "table"]
      }
    }
  }
];

export function isToolSafe(name: string): boolean {
  const tool = [...coderTools, ...prodTools].find(t => t.function.name === name);
  // Si no se encuentra, asumimos que no es segura por defecto
  return tool ? (tool as any).safe : false;
}

export async function dispatchTool(name: string, argsStr: string): Promise<string> {
  let args;
  try {
    args = JSON.parse(argsStr);
  } catch (e) {
    return "Error: Los argumentos de la herramienta no son JSON válido.";
  }

  try {
    switch (name) {
      case "executeShell":
        return await executeShell(args.command);
      case "leer_archivo":
        return await leer_archivo(args.ruta);
      case "escribir_archivo":
        return await escribir_archivo(args.ruta, args.contenido);
      case "create_drive_folder": {
        const folder = await createDriveFolder(args.folderName, args.parentFolderId);
        return `Carpeta creada exitosamente. Nombre: ${args.folderName}, ID: ${folder.id}, URL: ${folder.url}`;
      }
      case "move_drive_file":
        return await moveDriveFile(args.fileId, args.newParentFolderId);
      case "generate_draft_document":
        return await generateDraftDocument(
          String(args.chatId).replace("telegram_", ""), 
          args.clientName, 
          args.documentType, 
          args.contentLines
        );
      case "link_photo_to_installation": {
        try {
          const { clientId } = await resolveClientFolder(args.clientName);
          const folderId = await resolveInstallationFolder(clientId, args.clientName, args.installationDate);
          
          await moveDriveFile(args.photoDriveId, folderId);
          return `Foto organizada correctamente en Drive en la instalación ${args.installationDate} del cliente ${args.clientName}. Registrada en CRM.`;
        } catch (e) {
          return `Error al organizar foto: ${e}`;
        }
      }
      case "schedule_installation": {
        try {
          const { clientId, folderId: clientFolderId } = await resolveClientFolder(args.clientName);
          const supabase = await getSupabaseClient();
          
          // Crear en Calendar
          const eventId = await createCalendarEvent({
            summary: `Instalación - ${args.clientName}`,
            description: args.description,
            start: { dateTime: args.startDateTime },
            end: { dateTime: args.endDateTime }
          });
          
          // Guardar en Supabase
          const dateOnly = args.startDateTime.split("T")[0];
          await supabase.from("instalaciones").insert({
            cliente_id: clientId,
            fecha_instalacion: dateOnly,
            estado: "Pendiente",
            drive_folder_id: `${clientFolderId}/Instalaciones/ins-${dateOnly}`,
            calendar_event_id: eventId
          });
          
          return `✅ Instalación programada con éxito en Google Calendar (ID: ${eventId}) y guardada en Supabase para el cliente ${args.clientName}.`;
        } catch (e) {
          return `Error al agendar instalación: ${e}`;
        }
      }
      case "reschedule_installation": {
        try {
          await updateCalendarEvent(args.calendarEventId, args.newStartDateTime, args.newEndDateTime);
          
          const supabase = await getSupabaseClient();
          const dateOnly = args.newStartDateTime.split("T")[0];
          await supabase.from("instalaciones")
            .update({ fecha_instalacion: dateOnly })
            .match({ calendar_event_id: args.calendarEventId });
            
          return `✅ Instalación reprogramada correctamente en Calendar y BD.`;
        } catch (e) {
          return `Error al reprogramar: ${e}`;
        }
      }
      case "check_availability": {
        try {
          const events = await listUpcomingEvents(args.timeMin, args.timeMax);
          if (events.length === 0) return "No hay instalaciones ni eventos agendados en ese periodo. Tienes disponibilidad completa.";
          
          const report = events.map((ev: any) => `- ${ev.summary} (${ev.start.dateTime || ev.start.date} a ${ev.end.dateTime || ev.end.date})`).join("\n");
          return `Tienes los siguientes eventos agendados:\n${report}`;
        } catch (e) {
          return `Error al consultar calendario: ${e}`;
        }
      }
      case "add_inventory_unit": {
        try {
          const supabase = await getSupabaseClient();
          const unit = args;
          
          const { brandId, categoryId } = await resolveBrandAndCategory(unit.brandName, unit.categoryName);
          const catalogId = await resolveCatalogModel(brandId, categoryId, unit.brandName, unit.modelName);
          
          const { error } = await supabase.from("unidades_inventario").insert({
            catalogo_id: catalogId,
            numero_serie: unit.serialNumber,
            precio_compra: unit.buyPrice,
            precio_venta: unit.sellPrice,
            condicion: unit.condition || "Nuevo",
            comentarios: unit.comments || ""
          });

          if (error) {
            return `Error al insertar serie ${unit.serialNumber}: ${error.message}`;
          }
          return `Unidad ${unit.serialNumber} registrada exitosamente.`;
        } catch (e) {
          return `Error al agregar unidad de inventario: ${e}`;
        }
      }
      case "search_inventory": {
        try {
          const supabase = await getSupabaseClient();
          let query = supabase
            .from("unidades_inventario")
            .select(`
              numero_serie, condicion, estado_disponibilidad, precio_venta, comentarios,
              catalogo_productos!inner (
                modelo,
                marcas!inner (nombre),
                categorias_producto!inner (nombre)
              )
            `);
          
          if (args.status) query = query.ilike("estado_disponibilidad", `%${args.status}%`);
          if (args.model) query = query.ilike("catalogo_productos.modelo", `%${args.model}%`);
          if (args.brand) query = query.ilike("catalogo_productos.marcas.nombre", `%${args.brand}%`);

          const { data, error } = await query.limit(20);
          if (error) return `Error consultando: ${error.message}`;
          if (!data || data.length === 0) return "No se encontraron unidades en almacén con esos criterios.";
          
          return `Inventario Encontrado:\n${JSON.stringify(data, null, 2)}`;
        } catch (e) {
          return `Error en búsqueda: ${e}`;
        }
      }
      case "update_inventory_status": {
        const supabase = await getSupabaseClient();
        const { error } = await supabase
          .from("unidades_inventario")
          .update({ estado_disponibilidad: args.newStatus })
          .match({ numero_serie: args.serialNumber });
        if (error) return `Error actualizando estado: ${error.message}`;
        return `✅ Estado del equipo ${args.serialNumber} actualizado a: ${args.newStatus}`;
      }
      case "createNotionPage":
        return await createNotionPage(args.title, args.content);
      case "readRecentEmails":
        return await readRecentEmails(args.accountEmail, args.query, args.maxResults || 5);
      case "send_email":
        return await sendEmail(args.fromEmail, args.to, args.subject, args.body);
      case "get_tech_docs":
        return await get_tech_docs(args.tech_name);
      case "query_database":
        return await query_database(args.table, args.select || "*", args.match);
      case "mutate_database":
        return await mutate_database(args.action, args.table, args.payload, args.match);
      case "web_search_and_learn":
        return await web_search_and_learn(args.tech_name, args.url);
      case "read_documentation":
        return await read_documentation(args.url);
      case "run_background_command":
        return await run_background_command(args.command, args.args, args.cwd);
      case "kill_background_process":
        return await kill_background_process(args.pid);
      case "delegate_task":
        return await delegate_task(args.task_description, args.input_context, args.ai_profile);
      case "generateView":
        return await generateView(args.viewType, args.sessionId, args.params || {});
      case "generateDocument":
        return await generateDocument(args.tipo, args.datos, args.sessionId);
      case "executeSupabaseCommand":
        return await executeSupabaseCommand(args.command, args.args);
      default:
        return `Error: La herramienta '${name}' no existe en el registro.`;
    }
  } catch (err) {
    return `Error inesperado ejecutando la herramienta ${name}: ${err instanceof Error ? err.message : String(err)}`;
  }
}
