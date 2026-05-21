import { ensureDir } from "jsr:@std/fs";
import { getConfigDir } from "../config/user_prefs.ts";

export async function generateView(viewType: string, sessionId: string, params: Record<string, any> = {}): Promise<string> {
  const configDir = getConfigDir();
  const TEMPLATE_PATH = new URL("../templates/base_microfrontend.html", import.meta.url);
  const VIEWS_DIR = `${configDir}/views`;

  await ensureDir(VIEWS_DIR);
  
  let baseHtml = "";
  try {
    baseHtml = await Deno.readTextFile(TEMPLATE_PATH);
  } catch (error) {
    throw new Error(`No se pudo leer la plantilla base: ${error}`);
  }

  let content = "";

  if (viewType === "scanner_qr") {
    content = `
      <div class="fixed inset-0 z-[200] bg-black/90 flex flex-col items-center justify-center p-4 backdrop-blur-sm">
        <div class="w-full max-w-md bg-white rounded-[2.5rem] overflow-hidden shadow-2xl relative border-4 border-slate-900">
          <div class="p-6 flex justify-between items-center bg-slate-900 text-white">
            <h3 class="font-black uppercase text-[10px] tracking-[0.2em]">Escaneando para Teltronic</h3>
            <button onclick="window.close()" class="p-2 hover:bg-white/10 rounded-full transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
          <div id="reader" class="w-full bg-black aspect-square overflow-hidden shadow-inner"></div>
          <div class="p-8 text-center bg-slate-50 border-t">
            <p class="text-[10px] text-slate-400 font-black uppercase tracking-widest leading-relaxed">
              Enfoque el código de barras <br /> o serie del equipo
            </p>
          </div>
        </div>
      </div>
      <script>
        document.addEventListener("DOMContentLoaded", () => {
          const html5QrCode = new Html5Qrcode("reader");
          html5QrCode.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 },
            (decodedText) => {
              alert("¡Escaneado exitoso! Código: " + decodedText + ". Puedes cerrar esta ventana.");
              html5QrCode.stop();
            },
            undefined
          ).catch(err => console.error(err));
        });
      </script>
    `;
  } else if (viewType === "form_ingreso") {
    content = `
      <div class="p-8">
        <h2 class="text-2xl font-bold text-slate-900 mb-6 tracking-tight">Nuevo Registro de Inventario</h2>
        <form id="ingresoForm" class="space-y-5">
          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-2">
              <label class="text-sm font-semibold text-slate-700">Marca</label>
              <input type="text" id="brandName" required class="flex h-11 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900" placeholder="MOTOROLA" />
            </div>
            <div class="space-y-2">
              <label class="text-sm font-semibold text-slate-700">Categoría</label>
              <input type="text" id="categoryName" required class="flex h-11 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900" placeholder="RADIO PORTATIL" />
            </div>
          </div>
          
          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-2">
              <label class="text-sm font-semibold text-slate-700">Modelo</label>
              <input type="text" id="modelName" required class="flex h-11 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900" placeholder="DEP450 VHF" />
            </div>
            <div class="space-y-2">
              <label class="text-sm font-semibold text-slate-700">Número de Serie</label>
              <input type="text" id="serialNumber" required class="flex h-11 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900" placeholder="SN-123456" />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-2">
              <label class="text-sm font-semibold text-slate-700">Precio Compra</label>
              <input type="number" id="buyPrice" required step="0.01" class="flex h-11 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900" placeholder="900" />
            </div>
            <div class="space-y-2">
              <label class="text-sm font-semibold text-slate-700">Precio Venta</label>
              <input type="number" id="sellPrice" required step="0.01" class="flex h-11 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900" placeholder="1300" />
            </div>
          </div>
          
          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-2">
              <label class="text-sm font-semibold text-slate-700">Condición</label>
              <select id="condition" class="flex h-11 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900">
                <option value="Nuevo">Nuevo</option>
                <option value="Usado">Usado</option>
              </select>
            </div>
            <div class="space-y-2">
              <label class="text-sm font-semibold text-slate-700">Comentarios</label>
              <input type="text" id="comments" class="flex h-11 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900" placeholder="Opcional" />
            </div>
          </div>

          <button type="submit" id="submitBtn" class="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors bg-slate-900 text-white hover:bg-slate-800 h-11 px-4 py-2 w-full mt-4 shadow-sm disabled:opacity-50">
            Guardar en Base de Datos
          </button>
        </form>
      </div>
      <script>
        document.getElementById("ingresoForm").addEventListener("submit", async (e) => {
          e.preventDefault();
          const btn = document.getElementById("submitBtn");
          btn.disabled = true;
          btn.textContent = "Guardando...";

          const payload = {
            brandName: document.getElementById("brandName").value,
            categoryName: document.getElementById("categoryName").value,
            modelName: document.getElementById("modelName").value,
            serialNumber: document.getElementById("serialNumber").value,
            buyPrice: parseFloat(document.getElementById("buyPrice").value),
            sellPrice: parseFloat(document.getElementById("sellPrice").value),
            condition: document.getElementById("condition").value,
            comments: document.getElementById("comments").value
          };

          try {
            const res = await fetch("/api/inventory/add", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success) {
              alert("✅ Unidad guardada en Supabase y Drive exitosamente.");
              window.close();
            } else {
              alert("❌ Error: " + data.error);
              btn.disabled = false;
              btn.textContent = "Guardar en Base de Datos";
            }
          } catch (err) {
            alert("❌ Error de red: " + err.message);
            btn.disabled = false;
            btn.textContent = "Guardar en Base de Datos";
          }
        });
      </script>
    `;
  } else {
    content = `<div class="p-8 text-center text-red-500">Tipo de vista no reconocido.</div>`;
  }

  const finalHtml = baseHtml.replace("{{APP_CONTENT}}", content);
  
  const viewId = `${sessionId}-${viewType}`;
  const viewPath = `${configDir}/views/${viewId}.html`;
  
  await Deno.writeTextFile(viewPath, finalHtml);
  
  const baseUrl = Deno.env.get("PUBLIC_URL") || "https://assistant.teltronicsolutions.com";
  return `${baseUrl}/app/${viewId}`;
}
