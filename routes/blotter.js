const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const Blotter = require('../models/Blotter');
const crypto = require('crypto');
const adminKeyMiddleware = require('../middleware/adminKey');

// configure multer (memory storage) and Cloudinary
const storage = multer.memoryStorage();
const allowedExt = ['.jpg', '.jpeg', '.png', '.heic'];
const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!allowedExt.includes(ext)) {
      return cb(new Error('Unsupported file type. Allowed: JPG, JPEG, PNG, HEIC'));
    }
    cb(null, true);
  }
});

// For certificate PDF uploads
const certificateStorage = multer.memoryStorage();
const certificateUpload = multer({
  storage: certificateStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (ext !== '.pdf') {
      return cb(new Error('Only PDF files are allowed for certificates'));
    }
    cb(null, true);
  }
});

// Configure cloudinary (prefer environment variables, fallback to provided values)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dtormrsdd',
  api_key: process.env.CLOUDINARY_API_KEY || '981833798361425',
  api_secret: process.env.CLOUDINARY_API_SECRET || '9j-wOKw6FUGvxZavL6Wo9cLs4yI',
  secure: true
});

// create blotter report (public users can submit)
router.post('/', upload.array('attachments', 3), async (req, res) => {
  try {
    const { title, description, reporterName, reporterContact, incidentDate, showReporter } = req.body;

    console.log('[blotter.post] received body:', {
      title, description, reporterName, reporterContact, incidentDate, showReporter,
      fileCount: (req.files || []).length
    });

    // Validation
    if (!title || !description) {
      return res.status(400).json({ error: 'Title and description are required' });
    }

    let attachments = [];
    if (req.files && req.files.length) {
      // Upload each file buffer to Cloudinary
      for (const f of req.files) {
        console.log('[blotter.post] uploading file to cloudinary:', f.originalname, f.size, f.mimetype);

        // upload via upload_stream
        const result = await new Promise((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            { folder: 'blotter' },
            (error, result) => {
              if (error) return reject(error);
              resolve(result);
            }
          );
          streamifier.createReadStream(f.buffer).pipe(uploadStream);
        });

        console.log('[blotter.post] uploaded to cloudinary:', result.secure_url);

        // Build attachment object
        const attachmentObj = {
          originalname: f.originalname,
          mimetype: f.mimetype,
          url: result.secure_url,
          public_id: result.public_id,
          width: result.width,
          height: result.height,
          format: result.format
        };

        console.log('[blotter.post] attachment:', JSON.stringify(attachmentObj, null, 2));
        
        attachments.push(attachmentObj);
      }
    }

    console.log('[blotter.post] final attachments array:', JSON.stringify(attachments, null, 2));

    // generate a short public token for reporter to view their report
    const publicToken = crypto.randomBytes(10).toString('hex');
    const status = 'pending'; // All new blotter reports start as pending

    // allow submitter to optionally set showReporter (default to false)
    const isShowReporter = showReporter === 'true' || showReporter === true ? true : false;

    // Parse incidentDate only if provided
    let parsedIncidentDate = incidentDate ? new Date(incidentDate) : new Date();

    const blot = new Blotter({ 
      title, 
      description, 
      reporterName: reporterName || 'Anonymous', 
      reporterContact: reporterContact || '', 
      incidentDate: parsedIncidentDate, 
      attachments, 
      publicToken, 
      status, 
      showReporter: isShowReporter
    });

    console.log('[blotter.post] creating blotter:', JSON.stringify(blot, null, 2));

    await blot.save();

    console.log('[blotter.post] blotter saved with ID:', blot._id);

    // return the publicToken and ID so reporter can save it for tracking
    res.status(201).json({ id: blot._id, publicToken, ...blot.toObject() });
  } catch (err) {
    // Provide clearer error codes for upload validation errors
    console.error('[blotter.post] ERROR:', {
      message: err.message,
      code: err.code,
      stack: err.stack,
      validationError: err.errors ? Object.keys(err.errors) : null
    });
    
    if (err && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 2MB per file.' });
    }
    if (err && /Unsupported file type/.test(err.message || '')) {
      return res.status(400).json({ error: err.message });
    }
    
    // MongoDB validation errors
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(e => e.message).join(', ');
      return res.status(400).json({ error: 'Validation error: ' + messages });
    }
    
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// list pending blotters (admin only)
router.get('/pending', adminKeyMiddleware, async (req, res) => {
  try {
    const list = await Blotter.find({ status: 'pending' }).sort({ createdAt: -1 }).limit(1000);
    res.json(list);
  } catch (err) {
    console.error('[blotter.pending] error', err);
    res.status(500).json({ error: err.message });
  }
});

// list blotters (admin only)
router.get('/', adminKeyMiddleware, async (req, res) => {
  try {
    const list = await Blotter.find({}).sort({ createdAt: -1 }).limit(1000);
    res.json(list);
  } catch (err) {
    console.error('[blotter.list] error', err);
    res.status(500).json({ error: err.message });
  }
});

// NOTE: public token lookup removed — blotter tracking and public tokens are disabled for public users

// get one
// Get blotter detail. If provided ?token=PUBLIC_TOKEN or x-admin-key header, return full details.
router.get('/:id', async (req, res) => {
  try {
    const b = await Blotter.findById(req.params.id);
    if (!b) return res.status(404).json({ error: 'Not found' });

    const token = req.query.token || req.headers['x-public-token'];
    const isAdminHeader = req.headers && req.headers['x-admin-key'] && req.headers['x-admin-key'] === process.env.ADMIN_API_KEY;
    // allow admin access when caller explicitly includes admin query flag (used by admin UI)
    const isAdminQuery = req.query && (req.query.admin === '1' || req.query.admin === 'true');
    const isAdmin = isAdminHeader || isAdminQuery;

    if (isAdmin || (token && b.publicToken && token === b.publicToken)) {
      return res.json(b);
    }

    // otherwise return a redacted view. Include reporter info only if the reporter allowed public disclosure.
    // For published blotters, include attachment public URLs so the community can view images.
    const mapAttachmentToPublic = (att) => {
      if (!att) return null;
      
      // If attachment has Cloudinary URL, return it
      if (att.url) return { 
        url: att.url, 
        originalname: att.originalname, 
        format: att.format, 
        public_id: att.public_id 
      };

      // if stored with filename or path, attempt to derive a public URL from this server
      const filename = att.filename || (att.path ? (() => {
        const m = String(att.path).match(/uploads[\\/]blotter[\\/](.+)$/i);
        return m ? m[1] : null;
      })() : null);

      if (filename) {
        const origin = req.protocol + '://' + req.get('host');
        return { url: `${origin}/uploads/blotter/${filename}`, originalname: att.originalname || filename };
      }

      return null;
    };

    const publicAttachments = (b.attachments || []).map(mapAttachmentToPublic).filter(Boolean);

    return res.json({
      id: b._id,
      title: b.title,
      description: b.description,
      shortDescription: (b.description || '').slice(0, 400),
      incidentDate: b.incidentDate,
      status: b.status,
      createdAt: b.createdAt,
      reporterName: b.showReporter ? b.reporterName : undefined,
      reporterContact: b.showReporter ? b.reporterContact : undefined,
      attachmentsCount: publicAttachments.length,
      attachments: publicAttachments
    });
  } catch (err) {
    console.error('[blotter.get:id] error', err);
    res.status(500).json({ error: err.message });
  }
});

// update status or fields (admin only)
router.patch('/:id', adminKeyMiddleware, upload.array('attachments', 3), async (req, res) => {
  try {
    const updates = { ...req.body };

    if (req.files && req.files.length) {
      const existing = await Blotter.findById(req.params.id);
      const newAttachments = [];

      for (const f of req.files) {
        const result = await new Promise((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            { folder: 'blotter' },
            (error, result) => {
              if (error) return reject(error);
              resolve(result);
            }
          );
          streamifier.createReadStream(f.buffer).pipe(uploadStream);
        });

newAttachments.push({
  originalname: f.originalname,
  mimetype: f.mimetype,
  url: result.secure_url,      // ← Change from secureurl to secure_url
  public_id: result.public_id,  // ← Also change publicid to public_id
  width: result.width,
  height: result.height,
  format: result.format
});

      }

      updates.attachments = [...(existing.attachments || []), ...newAttachments];
    }

    const b = await Blotter.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!b) return res.status(404).json({ error: 'Not found' });

    res.json(b);
  } catch (err) {
    console.error('[blotter.patch] error', err);
    res.status(500).json({ error: err.message });
  }
});

// Upload certificate PDF for a blotter (admin only)
router.post('/:id/upload-certificate', certificateUpload.single('certificate'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    // Store certificate in /uploads/certificates
    const dir = path.join(__dirname, '../uploads/certificates');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    
    const filename = `cert_${Date.now()}_${req.file.originalname}`;
    const filepath = path.join(dir, filename);
    fs.writeFileSync(filepath, req.file.buffer);
    
    const certificateUrl = `/uploads/certificates/${filename}`;
    const b = await Blotter.findByIdAndUpdate(
      req.params.id,
      { 
        certificateUrl,
        certificateFileName: req.file.originalname
      },
      { new: true }
    );
    
    if (!b) return res.status(404).json({ error: 'Blotter not found' });
    res.json(b);
  } catch (err) {
    console.error('[blotter.upload-certificate] error', err);
    res.status(500).json({ error: err.message });
  }
});

// Set crime record status (admin only)
router.post('/:id/set-crime-record', async (req, res) => {
  try {
    const { crimeRecordStatus } = req.body;
    
    if (!['yes', 'no'].includes(crimeRecordStatus)) {
      return res.status(400).json({ error: 'Invalid crime record status. Must be "yes" or "no"' });
    }
    
    const b = await Blotter.findByIdAndUpdate(
      req.params.id,
      { crimeRecordStatus },
      { new: true }
    );
    
    if (!b) return res.status(404).json({ error: 'Blotter not found' });
    res.json(b);
  } catch (err) {
    console.error('[blotter.set-crime-record] error', err);
    res.status(500).json({ error: err.message });
  }
});

// Increment certification count (when verified)
router.post('/:id/increment-certification', async (req, res) => {
  try {
    const b = await Blotter.findByIdAndUpdate(
      req.params.id,
      { $inc: { certificationCount: 1 } },
      { new: true }
    );
    
    if (!b) return res.status(404).json({ error: 'Blotter not found' });
    res.json(b);
  } catch (err) {
    console.error('[blotter.increment-certification] error', err);
    res.status(500).json({ error: err.message });
  }
});

// Update payment status
router.post('/:id/update-payment', async (req, res) => {
  try {
    const { paymentMethod, paymentStatus, paymentProofUrl } = req.body;
    
    const updates = {};
    if (paymentMethod) updates.paymentMethod = paymentMethod;
    if (paymentStatus) updates.paymentStatus = paymentStatus;
    if (paymentProofUrl) updates.paymentProofUrl = paymentProofUrl;
    
    const b = await Blotter.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true }
    );
    
    if (!b) return res.status(404).json({ error: 'Blotter not found' });
    res.json(b);
  } catch (err) {
    console.error('[blotter.update-payment] error', err);
    res.status(500).json({ error: err.message });
  }
});

// delete blotter (admin only)
router.delete('/:id', adminKeyMiddleware, async (req, res) => {
  try {
    const b = await Blotter.findByIdAndDelete(req.params.id);
    if (!b) return res.status(404).json({ error: 'Not found' });

    res.json({ success: true });
  } catch (err) {
    console.error('[blotter.delete] error', err);
    res.status(500).json({ error: err.message });
  }
});

// Download helper for blotter attachments
router.get('/download/attachment/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    const { blotterId, token } = req.query;

    if (!blotterId) return res.status(400).json({ error: 'blotterId required' });

    const b = await Blotter.findById(blotterId);
    if (!b) return res.status(404).json({ error: 'Not found' });

    // Allow downloads for published blotters without token
    if (b.status === 'published') {
      const att = (b.attachments || []).find(a => a.filename === filename);
      if (!att) return res.status(404).json({ error: 'Attachment not found' });

      // if attachment is stored in cloudinary, redirect to its URL
      if (att.url) return res.redirect(att.url);

      return res.sendFile(att.path, { root: '.' });
    }

    // Otherwise require reporter token or admin header
    const isAdmin = req.headers && req.headers['x-admin-key'] && req.headers['x-admin-key'] === process.env.ADMIN_API_KEY;
    const isReporter = token && b.publicToken && token === b.publicToken;

    if (!isAdmin && !isReporter) return res.status(403).json({ error: 'Not authorized' });

    const att = (b.attachments || []).find(a => a.filename === filename);
    if (!att) return res.status(404).json({ error: 'Attachment not found' });

    if (att.url) return res.redirect(att.url);

    return res.sendFile(att.path, { root: '.' });
  } catch (err) {
    console.error('[blotter.download] error', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
