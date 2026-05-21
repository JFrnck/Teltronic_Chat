import { ensureDir } from "@std/fs";
import { getConfigDir } from "../config/user_prefs.ts";

interface DocItem {
  nombre: string;
  cantidad: number;
  precio: number;
  comentario?: string;
}

interface DocData {
  cliente_nombre: string;
  cliente_ruc?: string;
  vendedor?: string;
  items: DocItem[];
  descuento?: number;
}

export async function generateDocumentHtml(tipo: "cotizacion" | "recibo", datos: DocData): Promise<string> {
  const templatePath = new URL("../templates/cotizacion_pdf.html", import.meta.url); 
  let template = await Deno.readTextFile(templatePath);

  const timestamp = Date.now();
  const title = tipo === "cotizacion" ? "COTIZACIÓN COMERCIAL" : "RECIBO DE CAJA";
  const prefix = tipo === "cotizacion" ? "COT" : "REC";
  const docNumber = `${prefix}-${String(timestamp).slice(-5)}`;

  if (typeof datos === 'string') {
    try {
      datos = JSON.parse(datos);
    } catch (e) {
      throw new Error("El argumento 'datos' es un string pero no es un JSON válido.");
    }
  }

  if (!datos || !datos.items || !Array.isArray(datos.items)) {
    throw new Error("El objeto 'datos' no tiene un arreglo válido de 'items'. JSON recibido: " + JSON.stringify(datos));
  }

  let subtotal = 0;
  let filasHtml = "";

  for (const item of datos.items) {
    const cantidad = Number(item.cantidad) || 0;
    const precio = Number(item.precio) || 0;
    const importe = cantidad * precio;
    subtotal += importe;
    
    const unitarioConIGV = precio;
    
    filasHtml += `
      <div class="flex items-center border-b border-gray-100 py-2 px-2 text-[11px] hover:bg-gray-50 transition-colors">
        <div class="w-[10%] text-center">${cantidad}</div>
        <div class="w-[12%] text-center">UND</div>
        <div class="w-[48%] text-gray-800">${item.nombre} ${item.comentario ? `<br><span class="text-[9px] text-gray-500">${item.comentario}</span>` : ''}</div>
        <div class="w-[15%] text-right font-medium text-gray-700">S/ ${unitarioConIGV.toFixed(2)}</div>
        <div class="w-[15%] text-right pr-2 font-bold text-brand">S/ ${importe.toFixed(2)}</div>
      </div>
    `;
  }

  const descuento = Number(datos.descuento) || 0;
  const total = subtotal - descuento;
  const baseImponible = total / 1.18;
  const igv = total - baseImponible;

  template = template.replace(/{{titulo_doc}}/g, title);
  template = template.replace(/{{numero_doc}}/g, docNumber);
  template = template.replace(/{{cliente_nombre}}/g, datos.cliente_nombre || "Cliente General");
  template = template.replace(/{{cliente_ruc}}/g, datos.cliente_ruc || "00000000");
  const fecha = new Date().toLocaleDateString('es-PE');
  template = template.replace(/{{fecha}}/g, fecha);
  template = template.replace(/{{vendedor}}/g, datos.vendedor || "Departamento de Ventas");
  template = template.replace(/{{filas_items}}/g, filasHtml);
  
  template = template.replace(/{{subtotal}}/g, subtotal.toFixed(2));
  template = template.replace(/{{descuento}}/g, descuento.toFixed(2));
  template = template.replace(/{{base_imponible}}/g, baseImponible.toFixed(2));
  template = template.replace(/{{igv}}/g, igv.toFixed(2));
  template = template.replace(/{{total}}/g, total.toFixed(2));

  return template;
}

export async function generateDocument(tipo: "cotizacion" | "recibo", datos: DocData, sessionId: string): Promise<string> {
  try {
    const configDir = getConfigDir();
    const viewsDir = `${configDir}/views/docs`;
    await ensureDir(viewsDir);

    const template = await generateDocumentHtml(tipo, datos);
    const docId = `doc-${Date.now()}-${Math.floor(Math.random() * 1000)}`;



    const filePath = `${viewsDir}/${docId}.html`;
    await Deno.writeTextFile(filePath, template);

    const baseUrl = Deno.env.get("PUBLIC_URL") || "https://assistant.teltronicsolutions.com";
    return `Tu documento ha sido generado exitosamente. Ábrelo aquí: ${baseUrl}/docs/${docId}`;
  } catch (error) {
    return `ERROR CRÍTICO en generateDocument: ${error instanceof Error ? error.message : String(error)}. Por favor, informa al usuario exactamente de este error para que lo corrija.`;
  }
}
