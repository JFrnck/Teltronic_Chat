import { colors } from "@cliffy/ansi/colors";
import { loadConfig, initializeSoul, getConfigDir } from "./config/user_prefs.ts";

async function install() {
  console.log(colors.bold.cyan("🚀 Preparando el entorno para Jean..."));
  
  // Scaffolding inicial: Crear ~/.jean y archivos base
  try {
    await loadConfig();
    await initializeSoul();
    console.log(colors.green("✅ Directorio ~/.jean inicializado exitosamente."));
  } catch (e) {
    console.error(colors.red("⚠️ Hubo un problema al crear el directorio base ~/.jean o copiar plantillas"), e);
  }

  console.log(colors.bold.cyan("🚀 Instalando Jean Webhook Agent de forma global..."));

  const cmd = new Deno.Command("deno", {
    args: ["install", "--global", "--allow-all", "--unstable-kv", "--config", "deno.json", "--name", "jean", "--force", "main.ts"],
    stdout: "piped",
    stderr: "piped",
  });

  const { code, stdout, stderr } = await cmd.output();
  const decoder = new TextDecoder();

  if (code === 0) {
    console.log(decoder.decode(stdout));
    console.log(colors.bold.green("\n✅ Instalación de Jean completada con éxito."));
    console.log(colors.yellow("💡 Reinicia tu terminal o abre una nueva pestaña y ejecuta 'jean' en cualquier directorio para encender el servidor Webhook."));
  } else {
    console.error(colors.bold.red("\n❌ Hubo un error durante la instalación:"));
    console.error(decoder.decode(stderr));
    Deno.exit(1);
  }
}

if (import.meta.main) {
  install();
}
