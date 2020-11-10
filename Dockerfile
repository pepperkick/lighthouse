FROM node:12-buster AS base

RUN apt update && apt install ansible python3-pip -y && pip3 install google-auth 'ansible[azure]' && ansible --version && apt-get install -y ca-certificates curl apt-transport-https lsb-release gnupg && curl -sL https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor | tee /etc/apt/trusted.gpg.d/microsoft.gpg > /dev/null && AZ_REPO=$(lsb_release -cs) && echo "deb [arch=amd64] https://packages.microsoft.com/repos/azure-cli/ $AZ_REPO main" | tee /etc/apt/sources.list.d/azure-cli.list && apt-get update && apt-get install azure-cli && mkdir /.azure && chmod 777 /.azure

FROM node:12 AS builder

WORKDIR /usr/src/app

COPY . .
RUN npm install && npm run build

FROM base

WORKDIR /usr/src/app

COPY --from=builder /usr/src/app ./

EXPOSE 3000
CMD [ "npm", "run", "start:prod" ]