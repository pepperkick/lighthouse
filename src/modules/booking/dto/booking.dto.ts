export interface BookingDTO {
	_id: string
	ip: string
	port: number
	tvPort: number
	password: string
	rconPassword: string
	bookedBy: string
	token?: string
	region?: string
	connectString?: string
}