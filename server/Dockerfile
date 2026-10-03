FROM node:20.19.5-bookworm-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY shared/package.json shared/package.json
RUN npm ci

COPY server/tsconfig.json server/tsconfig.json
COPY server/src server/src
COPY shared/tsconfig.json shared/tsconfig.json
COPY shared/src shared/src

RUN npm run build --workspace @community-chat/server
RUN npm prune --omit=dev

EXPOSE 3000
CMD ["npm", "run", "start", "--workspace", "@community-chat/server"]
