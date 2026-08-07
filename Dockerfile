# Usamos una versión de Linux limpia y ligera
FROM node:20-bookworm-slim

# Evitamos descargas pesadas de Puppeteer y le decimos dónde estará el navegador
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Instalamos el navegador oficial del sistema y GIT (necesario para Baileys)
RUN apt-get update && apt-get install -y chromium git \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Preparamos la carpeta de tu bot
WORKDIR /app

# Copiamos e instalamos tus paquetes
COPY package.json ./
RUN npm install

# Copiamos todo tu código
COPY . .

# Arrancamos el bot
CMD ["node", "index.cjs"]
