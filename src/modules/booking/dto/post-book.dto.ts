export interface PostBookDTO {
	id: string
	bookedBy: string
	callbackUrl?: string
	selectors: {}
	metadata?: {}
	password?: string
	rconPassword?: string
	image?: string
	port?: number
	autoClose?: {
		time: number
		min: number
	}
}