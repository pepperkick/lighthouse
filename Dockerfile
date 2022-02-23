FROM node:12-buster

RUN apt update
RUN apt install python3-pip -y
RUN pip3 install requests boto3 botocore google-auth ansible 'ansible[azure]' && \
    ansible --version && \
    ansible-galaxy collection install amazon.aws && \
    apt-get install -y ca-certificates curl apt-transport-https lsb-release gnupg && \
    curl -sL "https://packages.microsoft.com/keys/microsoft.asc" | gpg --dearmor | tee /etc/apt/trusted.gpg.d/microsoft.gpg > /dev/null && \
    AZ_REPO=$(lsb_release -cs) && \
    echo "deb [arch=amd64] https://packages.microsoft.com/repos/azure-cli/ $AZ_REPO main" | tee /etc/apt/sources.list.d/azure-cli.list && \
    apt-get update && \
    apt-get install azure-cli
RUN mkdir /.azure && \
    mkdir /.ansible && \
    chmod 777 -R /.azure && \
    chmod 777 -R /.ansible

WORKDIR /usr/src/app

COPY . .
RUN npm install && npm run build

EXPOSE 3000
CMD [ "npm", "run", "start:prod" ]