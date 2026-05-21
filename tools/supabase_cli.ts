import { requestPermission } from "../core/async_permissions.ts";

export async function executeSupabaseCommand(command: string, args: string[]): Promise<string> {
  // Lista de comandos que mutan estado o esquema y requieren el Escudo Humano
  const dangerousCommands = ["push", "reset", "migration", "link", "start", "stop", "functions"];
  
  if (dangerousCommands.includes(command)) {
    const taskId = await requestPermission("DB_ADMIN_AGENT", `Comando Supabase Interceptado: npx supabase ${command} ${args.join(" ")}`, {
      action: "supabase_cli",
      command: command,
      args: args
    });
    return `[SEGURIDAD ASÍNCRONA] La acción destructiva 'supabase ${command}' ha sido interceptada y puesta en cuarentena de forma asíncrona. Se ha enviado una solicitud al Administrador de la base de datos por WhatsApp.\nTu flujo se pausa aquí. Dile al Administrador que debe enviar el comando 'APROBAR ${taskId}' por WhatsApp si desea proceder con la acción.`;
  }

  // Comandos seguros de solo lectura (ej. status, db dump, gen types)
  try {
    const cmd = new Deno.Command("npx", {
      args: ["supabase", command, ...args],
      stdout: "piped",
      stderr: "piped",
    });

    const output = await cmd.output();
    const stdout = new TextDecoder().decode(output.stdout);
    const stderr = new TextDecoder().decode(output.stderr);

    if (output.success) {
      return `[ÉXITO]\n${stdout}`;
    } else {
      return `[ERROR]\n${stderr}`;
    }
  } catch (error) {
    return `[ERROR FATAL] No se pudo ejecutar npx supabase: ${error instanceof Error ? error.message : String(error)}`;
  }
}
