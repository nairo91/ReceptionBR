const { v2: cloudinary } = require('cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

cloudinary.config(process.env.CLOUDINARY_URL);

const storage = new CloudinaryStorage({
  cloudinary,
  params: { folder: 'receptionbr' }
});

module.exports = multer({ storage });
