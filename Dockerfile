FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    tmux \
    git \
    ca-certificates \
    curl \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g @anthropic-ai/claude-code

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build
RUN npm prune --omit=dev

EXPOSE 4200

CMD ["npm", "start"]
