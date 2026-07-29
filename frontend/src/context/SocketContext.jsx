/*
Reads currentUser from local storage.
Connects to the backend URL.
Waits for the Socket.IO connection.
Sends:
*/

import { createContext, useContext, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { io } from "socket.io-client";

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const location = useLocation();

  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const storedUser = localStorage.getItem("currentUser");

    if (!storedUser) {
      return;
    }

    let currentUser;

    try {
      currentUser = JSON.parse(storedUser);
    } catch (error) {
      console.error("Invalid currentUser in localStorage:", error);
      return;
    }

    if (!currentUser?.id) {
      return;
    }

    const newSocket = io(import.meta.env.VITE_BACKEND_URL, {
      transports: ["websocket", "polling"],
    });

    setSocket(newSocket);

    newSocket.on("connect", () => {
      console.log("Socket connected:", newSocket.id);

      setIsConnected(true);

      newSocket.emit("join-user-room", {
        userId: currentUser.id,
        role: currentUser.role,
      });
    });

    newSocket.on("connect_error", (error) => {
      console.error("Socket connection error:", error.message);
    });

    newSocket.on("disconnect", (reason) => {
      console.log("Socket disconnected:", reason);
      setIsConnected(false);
    });

    return () => {
      newSocket.disconnect();
      setSocket(null);
      setIsConnected(false);
    };
  }, [location.pathname]);

  return (
    <SocketContext.Provider
      value={{
        socket,
        isConnected,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
