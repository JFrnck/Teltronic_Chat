FROM denoland/deno:alpine

WORKDIR /app

# Copiar todo el código al contenedor
COPY . .

# Caché de las dependencias para que el inicio sea rápido
RUN deno cache main.ts

EXPOSE 8000

# Correr con los permisos y Deno KV habilitado
CMD ["run", "-A", "--unstable-kv", "main.ts"]
