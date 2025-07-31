const { v2: cloudinary } = require('cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

cloudinary.config(process.env.CLOUDINARY_URL);

const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder: 'receptionbr',
    resource_type: file.mimetype.startsWith('video/') ? 'video' : 'image',
  })
});

module.exports = multer({ storage });
