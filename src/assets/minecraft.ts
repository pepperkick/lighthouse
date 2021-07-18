export const AZURE_STARTUP_SCRIPT =
  `docker run -d --network host -e GIT_REPO={{ git_repo }} -e GIT_KEY="{{ git_key }}" {{ image }} 'bash -c '/root/res/start.sh {{ args }}'`

export const DIGITAL_OCEAN_STARTUP_SCRIPT =
  `#!/bin/bash

ufw allow 25565/udp
ufw allow 25565/tcp
ufw allow 25575/udp
ufw allow 25575/tcp

docker run -d --network host -e GIT_REPO={{ git_repo }} -e GIT_KEY="{{ git_key }}" {{ image }} bash -c '/root/res/start.sh {{ args }}'`

export const VULTR_STARTUP_SCRIPT = DIGITAL_OCEAN_STARTUP_SCRIPT

export const BINARYLANE_STARTUP_SCRIPT =
  `docker run -d --network host {{ image }} {{ args }} --ip "$IP"`

export const LINODE_STARTUP_SCRIPT = BINARYLANE_STARTUP_SCRIPT

export const GCP_STARTUP_SCRIPT =
  `           #! /bin/bash
            
            export BOOKING_ID={{ id }}
            
            while : ; do
              if sudo iptables -L INPUT | grep -i "policy accept"; then
                break
              else
                sudo iptables -P INPUT ACCEPT
              fi
            done
            
            while : ; do
              if sudo iptables -L OUTPUT | grep -i "policy accept"; then
                break
              else
                sudo iptables -P OUTPUT ACCEPT
              fi
            done
            
            docker run --network host -e GIT_REPO={{ git_repo }} -e GIT_KEY="{{ git_key }}" {{ image }} 'bash -c '/root/res/start.sh {{ args }}'`

export const GCP_CREATE_PLAYBOOK =
  `
- name: Create Booking in GCloud
  hosts: localhost
  gather_facts: no  
  vars:
    gcp_cred_kind: serviceaccount
  tasks:
  - name: Create a Address
    gcp_compute_address:
      name: '{{ app }}-{{ id }}'
      region: "{{ region }}"
      project: "{{ project }}"
      auth_kind: "{{ gcp_cred_kind }}"
      service_account_file: "{{ gcp_cred_file }}"
      state: present
    register: address
  - name: Create an instance
    gcp_compute_instance:
      state: present
      name: "{{ app }}-{{ id }}"
      machine_type: {{ machine_type }}
      network_interfaces:
      - access_configs:
        - name: External NAT
          nat_ip: "{{ address }}"
          type: ONE_TO_ONE_NAT
      disks:
      - auto_delete: true
        boot: true
        initialize_params: 
          source_image: "{{ image }}"
      metadata:
        startup-script: >-
{{ startup_script }}
      zone: "{{ zone }}"
      project: "{{ project }}"
      auth_kind: "{{ gcp_cred_kind }}"
      service_account_file: "{{ gcp_cred_file }}"
`

export const GCP_DESTROY_PLAYBOOK =
  `
- name: Destroy Booking in GCloud
  hosts: localhost
  gather_facts: no  
  vars:
    gcp_cred_kind: serviceaccount
  tasks:
  - name: Delete the instance
    gcp_compute_instance:
      name: "{{ app }}-{{ id }}"
      zone: "{{ zone }}"
      project: "{{ project }}"
      auth_kind: "{{ gcp_cred_kind }}"
      service_account_file: "{{ gcp_cred_file }}"
      state: absent
  - name: Delete the Address
    gcp_compute_address:
      name: '{{ app }}-{{ id }}'
      region: "{{ region }}"
      project: "{{ project }}"
      auth_kind: "{{ gcp_cred_kind }}"
      service_account_file: "{{ gcp_cred_file }}"
      state: absent
`