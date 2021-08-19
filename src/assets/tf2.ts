export { AZURE_STARTUP_SCRIPT, BINARYLANE_STARTUP_SCRIPT, GCP_STARTUP_SCRIPT } from './common';

const DOCKER_RUN_WITH_IP =
`IP=$(curl -s https://ipv4.icanhazip.com)
docker run -d --network host -e GIT_REPO={{ gitRepo }} -e GIT_KEY="{{ gitKey }}" {{ image }} {{ args }} +ip "$IP"`

const UFW_COMMAND =
`ufw allow 27015/udp
ufw allow 27015/tcp
ufw allow 27017/udp
ufw allow 27017/tcp
ufw allow 27020/udp
ufw allow 27020/tcp`

export const DIGITAL_OCEAN_STARTUP_SCRIPT =
`#!/bin/bash
${UFW_COMMAND}
${DOCKER_RUN_WITH_IP}`

export const VULTR_STARTUP_SCRIPT = DIGITAL_OCEAN_STARTUP_SCRIPT
export const LINODE_STARTUP_SCRIPT = DOCKER_RUN_WITH_IP
