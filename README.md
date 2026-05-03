# Jean: CRM Empresarial para Teltronic (Vía WhatsApp)

Jean es el cerebro central del CRM de Teltronic, diseñado para operar de forma 100% asíncrona a través de Webhooks de WhatsApp (Meta API). A diferencia de los CLIs tradicionales, Jean es un agente que atiende a clientes, interactúa con la base de datos (Supabase) y provee Microfrontends dinámicos bajo demanda.

## Arquitectura

- **Servidor Webhook (`main.ts`):** Punto de entrada principal mediante `Deno.serve`. Gestiona la verificación de Meta y recibe los mensajes entrantes de WhatsApp.
- **Enrutador Semántico:** Decide si la petición requiere a `CRM Agent` (para clientes/ventas/inventario) o a `DB Admin Agent` (para manejo de base de datos y esquemas).
- **Escudo Humano Asíncrono (`core/async_permissions.ts`):** Si un agente requiere ejecutar un comando destructivo o modificar el esquema de base de datos, Jean pausa la ejecución, la guarda en `Deno KV` y envía una notificación de WhatsApp al Administrador. La acción solo procede si el Admin responde `APROBAR <id>`.
- **Microfrontends Dinámicos:** Capacidad de generar e inyectar interfaces ligeras usando HTML, Tailwind CSS y componentes base de React extraídos del CRM Frontend, para que los usuarios puedan llenar formularios o escanear códigos desde su móvil.

## Instalación y Ejecución

Al ser un servidor Webhook, simplemente debes clonar el repositorio, configurar las variables de entorno para Deno y ejecutar el servidor en modo desarrollo:

\`\`\`bash
deno task dev
\`\`\`

Asegúrate de configurar `WHATSAPP_VERIFY_TOKEN` y otras API keys en tu entorno o a través del archivo de configuración generado en `~/.jean/config.json`.
