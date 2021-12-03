import { DOCKER_RUN_COMMAND } from './common';
export { AZURE_STARTUP_SCRIPT, BINARYLANE_STARTUP_SCRIPT, GCP_STARTUP_SCRIPT, LINODE_STARTUP_SCRIPT } from './common';

const UFW_COMMAND =
`ufw allow 2456/udp
ufw allow 2456/tcp
ufw allow 2457/udp
ufw allow 2457/tcp
ufw allow 2458/udp
ufw allow 2458/tcp
ufw allow 2459/udp
ufw allow 2459/tcp`

export const DIGITAL_OCEAN_STARTUP_SCRIPT =
`#!/bin/bash
${UFW_COMMAND}
${DOCKER_RUN_COMMAND}'`

export const VULTR_STARTUP_SCRIPT = DIGITAL_OCEAN_STARTUP_SCRIPT
