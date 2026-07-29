const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);

// errror handler
const globaErrorHandler = require("./controllers/errorController");

// cors
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config({ path: "./.env" });

// middleware
app.use(express.json());
// app.use(express.urlencoded({ extended: true }));
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true,
  }),
);

//to serve react static files
app.use(express.static(path.join(__dirname, "public")));

// Socket.IO
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    methods: ["GET", "POST", "PATCH", "DELETE"],
    credentials: true,
  },
});

io.on("connection", (socket) => {
  console.log("Socket connected: ", socket.id);

  socket.on("join-user-room", ({ userId, role }) => {
    if (!userId) return;
    socket.join(`user:${userId}`);

    if (role) {
      socket.join(`role:${role}`);
    }

    console.log(
      `Socket ${socket.id} joined user : ${userId}`,
      role ? `and role:${role}` : "",
    );
  });

  socket.on("disconnect", () => {
    console.log("Socket disconnected:", socket.id);
  });
});

app.set("io", io);

// Connect to MongoDB
const connectToMongo = require("./db");
connectToMongo();

// app.get("/", (req, res) => {
//   res.send("Welcome to the Tutor-Time API!");
// });

// mouting routes
const adminRoutes = require("./routes/adminRoutes");
const teacherRoutes = require("./routes/teacherRoutes");
const studentRoutes = require("./routes/studentRoutes");
const messageRoutes = require("./routes/messageRoutes");

app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1/teachers", teacherRoutes);
app.use("/api/v1/student", studentRoutes);
app.use("/api/v1/messages", messageRoutes);

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
// For any non-API route, send React’s index.html; React Router will then render the correct page.

app.use(globaErrorHandler);

const port = process.env.PORT || 5000;

server.listen(port, () => {
  console.log("App listening on port " + port);
});
