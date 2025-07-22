const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '../uploads/plans'));
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const name = Date.now() + ext;
    cb(null, name);
  }
});

function fileFilter(req, file, cb) {
  if (!['.pdf', '.png'].includes(path.extname(file.originalname).toLowerCase())) {
    return cb(new Error('Format invalide'));
  }
  cb(null, true);
}

module.exports = multer({ storage, fileFilter });
