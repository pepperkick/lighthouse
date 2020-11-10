import { VirtualMachineSizeTypes } from '@azure/arm-compute/esm/models';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum ProviderType {
	KubernetesNode = "KUBERNETES_NODE",
	GCloud = "GCLOUD",
	Azure = "AZURE",
	DigitalOcean = "DIGITAL_OCEAN",
	Vultr = "VULTR",
}

@Schema()
export class Provider extends Document {  
	@Prop({ required: true, type: String })
	type: ProviderType

	@Prop({ required: true, type: Number })
	limit: number

	@Prop({ required: true, type: Number })
	priority: number

	@Prop({ required: true, type: String })
	name: string

	@Prop({ required: true, type: Object })
	selectors: object

	@Prop({ type: Object })
	metadata: {
		// Common
		image?: string
		hidden?: boolean
		autoClose?: {
			time: number
			min: number
		}

		// Kubernetes
		kubeconfig?: string
		ports?: { min: number, max: number }
		ip?: string
		hostname?: string
		namespace?: string

		// Google Cloud
		gcloudconfig?: string
		region?: string
		zone?: string
		vmImage?: string
		machineType?: string
		
		// Azure
		azureTenantId?: string
		azureUsername?: string
		azurePassword?: string
		azureClientId?: string
		azureSubscriptionId?: string
		azureLocation?: string
		azureImage?: string
		azureRootPassword?: string
		azureMachineType?: VirtualMachineSizeTypes

		// Digital Ocean
		digitalOceanToken?: string
		digitalOceanRegion?: string
		digitalOceanMachineType?: string
		digitalOceanMachineImage?: string
		digitalOceanSSHKeyId?: number

		// Vultr
		vultrApiKey?: string
		vultrPlanId?: number
		vultrLocationId?: number
	}
}

export const ProviderSchema = SchemaFactory.createForClass(Provider); 