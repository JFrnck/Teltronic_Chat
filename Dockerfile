FROM denoland/deno:alpine

WORKDIR /app

# Copiar todo el código al contenedor
COPY . .

# Instalar Chromium y dependencias para Puppeteer
RUN apk add --no-cache \
      chromium \
      nss \
      freetype \
      harfbuzz \
      ca-certificates \
      ttf-freefont

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Caché de las dependencias para que el inicio sea rápido
RUN deno cache main.ts

EXPOSE 8000

# Correr con los permisos y Deno KV habilitado
CMD ["run", "-A", "--unstable-kv", "main.ts"]
