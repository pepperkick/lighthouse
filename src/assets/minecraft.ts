import { DOCKER_RUN_COMMAND } from './common';
export { AZURE_STARTUP_SCRIPT, BINARYLANE_STARTUP_SCRIPT, GCP_STARTUP_SCRIPT, LINODE_STARTUP_SCRIPT } from './common';

const UFW_COMMAND =
`ufw allow 25565/udp
ufw allow 25565/tcp
ufw allow 25575/udp
ufw allow 25575/tcp`

export const DIGITAL_OCEAN_STARTUP_SCRIPT =
`#!/bin/bash
${UFW_COMMAND}
${DOCKER_RUN_COMMAND}`

export const VULTR_STARTUP_SCRIPT = DIGITAL_OCEAN_STARTUP_SCRIPT