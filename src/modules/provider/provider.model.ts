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

	@Prop({ required: true, type: String })
	name: string

	@Prop()
	inUse: { id: string, port: number}[]

	@Prop({ required: true, type: Object })
	selectors: object

	@Prop({ type: Object })
	metadata: {
		hostname?: string
		ports?: { min: number, max: number }
		ip?: string
		namespace?: string
		kubeconfig?: string
		zone?: string
		image?: string
		machineType?: string
	}
}

export const ProviderSchema = SchemaFactory.createForClass(Provider); 