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
RUN npm ci --omit=dev

COPY . .
RUN npm run build

EXPOSE 4200

CMD ["npm", "start"]
