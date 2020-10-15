FROM node:12 AS builder

WORKDIR /usr/src/app

COPY . .
RUN npm install && npm run build

FROM node:12-buster

WORKDIR /usr/src/app

RUN apt update && apt install ansible python3-pip -y && pip3 install google-auth && ansible --version 

COPY --from=builder /usr/src/app ./

EXPOSE 3000
CMD [ "npm", "run", "start:prod" ]