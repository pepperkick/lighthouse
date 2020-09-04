import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum ProviderType {
	KubernetesNode = "KUBERNETES_NODE",
	GCloud = "GCLOUD"
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
		image?: string
		hostname?: string
		ports?: { min: number, max: number }
		ip?: string
		namespace?: string
		kubeconfig?: string
		gcloudconfig?: string
		region?: string
		zone?: string
		vmImage?: string
		machineType?: string
		hidden?: boolean
		autoClose?: {
			time: number
			min: number
		}
	}
}

export const ProviderSchema = SchemaFactory.createForClass(Provider); 