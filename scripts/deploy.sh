#!/bin/bash
set -e

echo "🚀 Iniciando despliegue DOCKERIZADO de Jean CRM en Ubuntu..."

# 1. Instalar Docker y Docker Compose si no existen
if ! command -v docker &> /dev/null; then
    echo "🐳 Instalando Docker..."
    sudo apt-get update
    sudo apt-get install -y ca-certificates curl gnupg
    sudo install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    sudo chmod a+r /etc/apt/keyrings/docker.gpg
    echo \
      "deb [arch="$(dpkg --print-architecture)" signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      "$(. /etc/os-release && echo "$VERSION_CODENAME")" stable" | \
      sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    sudo apt-get update
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    
    # Permitir que el usuario ubuntu use docker sin sudo
    sudo usermod -aG docker ubuntu
fi

echo "✅ Docker instalado."

# 2. Verificar que la carpeta de credenciales existe
if [ ! -d "/home/ubuntu/.jean" ]; then
    echo "⚠️ ADVERTENCIA: La carpeta /home/ubuntu/.jean no existe."
    echo "Deberás subirla desde tu Mac para que Jean tenga las claves API y la base de datos."
    mkdir -p /home/ubuntu/.jean
fi

# 3. Construir y Levantar los Contenedores
echo "🏗️ Construyendo y levantando los contenedores de Jean..."
cd /home/ubuntu/Jean
sudo docker compose up -d --build

echo "✅ ¡Despliegue completado con éxito!"
echo "--------------------------------------------------------"
echo "Jean CRM y el Escudo Anti-Oracle están corriendo aislados en Docker."
echo "Para ver los logs en vivo, ejecuta: sudo docker compose logs -f jean-crm"
echo "--------------------------------------------------------"
