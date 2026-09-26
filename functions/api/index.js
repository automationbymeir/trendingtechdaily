// functions/api/index.js (FULL - All Routes Active)

const express = require("express");
const cors = require("cors");
const fileUpload = require("express-fileupload");

// Import route handlers
const articleRoutes = require("./routes/articles");    // Original version
const aiRoutes = require("./routes/ai");              // SIMPLIFIED version
const adminApiRoutes = require("./routes/admin");      // SIMPLIFIED version

const app = express();

app.use(cors({ origin: true })); 
app.use(express.json()); 
app.use(fileUpload({ 
  limits: { fileSize: 10 * 1024 * 1024 }, 
  createParentPath: true, 
}));

// Define API routes
app.use("/articles", articleRoutes); 
app.use("/admin", adminApiRoutes);   
app.use("/", aiRoutes); 

app.get("/test", (req, res) => {
  res.status(200).json({  
    status: "ok",  
    message: "API (Express app) is working with ALL routes (Admin & AI simplified)!",
    timestamp: new Date().toISOString(),
  });
});

module.exports = app;