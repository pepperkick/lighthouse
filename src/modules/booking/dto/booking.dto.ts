export interface BookingDTO {
  id: string
  ip: string
  port: number
  tvPort: number
  password: string
  rconPassword: string
  token?: string
  region?: string
  connectString?: string
}