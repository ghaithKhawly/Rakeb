import axios from "axios";

export const api = axios.create({
  // Updated to use your detected LAN IP - this works for Emulators AND Physical Devices
  baseURL: "http://192.168.12.72:3000", 
  timeout: 10000,
});