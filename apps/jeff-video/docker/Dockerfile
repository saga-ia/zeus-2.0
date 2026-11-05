# Render do Remotion para a aba Edição de Vídeo da Central.
# O servidor é Debian 11 (glibc 2.31) e o compositor do Remotion 4 exige glibc 2.35: o render roda aqui (Debian 12).
# O estúdio (/opt/jeff-apps/jeff-video/estudio, com node_modules e o Chrome headless já baixados) entra montado em /estudio.
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
      libnss3 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 libgbm1 libasound2 libxrandr2 libxkbcommon0 libxfixes3 \
      libxcomposite1 libxdamage1 libpango-1.0-0 libcairo2 libcups2 libdrm2 libxshmfence1 \
      fonts-dejavu-core fonts-noto-color-emoji fonts-liberation ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /estudio
