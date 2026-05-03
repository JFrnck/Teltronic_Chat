import { join } from "@std/path";
import { exists, ensureDir } from "@std/fs";

export interface JeanConfig {
  apiKey?: string;
  openrouterKey?: string;
  geminiKey?: string;
  claudeKey?: string;
  notionApiKey?: string;
  gmailClientId?: string;
  gmailClientSecret?: string;
  gmailRefreshToken?: string;
}

export function getConfigDir(): string {
  const homeEnv = Deno.build.os === "windows" ? "USERPROFILE" : "HOME";
  const home = Deno.env.get(homeEnv);
  
  if (!home) {
    throw new Error("No se pudo determinar el directorio HOME del usuario.");
  }
  
  return join(home, ".jean");
}

export function getConfigPath(): string {
  return join(getConfigDir(), "config.json");
}

export function getSoulPath(): string {
  return join(getConfigDir(), "soul.md");
}

export async function initializeSoul(): Promise<void> {
  const soulPath = getSoulPath();
  const defaultSoul = `# System Prompt de Jean
Eres Jean, el cerebro central del CRM empresarial de Teltronic, operado vía WhatsApp.
- Tu misión es gestionar a los clientes, inventario y cotizaciones, respondiendo de forma asíncrona a los administradores.
- No estás en una terminal. Te comunicas enviando interfaces (Microfrontends) y respondiendo mensajes de WhatsApp.
- Debes ser profesional, eficiente y seguro.
`;
  if (!(await exists(soulPath))) {
    const configDir = getConfigDir();
    await ensureDir(configDir);
    await Deno.writeTextFile(soulPath, defaultSoul);
  }
}

export async function getSoul(): Promise<string> {
  const soulPath = getSoulPath();
  if (!(await exists(soulPath))) {
    await initializeSoul();
  }
  return await Deno.readTextFile(soulPath);
}

export async function saveConfig(config: JeanConfig): Promise<void> {
  try {
    const configDir = getConfigDir();
    await ensureDir(configDir);
    
    const configPath = getConfigPath();
    await Deno.writeTextFile(configPath, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error("Error al guardar la configuración:", error);
    throw error;
  }
}

export async function initializePlaybooks() {
  const baseDir = getConfigDir();
  const playbooksDir = `${baseDir}/playbooks`;
  const devDir = `${playbooksDir}/dev`;
  const prodDir = `${playbooksDir}/prod`;

  try {
    await Deno.mkdir(devDir, { recursive: true });
    await Deno.mkdir(prodDir, { recursive: true });

    const twTemplatePath = `${devDir}/frontend_vite_tw4.md`;
    try {
      await Deno.stat(twTemplatePath);
    } catch {
      const template = `# Directivas para Frontend: Vite + React + Tailwind v4

1. Usa la versión más moderna de Tailwind CSS (v4).
2. Tailwind v4 usa \`@import "tailwindcss";\` en \`index.css\`.
3. No se requieren archivos de configuración de Tailwind (\`tailwind.config.js\`) ni PostCSS (\`postcss.config.js\`) si usamos Vite.
4. Consulta documentación actualizada si tienes dudas: https://tailwindcss.com/docs/v4-beta`;
      await Deno.writeTextFile(twTemplatePath, template);
    }
  } catch (error) {
    console.error("Error inicializando el motor de Playbooks:", error);
  }
}

export async function loadConfig(): Promise<JeanConfig> {
  try {
    const configPath = getConfigPath();
    const data = await Deno.readTextFile(configPath);
    return JSON.parse(data) as JeanConfig;
  } catch (error) {
    console.error("Error al leer la configuración:", error);
    throw error;
  }
}

export async function hasConfig(): Promise<boolean> {
  const configPath = getConfigPath();
  return await exists(configPath);
}
