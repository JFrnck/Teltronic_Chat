import { Select, Input } from "@cliffy/prompt";
import { colors } from "@cliffy/ansi/colors";
import { ToolCall } from "./llm_client.ts";

export async function requestUserApproval(pendingTools: ToolCall[]): Promise<boolean> {
  console.log(`\n${colors.bold.red("⚠️  Jean ha puesto en pausa las siguientes acciones:")}`);
  
  pendingTools.forEach((tool, index) => {
    console.log(colors.bgBlack.white(` [${index + 1}] Acción: ${tool.function.name} `));
    
    let argsDisplay = tool.function.arguments;
    if (argsDisplay.length > 250) {
      argsDisplay = argsDisplay.slice(0, 250) + "...\n[Continúa]";
    }
    console.log(colors.gray(`     Args: ${argsDisplay}\n`));
  });

  const action = await Select.prompt({
    message: "¿Qué deseas hacer con estas acciones en cola?",
    options: [
      { name: "✅ Aprobar todo y ejecutar", value: "Y" },
      { name: "✏️  Revisar y modificar individualmente", value: "M" },
      { name: "❌ Rechazar todo y cancelar", value: "N" },
    ],
  });

  if (action === "Y") {
    return true;
  }

  if (action === "N") {
    return false;
  }

  if (action === "M") {
    for (let i = 0; i < pendingTools.length; i++) {
      const tool = pendingTools[i];
      console.log(`\n${colors.bold.cyan(`Modificando acción [${i + 1}/${pendingTools.length}]: ${tool.function.name}`)}`);
      
      const newArgs = await Input.prompt({
        message: "Edita el JSON de los argumentos (Enter para mantener original):",
        default: tool.function.arguments,
      });

      if (newArgs && newArgs !== tool.function.arguments) {
        // Validación básica de JSON
        try {
          JSON.parse(newArgs);
          tool.function.arguments = newArgs;
          console.log(colors.green("✓ Argumentos actualizados."));
        } catch (e) {
          console.log(colors.red("El texto introducido no es un JSON válido. Se mantendrán los argumentos originales."));
        }
      } else {
         console.log(colors.gray("✓ Argumentos mantenidos."));
      }
    }
    return true; // Una vez modificado individualmente, procedemos a ejecutar la cola.
  }

  return false;
}
