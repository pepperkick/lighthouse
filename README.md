# Lighthouse
Game server manager to control services in a modular way

## Config

```
{
  "limit": 2,                     // Limit number of parallel bookings
  "namespace": "",                // Kubernetes namespace to run servers in
  "ip": "",                       // Public listen IP for server (currently hardcoded until I find a better solution)
  "ports": {                      // Range of ports, booking service will pick a random free port between min and max values
    "min": 25000,       
    "max": 27000        
  },        
  "waitPeriod": 300,              // After a booking has been determined as inactive
                                  // how long should the booking service wait before automatically unbooking it
  "instance": {                   // Configuration to pass server instance
    "image": {                    // Image details to use for server deployment
      "name": "",                 // Name of image (eg: docker.qixalite.com/tf2)
      "tag": ""                   // Tag of image (eg: flavor-booking)
    },        
    "tv_name": "",                // SourceTV name (eg: QixTV)
    "hostname": ""                // Default server name (eg: Qixalite Bookable)
  },        
  "tokens": [],                   // Array of GSLT tokens
  "label": ""                     // Label to use for storing data in deployment (eg: "com.qixalite.lighthouse")
}
```

## API

**GET /booking/book**

Return list of all bookings

Request
```
GET /booking/book
```

Response
```
{
  "limit": 4,                       // Limit of bookings
  "inUse": 1,                       // In use bookings
  "bookings": [                     // Array of bookings
    {
      "id":"189714596557357056",    // ID of booking (currently discord ID of booker)
      "name":"PepperKick#0630",     // Name of booking (currently discord username of booker)
      "port":"25268",               // Port of booking server
      "tvPort":"25269",             // SourceTV Port of booking server
      "password":"0fc2cc9c",        // Password of booking server
      "rconPassword":"ad9c25s",     // RCON Password of booking server
      "token":"< token >",          // GSLT token of booking server
      "ip":"43.249.38.147"          // IP of booking server (currently reads config IP)
    }
  ]
}
```

**POST /booking/book**

Create a new booking

Request
```
POST /booking/book
body: {
  "id": "189714596557357056",       // ID of booking (currently discord ID of booker)
  "name": "PepperKick#0630",        // Name of booking (currently discord username of booker)
  "region": ""                      // Region of booking (currently not supported)
}
```

Response
```
{
  "id":"189714596557357056",        // ID of booking (currently discord ID of booker)
  "name":"PepperKick#0630",         // Name of booking (currently discord username of booker)
  "port":"25268",                   // Port of booking server
  "tvPort":"25269",                 // SourceTV Port of booking server
  "password":"0fc2cc9c",            // Password of booking server
  "rconPassword":"ad9c25s",         // RCON Password of booking server
  "token":"< token >",              // GSLT token of booking server
  "ip":"43.249.38.147"              // IP of booking server (currently reads config IP)
}
```

**DELETE /booking/book/:id**

Delete a booking

Request
```
DELETE /booking/book/189714596557357056
```

Response
```
Status Code: 200
```


## Copyright Qixalite

Explicit permission must be given to copy, modify, distribute and use this software and/or its documentation for any purpose. Permission must be granted by Qixalite.
