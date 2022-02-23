# Lighthouse

A modular game server manager. It abstracts multiple providers to easily start a new server.

Supported Providers

- Kubernetes Cluster
- Google Cloud Platform
- Microsoft Azure
- Amazon Web Services
- Digital Ocean
- Linode
- Vultr
- BinaryLane

## Config

```json5
{
  "instance": {
    // Configuration to pass server instance
    "tv_name": "",
    // SourceTV name (eg: QixTV)
    "hostname": ""
    // Default server name (eg: Qixalite Bookable)
  },
  "label": "",
  // Label to use for storing data in deployment (eg: "com.qixalite.lighthouse")
  "hatch": {
    "elasticUrl": "",
    // Elasticsearch URL
    "elasticChatIndex": "",
    // Index to use for storing chat logs
    "elasticLogsIndex": ""
    // Index to use for storing server logs (Currently not used)
  },
  "monitoring": {
    "enabled": true,
    // Enable monitoring of servers to detect idle servers
    "interval": 30
    // Interval to check for idle servers (in seconds)
  },
  "kubeConfig": ""
  // JSON escaped string of kubeconfig. This will be used to spawn jobs when a request is made
}
```

## Database

### Game

```json5
{
  slug: "",
  name: "",
  data: {
    // Game type to use during server queries
    queryType: "string",
    // Override provider metadata depending on provider type
    providerOverrides: {
      kubernetes: {},
      gcp: {},
      azure: {},
      digital_ocean: {},
      vultr: {}
    }
  }
}
```

### Provider

```json5
{
  _id: "",
  type: "",
  limit: 0,
  region: "",
  priority: 0,
  metadata: {
    // Common 
    image: "",
    hidden: false,
    autoClose: {
      time: 0,
      min: 0
    },
    // Kubernetes
    kubeConfig: "",
    kubePorts: {
      min: 0,
      max: 0
    },
    kubeIp: "",
    kubeHostname: "",
    kubeNamespace: "",
    // Google Cloud
    gcpConfig: "",
    gcpRegion: "",
    gcpZone: "",
    gcpVmImage: "",
    gcpMachineType: "",
    // Azure
    azureTenantId: "",
    azureUsername: "",
    azurePassword: "",
    azureClientId: "",
    azureSubscriptionId: "",
    azureLocation: "",
    azureImage: "",
    azureRootPassword: "",
    azureMachineType: "",
    // Digital Ocean
    digitalOceanToken: "",
    digitalOceanRegion: "",
    digitalOceanMachineType: "",
    digitalOceanMachineImage: "",
    digitalOceanSSHKeyId: 0,
    // Vultr
    vultrApiKey: "",
    vultrPlanId: 0,
    vultrLocationId: 0,
  }
}
```

### Client

```json5
{
  id: "",
  secret: "",
  name: "",
  access: {
    games: [
      "Game"
    ],
    regions: {
      slug: {
        limit: 0
      }
    },
    providers: [
      "Provider"
    ]
  },
  noAccess: {
    providers: [
      "Provider"
    ]
  }
}
```

### Server

```json5
{
  client: "Client",
  game: "Game",
  createdAt: "Date",
  password: "",
  rconPassword: "",
  tvPassword: "",
  port: 0,
  tvPort: 0,
  ip: "",
  region: "",
  provider: "Provider"
}
```

## API

**GET /api/v1/providers/region/:region**

Get a list of providers that the client has access to and can handle a request

Headers

```json5
{
  // Client's secret
  "Authorization": "Bearer <secret>"
}
```

Response

```json
[
  "sydney_kubernetes_1",
  "sydney_kubernetes_2"
]
```

**GET api/v1/servers**

Get list of servers. By default, it will show list of active servers only. Use `all` query to get all servers.

Headers

```json5
{
  // Client's secret
  "Authorization": "Bearer <secret>"
}
```

Query

```json5
{
  // Fetch all servers
  "all": "boolean"
}
```

Response

```json5
[
  {
    "_id": "5ffdec8ba4440d577c296a38",
    "client": "KSW2NUZGB9YGLXZ9W4NG3TXWIRQ2HD4R",
    "provider": "sydney_kubernetes_1",
    "region": "sydney",
    "game": "tf2",
    "createdAt": "2021-01-12T18:38:03.983Z",
    "status": "INIT",
    "closePref": {
      "minPlayers": 1,
      "idleTime": 300
    },
    "data": {
      "name": "PepperKick"
    },
  }
]
```

Status Code

```
Status Code: 200
Status Code: 401 (Unauthorized)
```

**POST api/v1/servers**

Create a new server request

Headers

```json5
{
  // Client's secret
  "Authorization": "Bearer <secret>"
}
```

Body

```json5
{
  // Game to create server for
  "game": "tf2",
  // Region of the server
  "region": "sydney",
  // Provider that will handle the request
  "provider": "sydney_kubernetes_1",
  // Set preferences for auto closing server
  "closePref": {
    "minPlayers": 1,
    "idleTime": 300
  },
  // Custom data to store with the request
  "data": {
    "name": "PepperKick"
  }
}
```

Response

```json5
{
  "_id": "5ffdec8ba4440d577c296a38",
  "client": "KSW2NUZGB9YGLXZ9W4NG3TXWIRQ2HD4R",
  "provider": "sydney_kubernetes_1",
  "region": "sydney",
  "game": "tf2",
  "createdAt": "2021-01-12T18:38:03.983Z",
  "status": "INIT",
  "closePref": {
    "minPlayers": 1,
    "idleTime": 300
  },
  "data": {
    "name": "PepperKick"
  },
}
```

Status Code

```
Status Code: 200 (Successfully created a request)
Status Code: 400 (Cannot create the request)
Status Code: 401 (Unauthorized)
Status Code: 403 (Forbidden)
```

**GET /api/v1/servers/:id**

Get server info

Headers

```json5
{
  // Client's secret
  "Authorization": "Bearer <secret>"
}
```

Response

```json5
{
  "_id": "5ffdf1564314b70c2015c0d9",
  "client": "KSW2NUZGB9YGLXZ9W4NG3TXWIRQ2HD4R",
  "provider": "sydney_kubernetes_1",
  "region": "sydney",
  "game": "tf2",
  "createdAt": "2021-01-12T18:58:30.087Z",
  "status": "IDLE",
  "data": {
    "name": "PepperKick"
  },
  "password": "b9b624c8",
  "rconPassword": "92668958",
  "ip": "139.99.131.144",
  "port": 2628,
  "tvPort": 2629
}
```

Status Code

```
Status Code: 200
Status Code: 404 (Server not found)
```

**DELETE /api/v1/servers/:id**

Delete a booking

Headers

```json5
{
  // Client's secret
  "Authorization": "Bearer <secret>"
}
```

Status Code

```
Status Code: 200 (Successfully created a request)
Status Code: 400 (Cannot close the request)
Status Code: 401 (Unauthorized)
Status Code: 403 (Forbidden)
Status Code: 404 (Server not found)
```
