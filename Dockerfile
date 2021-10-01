FROM node:alpine as build

WORKDIR /usr/src/app
COPY package*.json ./
COPY tsconfig.json ./
COPY ./src ./src
COPY ./videos ./videos
RUN npm install
RUN npm run build

FROM node:alpine
WORKDIR /usr/src/app
COPY package.json ./
RUN npm install --only=production
COPY --from=build /usr/src/app/build ./build
COPY --from=build /usr/src/app/videos ./videos

CMD npm start