const admin = require("firebase-admin");
const { v4: uuidv4 } = require("uuid");
const path = require("path");
const os = require("os");
const fs = require("fs");
const Busboy = require("busboy");

// Handle file upload
exports.uploadFile = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  
  const busboy = new Busboy({ headers: req.headers });
  const tmpdir = os.tmpdir();
  const fields = {};
  const uploads = {};
  
  busboy.on("field", (fieldname, val) => {
    fields[fieldname] = val;
  });
  
  const fileWrites = [];
  
  busboy.on("file", (fieldname, file, filename, encoding, mimetype) => {
    if (!filename) {
      return;
    }
    
    // Create a unique filename
    const extension = path.extname(filename);
    const originalName = path.basename(filename, extension);
    const uniqueFilename = `${originalName}_${uuidv4()}${extension}`;
    const filepath = path.join(tmpdir, uniqueFilename);
    
    uploads[fieldname] = {
      filepath,
      mimetype,
      originalName,
      uniqueFilename,
    };
    
    const writeStream = fs.createWriteStream(filepath);
    file.pipe(writeStream);
    
    const promise = new Promise((resolve, reject) => {
      file.on("end", () => {
        writeStream.end();
      });
      writeStream.on("finish", resolve);
      writeStream.on("error", reject);
    });
    fileWrites.push(promise);
  });
  
  busboy.on("finish", async () => {
    await Promise.all(fileWrites);
    
    const results = [];
    for (const name in uploads) {
      const upload = uploads[name];
      const bucket = admin.storage().bucket();
      
      const destination = `uploads/${upload.uniqueFilename}`;
      
      await bucket.upload(upload.filepath, {
        destination,
        metadata: {
          contentType: upload.mimetype,
          metadata: {
            originalName: upload.originalName,
          },
        },
      });
      
      // Get the public URL
      const file = bucket.file(destination);
      const [url] = await file.getSignedUrl({
        action: "read",
        expires: "01-01-2100",
      });
      
      results.push({
        fieldname: name,
        originalName: upload.originalName,
        filename: upload.uniqueFilename,
        url,
      });
      
      fs.unlinkSync(upload.filepath);
    }
    
    res.json({ success: true, files: results });
  });
  
  busboy.end(req.rawBody);
};