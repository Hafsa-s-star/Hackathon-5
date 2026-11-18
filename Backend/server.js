import "dotenv/config";
import app from "./src/app.js";
import connectDB from "./src/config/db.js";

const port = process.env.PORT || 5000;

await connectDB();
app.listen(port, () => {
  console.log(`Stockwise API listening on port ${port}`);
});
