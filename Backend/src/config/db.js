import mongoose from "mongoose";

let connectionPromise;

export default async function connectDB() {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (mongoose.connection.readyState === 2) {
    return connectionPromise || mongoose.connection.asPromise();
  }

  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGO_URI is required");
  }
  connectionPromise = mongoose.connect(uri)
    .then(connection => {
      console.log("Connected to MongoDB");
      return connection;
    })
    .catch(error => {
      connectionPromise = undefined;
      throw error;
    });
  return connectionPromise;
}
