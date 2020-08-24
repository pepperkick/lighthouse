import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum ProviderType {
	ClusterNode = "CLUSTER_NODE"
}

@Schema()
export class Provider extends Document {  
	@Prop({ required: true, type: String })
	type: ProviderType

	@Prop({ required: true, type: String })
	hostname: string

	@Prop({ required: true, type: String })
	ip: string

	@Prop({ required: true, type: Object })
	ports: { min: number, max: number }

	@Prop({ required: true, type: Number })
	limit: number

	@Prop()
	inUse: { id: string, port: number}[]

	@Prop({ required: true, type: Object })
	selectors: object

	@Prop({ type: Object })
	metadata: {
		namespace?: string,
		kubeconfig?: string
	}
}

export const ProviderSchema = SchemaFactory.createForClass(Provider); 