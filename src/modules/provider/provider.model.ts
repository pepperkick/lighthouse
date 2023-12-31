import { VirtualMachineSizeTypes } from '@azure/arm-compute/esm/models';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum ProviderType {
  LoadBalancer = 'LOAD_BALANCER',
  KubernetesNode = 'KUBERNETES_NODE',
  GCloud = 'GCLOUD',
  AWS = 'AWS',
  Azure = 'AZURE',
  DigitalOcean = 'DIGITAL_OCEAN',
  Vultr = 'VULTR',
  BinaryLane = 'BINARYLANE',
  Linode = 'LINODE',
  Oneqode = 'ONEQODE',
}

@Schema()
export class Provider extends Document {
  @Prop({ type: String })
  _id: string;

  @Prop({ required: true, type: String })
  type: ProviderType;

  @Prop({ required: true, type: Number })
  limit: number;

  @Prop({ required: true, type: String })
  region: string;

  @Prop({ required: true, type: Number })
  priority: number;

  @Prop({ type: Object })
  metadata: {
    // Common
    image?: string;
    hidden?: boolean;
    autoClose?: {
      time: number;
      min: number;
    };

    // LoadBalancer
    loadBalancerProviders?: { id: string; weight: number }[];

    // Kubernetes
    kubeConfig?: string;
    kubePorts?: { min: number; max: number };
    kubeIp?: string;
    kubeHostname?: string;
    kubeNamespace?: string;

    // Google Cloud
    gcpConfig?: string;
    gcpRegion?: string;
    gcpZone?: string;
    gcpVmImage?: string;
    gcpMachineType?: string;

    // Azure
    azureTenantId?: string;
    azureUsername?: string;
    azurePassword?: string;
    azureClientId?: string;
    azureSubscriptionId?: string;
    azureLocation?: string;
    azureImage?: string;
    azureRootPassword?: string;
    azureMachineType?: VirtualMachineSizeTypes;

    // Digital Ocean
    digitalOceanToken?: string;
    digitalOceanRegion?: string;
    digitalOceanMachineType?: string;
    digitalOceanMachineImage?: string;
    digitalOceanSSHKeyId?: number;
    digitalOceanImageName?: string;

    // Vultr
    vultrApiKey?: string;
    vultrPlanId?: number;
    vultrLocationId?: number;
    vultrSSHAccessKey?: string;
    vultrSSHKeys?: string[];
    vultrImageName?: string;

    // BinaryLane
    binarylaneApiKey?: string;
    binarylaneMachineSize?: string;
    binarylaneMachineImage?: string;
    binarylaneRegion?: string;
    binarylaneImageInstance?: string;
    binarylaneSSHKey?: string;

    // Linode
    linodeApiKey?: string;
    linodeImageName?: string;
    linodeRegion?: string;
    linodeRootPassword?: string;
    linodeSSHKeys?: string[];
    linodeSSHAccessKey?: string;
    linodeMachineSize?: string;

    // AWS
    awsAccessKey?: string;
    awsSecretKey?: string;
    awsRegion?: string;
    awsImageName?: string;
    awsInstanceType?: string;
    awsSubnetId?: string;
    awsSecurityGroupId?: string;
    awsKeyName?: string;

    // Oneqode
    oneqodeRegion?: string;
    oneqodeUsername?: string;
    oneqodePassword?: string;
    oneqodeProject?: string;
    oneqodeZone?: string;
    oneqodeKey?: string;
    oneqodeImageName?: string;
    oneqodeFlavor?: string;
    oneqodeSSHAccessKey?: string;
  };
}

export const ProviderSchema = SchemaFactory.createForClass(Provider);
