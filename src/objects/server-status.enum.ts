export enum ServerStatus {
  UNKNOWN = 'UNKNOWN', // Server is in unknown state
  INIT = 'INIT', // Request for server creation received
  ALLOCATING = 'ALLOCATING', // Allocating resources with tre provider
  WAITING = 'WAITING', // Wait for first heartbeat
  IDLE = 'IDLE', // Server is running but not in use (no players playing)
  RUNNING = 'RUNNING', // Server is running and being used (some players are in it)
  CLOSING = 'CLOSING', // Server is going to close state
  DEALLOCATING = 'DEALLOCATING', // Allocated resources are removed from the provider
  CLOSED = 'CLOSED', // All resources are removed
  FAILED = 'FAILED', // Server failed to open or close
}
