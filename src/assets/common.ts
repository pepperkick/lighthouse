export const DOCKER_RUN_COMMAND = `docker run -d --network host -e GIT_REPO={{ gitRepo }} -e GIT_KEY="{{ gitKey }}" {{ image }} {{ args }}`;

export const AZURE_STARTUP_SCRIPT = DOCKER_RUN_COMMAND;
export const BINARYLANE_STARTUP_SCRIPT = DOCKER_RUN_COMMAND;
export const LINODE_STARTUP_SCRIPT = DOCKER_RUN_COMMAND;

export const GCP_STARTUP_SCRIPT = `           #! /bin/bash
            
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
            
            ${DOCKER_RUN_COMMAND}`;

export const AWS_STARTUP_SCRIPT = `
  #! /bin/bash
  sudo service docker start
  sudo ${DOCKER_RUN_COMMAND}
`;

export const ONEQODE_STARTUP_SCRIPT = `
  #! /bin/bash
  sudo service docker start
  sudo ${DOCKER_RUN_COMMAND}
`;

export const GCP_CREATE_PLAYBOOK = `
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
`;

export const GCP_DESTROY_PLAYBOOK = `
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
`;

export const AWS_CREATE_PLAYBOOK = `
- name: Create Booking in AWS
  hosts: localhost
  gather_facts: no
  tasks:
  - name: Collect image
    amazon.aws.ec2_ami_info:
      aws_access_key: "{{ aws_access_key }}"
      aws_secret_key: "{{ aws_secret_key }}"
      region: "{{ region }}"
      filters:
        name: "{{ aws_image_name }}"
    register: ami
  - name: Create booking instance
    amazon.aws.ec2_instance:
      aws_access_key: "{{ aws_access_key }}"
      aws_secret_key: "{{ aws_secret_key }}"
      name: "{{ app }}-{{ id }}"
      vpc_subnet_id: "{{ aws_subnet_id }}"
      instance_type: "{{ aws_instance_type }}"
      key_name: "{{ aws_key_name }}"
      security_group: "{{ aws_security_group }}"
      image_id: "{{ ami.images[0].image_id }}"
      region: "{{ region }}"
      user_data: "{{ startup_script }}"
      network:
        assign_public_ip: true
      volumes:
        - device_name: /dev/xvda
          ebs:
            volume_size: 25
      state: running
    register: ec2  
  - name: Wait for SSH to come up
    wait_for: 
      host: "{{ item.public_ip_address }}"
      port: 22 
      delay: 5 
      timeout: 300 
      state: started
    with_items: "{{ ec2.instances }}"
  `;

export const AWS_DESTROY_PLAYBOOK = `
- name: Destroy Booking in AWS
  hosts: localhost
  gather_facts: no
  tasks:
  - name: Find booking instance
    amazon.aws.ec2_instance_info:
      aws_access_key: "{{ aws_access_key }}"
      aws_secret_key: "{{ aws_secret_key }}"
      region: "{{ region }}"
      filters:
        "tag:Name": "{{ app }}-{{ id }}"
    register: ec2
  - name: Delete booking instance
    amazon.aws.ec2_instance:
      aws_access_key: "{{ aws_access_key }}"
      aws_secret_key: "{{ aws_secret_key }}"
      region: "{{ region }}"
      state: absent
      instance_ids: '{{ item.instance_id }}'
    with_items: "{{ ec2.instances }}"
  `;

export const ONEQODE_CREATE_PLAYBOOK = `
- name: Create Booking in OneQode
  hosts: localhost
  gather_facts: no
  environment:
    OS_ENDPOINT_TYPE: publicURL
    OS_INTERFACE: publicURL
    OS_USERNAME: {{ username }}
    OS_PROJECT_ID: {{ project_id }}
    OS_PASSWORD: {{ password }}
    OS_AUTH_URL: https://api.ocs.oneqode.com:5000/v3
    OS_NO_CACHE: 1
    OS_USER_DOMAIN_ID: default
    OS_PROJECT_DOMAIN_ID: default
    OS_REGION_NAME: {{ region }}
    OS_IDENTITY_API_VERSION: 3
    OS_AUTH_VERSION: 3
  tasks:
  - name: Launch an instance
    openstack.cloud.server:
      state: present
      name: {{ app }}-{{ id }}
      region_name: "{{ region }}"
      availability_zone: "{{ zone }}"
      image: "{{ image }}"
      key_name: lighthouse
      timeout: 600
      flavor: "{{ flavor }}"
      security_groups: fleio
      auto_ip: yes
      userdata: "{{ startup_script }}"
    register: instance
  - debug:
      msg: "{{ instance }}"
  - name: Wait for SSH to come up
    wait_for: 
      host: "{{ instance.server.public_v4 }}"
      port: 22 
      delay: 5 
      timeout: 240 
      state: started
  - name: Creating a file with IP
    copy:
      dest: "./oneqode-ip-{{ id }}"
      content: |
        {{ instance.server.public_v4 }}
  `;

export const ONEQODE_DESTROY_PLAYBOOK = `
- name: Destroy Booking in OneQode
  hosts: localhost
  gather_facts: no
  environment:
    OS_ENDPOINT_TYPE: publicURL
    OS_INTERFACE: publicURL
    OS_USERNAME: {{ username }}
    OS_PROJECT_ID: {{ project_id }}
    OS_PASSWORD: {{ password }}
    OS_AUTH_URL: https://api.ocs.oneqode.com:5000/v3
    OS_NO_CACHE: 1
    OS_USER_DOMAIN_ID: default
    OS_PROJECT_DOMAIN_ID: default
    OS_REGION_NAME: {{ region }}
    OS_IDENTITY_API_VERSION: 3
    OS_AUTH_VERSION: 3
  tasks:
  - name: Delete booking instance
    openstack.cloud.server:
      name: {{ app }}-{{ id }}
      state: absent
  `;
