# ABIS Backend (Node/Express)

This is a simple Node/Express + Mongoose backend scaffold for the ABIS project.

Quick start:

1. Copy `.env.example` to `.env` and update the `MONGO_URI` if needed.
2. Install dependencies: `npm install`.
3. Start in development: `npm run dev` (requires `nodemon`).
4. API endpoints are mounted under `/api`:
   - `GET /api/documents` - list documents
   - `POST /api/documents` - create document
   - `GET /api/documents/:id` - get document
   - `PATCH /api/documents/:id` - update document
   - `POST /api/documents/:id/set_status` - set status
   - `DELETE /api/documents/:id` - delete document
   - `POST /api/recognize-image` - image recognition placeholder (multipart/form-data `image`)

Compatibility note: Frontend expects a JSON shape like `{ id, trackingNumber, requestDate, residentName, documentType, status, pickupCode, remarks, formFields }` for documents.
