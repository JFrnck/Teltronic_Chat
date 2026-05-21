import { loadConfig, saveConfig, getConfigDir } from "../config/user_prefs.ts";
import { join } from "https://deno.land/std@0.224.0/path/mod.ts";
import { colors } from "@cliffy/ansi/colors";
import { GoogleAuth, JWT } from "npm:google-auth-library";

const REDIRECT_URI = "http://localhost:8080/oauth2callback";
// Permiso completo para leer, redactar y enviar correos
const SCOPE = "https://mail.google.com/";

export async function addNewGmailAccount(): Promise<boolean> {
  const config = await loadConfig();

  if (!config.gmailClientId || !config.gmailClientSecret) {
    console.error(colors.red("Primero debes configurar el Client ID y Client Secret de Gmail en el menú."));
    return false;
  }

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${config.gmailClientId}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=${SCOPE}&access_type=offline&prompt=consent`;

  console.log(colors.bold.yellow("\n⚠️  Autenticación Requerida para nueva cuenta de Gmail"));
  console.log(colors.cyan("Abriendo navegador para iniciar sesión en Google..."));
  console.log(colors.gray(`Si no se abre automáticamente, haz clic aquí:\n${authUrl}\n`));

  try {
    const os = Deno.build.os;
    const cmd = os === "windows" ? ["start", authUrl] : os === "darwin" ? ["open", authUrl] : ["xdg-open", authUrl];
    new Deno.Command(cmd[0], { args: cmd.slice(1) }).spawn();
  } catch (_e) {
    // ignorar fallo
  }

  return new Promise((resolve) => {
    const ac = new AbortController();
    
    Deno.serve({ port: 8080, signal: ac.signal, onListen: () => {} }, async (req) => {
      const url = new URL(req.url);
      const code = url.searchParams.get("code");

      if (code) {
        try {
          const response = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              client_id: config.gmailClientId!,
              client_secret: config.gmailClientSecret!,
              code: code,
              grant_type: "authorization_code",
              redirect_uri: REDIRECT_URI
            })
          });

          const data = await response.json();
          
          if (data.access_token && data.refresh_token) {
            // Obtener el correo del usuario
            const profileRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
              headers: { Authorization: `Bearer ${data.access_token}` }
            });
            const profileData = await profileRes.json();
            const email = profileData.emailAddress;

            if (email) {
              const accounts = config.gmailAccounts || [];
              const existingIndex = accounts.findIndex(a => a.email === email);
              if (existingIndex >= 0) {
                accounts[existingIndex].refreshToken = data.refresh_token;
              } else {
                accounts.push({ email, refreshToken: data.refresh_token });
              }
              await saveConfig({ ...config, gmailAccounts: accounts });
              console.log(colors.green(`\n✅ Cuenta ${email} vinculada exitosamente.`));
              
              setTimeout(() => ac.abort(), 500);
              resolve(true);
              return new Response(`Autenticacion completada exitosamente para ${email}. Puedes cerrar esta pestana y volver a tu terminal.`, { status: 200 });
            }
          }
          
          console.error(colors.red("No se obtuvo refresh_token o email."));
          setTimeout(() => ac.abort(), 500);
          resolve(false);
          return new Response("Error obteniendo el token de acceso o perfil.", { status: 500 });
        } catch (error) {
          console.error(colors.red("Error en la peticion al servidor de Google"), error);
          setTimeout(() => ac.abort(), 500);
          resolve(false);
          return new Response("Fallo en la peticion al servidor de Google.", { status: 500 });
        }
      }

      return new Response("Esperando codigo OAuth... por favor completa el inicio de sesion.", { status: 200 });
    });
  });
}

export async function getValidAccessToken(email: string): Promise<string> {
  const config = await loadConfig();

  // 1. Verificar si es el correo corporativo usando Service Account
  if (config.workspaceEmail && email === config.workspaceEmail && config.serviceAccountPath) {
    try {
      const auth = new GoogleAuth({
        keyFile: config.serviceAccountPath,
        scopes: [SCOPE],
        clientOptions: {
          subject: config.workspaceEmail
        }
      });
      const client = await auth.getClient();
      const token = await client.getAccessToken();
      if (token && token.token) return token.token;
      throw new Error("No se pudo obtener el token de Service Account");
    } catch (e) {
      throw new Error(`Fallo autenticando Service Account para ${email}: ${e}`);
    }
  }

  // 2. Flujo normal OAuth para cuentas personales (@gmail.com)
  if (!config.gmailClientId || !config.gmailClientSecret) {
    throw new Error("Client ID o Client Secret de Gmail no configurados.");
  }

  const account = config.gmailAccounts?.find(a => a.email === email);
  if (!account || !account.refreshToken) {
    throw new Error(`La cuenta ${email} no está configurada o no tiene Refresh Token. Añádela en 'jean setup'.`);
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.gmailClientId,
      client_secret: config.gmailClientSecret,
      refresh_token: account.refreshToken,
      grant_type: "refresh_token"
    })
  });

  if (!response.ok) {
    throw new Error(`Fallo al refrescar token para ${email}. Es posible que haya sido revocado.`);
  }

  const data = await response.json();
  return data.access_token;
}

/**
 * Obtiene un token exclusivo para la API de Drive usando el Service Account
 */
export async function getDriveServiceToken(): Promise<string> {
  const config = await loadConfig();
  
  // Usar la ruta dinámica según el entorno (Mac o Docker)
  const actualServicePath = join(getConfigDir(), "service_account.json");
  
  const auth = new GoogleAuth({
    keyFile: actualServicePath,
    scopes: ["https://www.googleapis.com/auth/drive"],
    // Opcional: Si el Workspace Admin configuró DWD para Drive también. Si no, actuará como bot independiente.
    clientOptions: config.workspaceEmail ? { subject: config.workspaceEmail } : undefined
  });
  
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (token && token.token) return token.token;
  throw new Error("Fallo generando token para Google Drive");
}

/**
 * Obtiene un token exclusivo para la API de Calendar usando el Service Account
 */
export async function getCalendarServiceToken(): Promise<string> {
  const config = await loadConfig();
  
  const actualServicePath = join(getConfigDir(), "service_account.json");
  
  const auth = new GoogleAuth({
    keyFile: actualServicePath,
    scopes: ["https://www.googleapis.com/auth/calendar"],
    clientOptions: config.workspaceEmail ? { subject: config.workspaceEmail } : undefined
  });
  
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (token && token.token) return token.token;
  throw new Error("Fallo generando token para Google Calendar");
}
