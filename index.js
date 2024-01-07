const express = require('express');
const User = require('./models/userModel');
const Centre = require('./models/centreModel');
const mongoose = require('mongoose');

const http = require("http");
const { Server } = require("socket.io");
const app = express();
const server = http.createServer(app);

const WebSocket = require('websocket');
const WebSocketServer = WebSocket.server;
const WebSocketClient = WebSocket.client;
const client = new WebSocketClient();
const wsServer = new WebSocketServer({
  httpServer: server,
  autoAcceptConnections: false,
  maxReceivedFrameSize: 64 * 1024 * 1024,   // 64MiB
  maxReceivedMessageSize: 64 * 1024 * 1024, // 64MiB
  fragmentOutgoingMessages: false,
  keepalive: false,
  disableNagleAlgorithm: false
});

const port = 3000;
const MONGODB_URI = 'mongodb://localhost:27017/VMS';
const cors = require('cors');

const userRoutes = require('./routes/userRoutes');
const staticRoutes = require('./routes/staticRoutes');

app.use(cors({
  origin: 'https://5b6b-182-71-75-106.ngrok-free.app',
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: false,
}));

mongoose.connect(MONGODB_URI);

const db = mongoose.connection;

db.on('error', (error) => {
  console.error('MongoDB connection error:', error);
});
db.once('open', () => {
  console.log(`MongoDB connected at ${MONGODB_URI}`);
});

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  socket.on("clicked", (data) => { });
});

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(express.json());
app.use(express.static('public'))

app.use('/api', staticRoutes);
app.use('/api', userRoutes);

// io.on('connection', (socket) => {
//   console.log('A new user connected to socket.io');

//   socket.on('booked', (type) => {
//     console.log(type)
//     if (type.requestType === 'booked') {
//       getCentreList(socket, type.userId);
//     } else {
//       console.log('Unknown requestType:', type.requestType);
//     }
//   });

//   socket.on('disconnect', () => {
//     console.log('User disconnected from socket.io');
//   });
// });


wsServer.on('request', function (request) {
  // if (!originIsAllowed(request.origin)) {
  //   request.reject();
  //   console.log((new Date()) + ' Connection from origin ' + request.origin + ' rejected.');
  //   return;
  // }
  const connection = request.accept('', request.origin);

  connection.on('message', function (message) {
    var type = JSON.parse(message.utf8Data);
    console.log("=====>> type", type)
    if (type.requestType === "booked") {
      getCentreList(type.userId, type.page, type.limit);
    }
  });

  async function getCentreList(userId, page, limit, fromDate, toDate) {

    try {
      const user = await User.findById({ _id: userId });
      console.log(user)
      const currentDate = new Date().toISOString();

      console.log(currentDate)

      // const page1 = parseInt(page) || 1;
      // const limit1 = parseInt(limit);
      const page1 = parseInt(page) || 1;
      const limit1 = parseInt(limit) || 10;

      // const option = {
      //   page1,
      //   limit1,
      // }
      const pipeline = [
        {
          $geoNear: {
            near: {
              type: "Point",
              coordinates: [user.location.coordinates[0], user.location.coordinates[1]],
            },
            distanceField: "distance",
            spherical: true,
            includeLocs: "location",
          },
        },
        {
          $sort: {
            distance: 1,
          },
        },
        {
          $match: {
            status: 'ACTIVE',
          },
        },
        {
          $unwind: '$date',
        },
        {
          $unwind: '$date.slots',
        },
        {
          $match: { 'date.slots.available': true },
        },
        {
          $group: {
            _id: '$date.date',
            slots: {
              $push: {
                timings: '$date.slots.slotTiming',
                available: '$date.slots.available',
              },
            },
            totalAvailableSlots: { $sum: 1 },
          },
        },
        {
          $project: {
            name: 1,
            location: 1,
            distance: 1,
            slots: 1,
            totalAvailableSlots: 1,
          },
        },
        { $skip: (page1 - 1) * limit1 },
        { $limit: limit1 },
      ];
      

      const result = await Centre.aggregatePaginate(Centre.aggregate(pipeline));
      // console.log(result)
      const data1 = {
        data: result.docs,
        page: page1,
        limit: limit1,    
      }

      if (result) {
        var data = JSON.stringify( data1);
        connection.sendUTF(data);
      }
      // socket.emit('slotsUpdated', { message: 'Slots Fetched Successfully', result });

    } catch (error) {
      console.error(error);
      if (error) {
        var data = JSON.stringify(error);
        connection.sendUTF(data);
      }
      // socket.emit('error', { error: 'Internal Server Error' });
    } setTimeout(async () => {
      await getCentreList(userId, page, limit)
    }, 2 * 60 * 1000);
  }

  //******************************************************************************************/
  connection.on('close', function (reasonCode, description) {
    console.log(new Date() + ' Peer ' + connection.remoteAddress + ' Client has disconnected.');
  });
  connection.on('connectFailed', function (error) {
    console.log('Connect Error: ' + error.toString());
  });
});

client.on('connect', function (connection) {
  console.log(new Date() + ' WebSocket Client Connected');
  connection.on('error', function (error) {
    console.log("Connection Error: " + error.toString());
  });
  connection.on('close', function () {
    console.log('echo-protocol Connection Closed');
  });

});

client.connect('wss://localhost:3000');

// async function getCentreList(socket, userId, page, limit, fromDate, toDate) {

//   try {
//     const user = await User.findById({ _id: userId });
//     console.log(user)
//     const currentDate = new Date().toISOString();

//     console.log(currentDate)

//     const page1 = parseInt(page) || 1;
//     const limit1 = parseInt(limit) || 10;
//     const skip = (page1 - 1) * limit1;

//     const pipeline = [
//       {
//         $geoNear: {
//           near: {
//             type: "Point",
//             coordinates: [user.location.coordinates[0], user.location.coordinates[1]],
//           },
//           distanceField: "distance",
//           spherical: true,
//           includeLocs: "location",
//         },
//       },
//       {
//         $sort: {
//           distance: 1,
//         },
//       },
//       {
//         $match: {
//           status: 'ACTIVE',
//         },
//       },
//       {
//         $unwind: '$date',
//       },
//       {
//         $unwind: '$date.slots',
//       },
//       {
//         $match: { 'date.slots.available': true },
//       },
//       {
//         $group: {
//           _id: '$date.date',
//           slots: {
//             $push: {
//               timings: '$date.slots.slotTiming',
//               available: '$date.slots.available',
//             },
//           },
//           totalAvailableSlots: { $sum: 1 },
//         },
//       },
//       {
//         $project: {
//           name: 1,
//           location: 1,
//           distance: 1,
//           slots: 1,
//           totalAvailableSlots: 1,
//         },
//       },
//     ];


//     const result = await Centre.aggregatePaginate(Centre.aggregate(pipeline));
//     console.log(result)
//     if (result) {
//       var data = JSON.stringify(result);
//       connection.sendUTF(data);
//     }
//     // socket.emit('slotsUpdated', { message: 'Slots Fetched Successfully', result });

//   } catch (error) {
//     console.error(error);
//     if (error) {
//       var data = JSON.stringify(error);
//       connection.sendUTF(data);
//     }
//     // socket.emit('error', { error: 'Internal Server Error' });
//   }
// }

server.listen(port, () => {
  console.log(`Server is running on http://172.16.1.131:${port}`);
});
