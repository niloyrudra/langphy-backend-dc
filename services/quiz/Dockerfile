FROM node:20-alpine

WORKDIR /app

# 1️⃣ Root workspace context (CRITICAL)
COPY package.json package-lock.json ./

# 2️⃣ Copy shared workspace
COPY shared ./shared

# 3️⃣ Install shared deps + build shared
WORKDIR /app/shared
RUN npm install
RUN npm run build

# 4️⃣ Copy service
WORKDIR /app
COPY services/quiz ./services/quiz

# 5️⃣ Install service deps + build
WORKDIR /app/services/quiz
RUN npm install
RUN npm run build

CMD ["node", "dist/index.js"]