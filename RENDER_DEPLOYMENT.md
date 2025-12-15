# ABIS Backend - Render Deployment Guide

## Prerequisites
1. Push your code to GitHub (backend repository)
2. Create a Render account: https://render.com
3. Connect your GitHub account to Render

## Step 1: Deploy Backend on Render

### Create a New Web Service:
1. Go to https://dashboard.render.com
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repository (ABIS-Backend)
4. Configure:
   - **Name**: `abis-backend`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Plan**: Free (or Paid for better performance)

### Add Environment Variables:
In the Render dashboard for your service:
1. Go to **"Environment"** tab
2. Add these variables:
   ```
   MONGO_URI=your_mongodb_connection_string
   PORT=8000
   NODE_ENV=production
   ADMIN_API_KEY=your_secure_admin_key
   CLOUDINARY_CLOUD_NAME=dtormrsdd
   CLOUDINARY_API_KEY=981833798361425
   CLOUDINARY_API_SECRET=9j-wOKw6FUGvxZavL6Wo9cLs4yI
   ```

3. Click **"Deploy"**

### Note your Backend URL:
After deployment, you'll get a URL like: `https://abis-backend.onrender.com`
Save this - you'll need it for the frontend!

## Potential Issues & Solutions

### If deployment fails:
1. Check build logs in Render dashboard
2. Ensure all dependencies in `package.json` are correct
3. Verify MongoDB connection string is valid

### For Free Tier:
- Service spins down after 15 minutes of inactivity
- Add a keep-alive ping to prevent this
