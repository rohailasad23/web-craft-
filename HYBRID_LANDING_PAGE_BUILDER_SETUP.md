# 🚀 HYBRID LANDING PAGE BUILDER - COMPLETE STARTER SETUP


> [!IMPORTANT]
> The codebase has been refactored since this guide was written. The source
> tree, `backend/.env.example` and `backend/scripts/smoke.js` are the
> authoritative reference — some snippets below are historical and no longer
> match the implementation exactly (error handling, AI provider fallback,
> security middleware and editor saving have all changed).
>
> Quick start:
> ```bash
> npm run setup   # install backend + frontend deps
> npm run dev     # API on :8080, web on :5173
> npm run smoke   # end-to-end regression check
> ```

---

## AI Generate + Manual Editor | 10-14 Days | Production Ready

**Project Type:** SaaS Platform  
**Timeline:** 10-14 Days  
**Revenue:** ₹1500-3000 per site  
**Stack:** React + Node.js + MongoDB  

---

## 📁 FOLDER STRUCTURE

```
hybrid-landing-builder/
│
├── frontend/
│   ├── public/
│   │   ├── index.html
│   │   └── favicon.ico
│   │
│   ├── src/
│   │   ├── components/
│   │   │   ├── Auth/
│   │   │   │   ├── Login.jsx
│   │   │   │   ├── Register.jsx
│   │   │   │   └── ProtectedRoute.jsx
│   │   │   │
│   │   │   ├── Generator/
│   │   │   │   ├── FormInputs.jsx          (Form for business info)
│   │   │   │   ├── GenerateButton.jsx      (Trigger AI generation)
│   │   │   │   └── LoadingSpinner.jsx
│   │   │   │
│   │   │   ├── Editor/
│   │   │   │   ├── MainEditor.jsx          (Main editor component)
│   │   │   │   ├── Sidebar.jsx             (Section manager)
│   │   │   │   ├── Canvas.jsx              (Live preview)
│   │   │   │   ├── Toolbar.jsx             (Edit tools)
│   │   │   │   ├── TextEditor.jsx          (Text editing)
│   │   │   │   ├── ImageEditor.jsx         (Image management)
│   │   │   │   └── ColorPicker.jsx         (Color selection)
│   │   │   │
│   │   │   ├── Dashboard/
│   │   │   │   ├── Dashboard.jsx           (User dashboard)
│   │   │   │   ├── SiteList.jsx            (All sites)
│   │   │   │   ├── SiteCard.jsx            (Individual site card)
│   │   │   │   └── Analytics.jsx           (Revenue/stats)
│   │   │   │
│   │   │   ├── Admin/
│   │   │   │   ├── AdminPanel.jsx
│   │   │   │   ├── UserManagement.jsx
│   │   │   │   └── Analytics.jsx
│   │   │   │
│   │   │   └── Common/
│   │   │       ├── Navbar.jsx
│   │   │       ├── Footer.jsx
│   │   │       └── Modal.jsx
│   │   │
│   │   ├── pages/
│   │   │   ├── Home.jsx
│   │   │   ├── Generate.jsx                (Step 1: Input form)
│   │   │   ├── Editor.jsx                  (Step 2: Edit LP)
│   │   │   ├── Preview.jsx                 (Step 3: Preview)
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Admin.jsx
│   │   │   └── NotFound.jsx
│   │   │
│   │   ├── services/
│   │   │   ├── api.js                      (API calls)
│   │   │   ├── auth.js                     (Auth logic)
│   │   │   └── storage.js                  (Local storage)
│   │   │
│   │   ├── utils/
│   │   │   ├── helpers.js
│   │   │   ├── validators.js
│   │   │   ├── constants.js
│   │   │   └── templates.js                (Template definitions)
│   │   │
│   │   ├── styles/
│   │   │   ├── tailwind.css
│   │   │   ├── editor.css
│   │   │   └── global.css
│   │   │
│   │   ├── App.jsx
│   │   └── index.jsx
│   │
│   ├── .env.example
│   ├── package.json
│   ├── tailwind.config.js
│   ├── vite.config.js
│   └── README.md
│
├── backend/
│   ├── config/
│   │   ├── database.js                    (MongoDB connection)
│   │   ├── constants.js
│   │   └── env.js
│   │
│   ├── models/
│   │   ├── User.js                        (User schema)
│   │   ├── LandingPage.js                 (LP schema)
│   │   └── Payment.js                     (Payment tracking)
│   │
│   ├── routes/
│   │   ├── auth.js                        (Login/Register)
│   │   ├── generator.js                   (AI generation)
│   │   ├── editor.js                      (LP editing)
│   │   ├── pages.js                       (LP management)
│   │   ├── payment.js                     (Payment)
│   │   └── admin.js                       (Admin routes)
│   │
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── generatorController.js         (Claude API calls)
│   │   ├── editorController.js            (LP updates)
│   │   ├── pageController.js
│   │   ├── paymentController.js
│   │   └── adminController.js
│   │
│   ├── middleware/
│   │   ├── auth.js                        (JWT verification)
│   │   ├── validation.js
│   │   ├── errorHandler.js
│   │   └── rateLimit.js
│   │
│   ├── utils/
│   │   ├── ai.js                          (Claude API integration)
│   │   ├── imageGenerator.js              (Unsplash API)
│   │   ├── htmlGenerator.js               (HTML from JSON)
│   │   ├── email.js                       (Email notifications)
│   │   └── payment.js                     (Razorpay integration)
│   │
│   ├── templates/
│   │   ├── template1.js                   (Template definitions)
│   │   ├── template2.js
│   │   ├── template3.js
│   │   ├── template4.js
│   │   └── template5.js
│   │
│   ├── .env.example
│   ├── server.js                          (Main entry)
│   ├── package.json
│   └── README.md
│
├── docs/
│   ├── API.md                             (API documentation)
│   ├── DEVELOPMENT.md                     (Dev guide)
│   ├── DEPLOYMENT.md                      (Deploy guide)
│   └── DATABASE.md                        (DB schema)
│
└── README.md                              (Project overview)
```

---

## 🛠️ INSTALLATION & SETUP

### **Step 1: Clone & Install**

```bash
# Create project directory
mkdir hybrid-landing-builder
cd hybrid-landing-builder

# Frontend setup
cd frontend
npm create vite@latest . -- --template react
npm install
npm install react-router-dom axios tailwindcss lucide-react

# Backend setup
cd ../backend
npm init -y
npm install express mongoose dotenv bcryptjs jsonwebtoken cors axios nodemon
```

### **Step 2: Environment Variables**

**frontend/.env.example:**
```
VITE_API_URL=http://localhost:8080
VITE_APP_NAME=Landing Page Builder
VITE_RAZORPAY_KEY=your_razorpay_key
```

**backend/.env.example:**
```
PORT=8080
MONGODB_URI=mongodb://localhost:27017/landing-builder
JWT_SECRET=your_jwt_secret_key_here
CLAUDE_API_KEY=your_claude_api_key
UNSPLASH_API_KEY=your_unsplash_key
RAZORPAY_KEY_ID=your_razorpay_key
RAZORPAY_KEY_SECRET=your_razorpay_secret
NODE_ENV=development
```

---

## 🗄️ DATABASE MODELS

### **User Model** (backend/models/User.js)
```javascript
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  phone: String,
  businessName: String,
  subscription: { 
    type: String, 
    enum: ['free', 'pro', 'premium'], 
    default: 'free' 
  },
  landingPages: [{ type: mongoose.Schema.Types.ObjectId, ref: 'LandingPage' }],
  totalRevenue: { type: Number, default: 0 },
  totalSitesGenerated: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

module.exports = mongoose.model('User', userSchema);
```

### **Landing Page Model** (backend/models/LandingPage.js)
```javascript
const mongoose = require('mongoose');

const landingPageSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  
  // Original Input
  businessName: String,
  businessType: String,
  description: String,
  targetAudience: String,
  features: [String],
  colorScheme: String,
  
  // Generated Content
  generatedContent: {
    headline: String,
    subheadline: String,
    benefits: [String],
    cta: String,
    images: [String],
    templateUsed: String
  },
  
  // Current State (after manual edits)
  currentState: {
    sections: [
      {
        id: String,
        type: String, // 'hero', 'features', 'cta', etc
        content: mongoose.Schema.Types.Mixed,
        styling: mongoose.Schema.Types.Mixed
      }
    ],
    colors: mongoose.Schema.Types.Mixed,
    fonts: mongoose.Schema.Types.Mixed
  },
  
  // Final Output
  htmlOutput: String,
  publicUrl: String,
  
  // Status & Payment
  status: { 
    type: String, 
    enum: ['draft', 'ready', 'published', 'archived'],
    default: 'draft'
  },
  paymentStatus: { 
    type: String, 
    enum: ['pending', 'paid', 'refunded'],
    default: 'pending'
  },
  amount: { type: Number, default: 1500 },
  paymentId: String,
  
  // Metadata
  editCount: { type: Number, default: 0 },
  views: { type: Number, default: 0 },
  conversions: { type: Number, default: 0 },
  expiresAt: Date,
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('LandingPage', landingPageSchema);
```

---

## 🔌 API ENDPOINTS

### **Authentication**
```
POST   /api/auth/register       - Register user
POST   /api/auth/login          - Login user
POST   /api/auth/logout         - Logout
POST   /api/auth/refresh        - Refresh token
GET    /api/auth/profile        - Get user profile
```

### **Generator (AI)**
```
POST   /api/generator/generate  - Generate LP from form
GET    /api/generator/templates - Get available templates
POST   /api/generator/preview   - Preview generated LP
```

### **Editor**
```
GET    /api/editor/:id          - Get LP for editing
PUT    /api/editor/:id          - Update LP content
PUT    /api/editor/:id/sections - Update specific section
PUT    /api/editor/:id/colors   - Update color scheme
GET    /api/editor/:id/preview  - Live preview
```

### **Pages**
```
GET    /api/pages               - Get all user's pages
GET    /api/pages/:id           - Get specific page
DELETE /api/pages/:id           - Delete page
POST   /api/pages/:id/duplicate - Duplicate page
POST   /api/pages/:id/publish   - Publish page
```

### **Payment**
```
POST   /api/payment/create-order    - Create Razorpay order
POST   /api/payment/verify-order    - Verify payment
GET    /api/payment/status/:id      - Get payment status
```

---

## 💻 FRONTEND COMPONENTS

### **FormInputs.jsx** - Business Info Form
```javascript
import React, { useState } from 'react';
import axios from 'axios';

export default function FormInputs() {
  const [formData, setFormData] = useState({
    businessName: '',
    businessType: 'ecommerce',
    description: '',
    targetAudience: '',
    features: ['', '', ''],
    colorScheme: '#3B82F6'
  });

  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const response = await axios.post(
        `${import.meta.env.VITE_API_URL}/api/generator/generate`,
        formData,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        }
      );
      
      // Redirect to editor with generated page ID
      window.location.href = `/editor/${response.data.pageId}`;
    } catch (error) {
      console.error('Generation failed:', error);
      alert('Failed to generate landing page');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Generate Your Landing Page</h1>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Business Name */}
        <div>
          <label className="block text-sm font-medium mb-2">Business Name *</label>
          <input
            type="text"
            required
            placeholder="E.g., TechNova Solutions"
            className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={formData.businessName}
            onChange={(e) => setFormData({...formData, businessName: e.target.value})}
          />
        </div>

        {/* Business Type */}
        <div>
          <label className="block text-sm font-medium mb-2">Business Type *</label>
          <select
            required
            className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={formData.businessType}
            onChange={(e) => setFormData({...formData, businessType: e.target.value})}
          >
            <option value="ecommerce">E-Commerce</option>
            <option value="service">Service Provider</option>
            <option value="saas">SaaS</option>
            <option value="portfolio">Portfolio</option>
            <option value="agency">Digital Agency</option>
            <option value="nonprofit">Non-Profit</option>
          </select>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium mb-2">Business Description *</label>
          <textarea
            required
            placeholder="Describe your business in 50-200 words..."
            className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 h-24"
            value={formData.description}
            onChange={(e) => setFormData({...formData, description: e.target.value})}
          />
        </div>

        {/* Target Audience */}
        <div>
          <label className="block text-sm font-medium mb-2">Target Audience</label>
          <input
            type="text"
            placeholder="E.g., Entrepreneurs, Small Business Owners"
            className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={formData.targetAudience}
            onChange={(e) => setFormData({...formData, targetAudience: e.target.value})}
          />
        </div>

        {/* Key Features */}
        <div>
          <label className="block text-sm font-medium mb-2">Key Features (Top 3)</label>
          {formData.features.map((feature, idx) => (
            <input
              key={idx}
              type="text"
              placeholder={`Feature ${idx + 1}`}
              className="w-full px-4 py-2 border rounded-lg mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={feature}
              onChange={(e) => {
                const newFeatures = [...formData.features];
                newFeatures[idx] = e.target.value;
                setFormData({...formData, features: newFeatures});
              }}
            />
          ))}
        </div>

        {/* Color Scheme */}
        <div>
          <label className="block text-sm font-medium mb-2">Primary Color</label>
          <div className="flex items-center gap-4">
            <input
              type="color"
              className="w-20 h-10 border rounded-lg cursor-pointer"
              value={formData.colorScheme}
              onChange={(e) => setFormData({...formData, colorScheme: e.target.value})}
            />
            <span className="text-gray-600">{formData.colorScheme}</span>
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-bold py-3 rounded-lg transition"
        >
          {loading ? 'Generating... 🤖' : 'Generate Landing Page ✨'}
        </button>
      </form>
    </div>
  );
}
```

### **MainEditor.jsx** - Drag-Drop Editor
```javascript
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import Sidebar from './Sidebar';
import Canvas from './Canvas';
import Toolbar from './Toolbar';

export default function MainEditor() {
  const { id } = useParams();
  const [lpData, setLpData] = useState(null);
  const [selectedSection, setSelectedSection] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLandingPage();
  }, [id]);

  const fetchLandingPage = async () => {
    try {
      const response = await axios.get(
        `${import.meta.env.VITE_API_URL}/api/editor/${id}`,
        {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        }
      );
      setLpData(response.data);
      setLoading(false);
    } catch (error) {
      console.error('Failed to load page:', error);
      alert('Failed to load landing page');
    }
  };

  const updateSection = async (sectionId, updates) => {
    setSaving(true);
    try {
      const response = await axios.put(
        `${import.meta.env.VITE_API_URL}/api/editor/${id}/sections`,
        { sectionId, updates },
        {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        }
      );
      setLpData(response.data);
    } catch (error) {
      console.error('Failed to update section:', error);
    } finally {
      setSaving(false);
    }
  };

  const updateColors = async (newColors) => {
    setSaving(true);
    try {
      const response = await axios.put(
        `${import.meta.env.VITE_API_URL}/api/editor/${id}/colors`,
        { colors: newColors },
        {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        }
      );
      setLpData(response.data);
    } catch (error) {
      console.error('Failed to update colors:', error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-screen">Loading...</div>;

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <Sidebar 
        lpData={lpData}
        selectedSection={selectedSection}
        setSelectedSection={setSelectedSection}
      />

      {/* Main Editor Area */}
      <div className="flex-1 flex flex-col">
        {/* Toolbar */}
        <Toolbar 
          lpData={lpData}
          updateColors={updateColors}
          saving={saving}
        />

        {/* Canvas/Preview */}
        <Canvas 
          lpData={lpData}
          selectedSection={selectedSection}
          updateSection={updateSection}
        />
      </div>
    </div>
  );
}
```

---

## 🤖 BACKEND - AI INTEGRATION

### **generatorController.js** - Claude API Integration
```javascript
const axios = require('axios');
const LandingPage = require('../models/LandingPage');

exports.generateLandingPage = async (req, res) => {
  try {
    const { businessName, businessType, description, features, targetAudience, colorScheme } = req.body;
    
    // Call Claude API for content generation
    const claudeResponse = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        messages: [
          {
            role: 'user',
            content: `Generate professional marketing copy for a landing page in JSON format only (no markdown, no extra text).

Business Name: ${businessName}
Business Type: ${businessType}
Description: ${description}
Target Audience: ${targetAudience}
Key Features: ${features.join(', ')}

Respond with ONLY valid JSON (no markdown backticks):
{
  "headline": "Catchy main heading (max 10 words)",
  "subheadline": "Supporting subheading (max 15 words)",
  "benefits": ["Benefit 1", "Benefit 2", "Benefit 3"],
  "ctaText": "Call to action button text",
  "featureDescriptions": ["Detailed description for feature 1", "Detailed description for feature 2", "Detailed description for feature 3"],
  "footerText": "Professional footer text"
}

Make it conversion-focused, professional, and compelling.`
          }
        ]
      },
      {
        headers: {
          'x-api-key': process.env.CLAUDE_API_KEY,
          'content-type': 'application/json'
        }
      }
    );

    // Parse Claude response
    const generatedContent = JSON.parse(claudeResponse.data.content[0].text);

    // Get images from Unsplash
    const images = await getImages(businessType, 3);

    // Create template
    const template = createTemplate(
      businessName,
      generatedContent,
      images,
      colorScheme
    );

    // Save to database
    const landingPage = new LandingPage({
      userId: req.user.id,
      businessName,
      businessType,
      description,
      targetAudience,
      features,
      colorScheme,
      generatedContent: {
        ...generatedContent,
        images,
        templateUsed: 'template1'
      },
      currentState: template,
      htmlOutput: generateHTML(template),
      status: 'draft'
    });

    await landingPage.save();

    res.json({
      success: true,
      pageId: landingPage._id,
      preview: landingPage.htmlOutput
    });

  } catch (error) {
    console.error('Generation error:', error);
    res.status(500).json({ error: 'Failed to generate landing page' });
  }
};

async function getImages(businessType, count) {
  // Use Unsplash API to fetch relevant images
  const response = await axios.get('https://api.unsplash.com/search/photos', {
    params: {
      query: businessType,
      per_page: count,
      client_id: process.env.UNSPLASH_API_KEY
    }
  });
  return response.data.results.map(img => img.urls.regular);
}

function createTemplate(businessName, content, images, colorScheme) {
  return {
    sections: [
      {
        id: 'hero',
        type: 'hero',
        content: {
          headline: content.headline,
          subheadline: content.subheadline,
          cta: content.ctaText,
          backgroundImage: images[0]
        },
        styling: { backgroundColor: colorScheme }
      },
      {
        id: 'features',
        type: 'features',
        content: {
          title: 'Why Choose Us?',
          features: content.featureDescriptions.map((desc, idx) => ({
            title: content.benefits[idx],
            description: desc,
            icon: 'star'
          }))
        },
        styling: {}
      },
      {
        id: 'cta',
        type: 'cta',
        content: {
          text: 'Ready to get started?',
          buttonText: content.ctaText
        },
        styling: { backgroundColor: colorScheme }
      },
      {
        id: 'footer',
        type: 'footer',
        content: {
          businessName,
          text: content.footerText
        },
        styling: {}
      }
    ]
  };
}

function generateHTML(template) {
  // Convert template JSON to HTML
  let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Landing Page</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
    .hero { min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .features { padding: 60px 20px; }
    .cta { padding: 80px 20px; text-align: center; }
    .footer { background: #333; color: white; padding: 20px; text-align: center; }
    button { padding: 12px 30px; font-size: 16px; cursor: pointer; border: none; border-radius: 5px; }
  </style>
</head>
<body>`;

  // Add sections to HTML
  template.sections.forEach(section => {
    if (section.type === 'hero') {
      html += `
      <section class="hero" style="background: url('${section.content.backgroundImage}'); background-size: cover;">
        <div style="text-align: center; background: rgba(0,0,0,0.4); padding: 40px; border-radius: 10px; color: white;">
          <h1>${section.content.headline}</h1>
          <p>${section.content.subheadline}</p>
          <button style="background: ${section.styling.backgroundColor}; color: white; margin-top: 20px;">${section.content.cta}</button>
        </div>
      </section>`;
    }
    // Add more section types...
  });

  html += `</body></html>`;
  return html;
}
```

---

## 📊 PAYMENT INTEGRATION

### **paymentController.js** - Razorpay Integration
```javascript
const Razorpay = require('razorpay');
const LandingPage = require('../models/LandingPage');
const Payment = require('../models/Payment');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

exports.createOrder = async (req, res) => {
  try {
    const { pageId, amount } = req.body;

    const options = {
      amount: amount * 100, // Convert to paise
      currency: 'INR',
      receipt: `order_${pageId}`,
      payment_capture: 1
    };

    const order = await razorpay.orders.create(options);

    // Save payment record
    const payment = new Payment({
      userId: req.user.id,
      pageId,
      orderId: order.id,
      amount,
      status: 'pending'
    });
    await payment.save();

    res.json({ orderId: order.id, amount: order.amount });
  } catch (error) {
    console.error('Order creation error:', error);
    res.status(500).json({ error: 'Failed to create order' });
  }
};

exports.verifyPayment = async (req, res) => {
  try {
    const { orderId, paymentId, signature } = req.body;

    const crypto = require('crypto');
    const body = orderId + '|' + paymentId;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');

    if (expectedSignature === signature) {
      // Payment verified
      await Payment.updateOne({ orderId }, { status: 'completed', paymentId });
      await LandingPage.updateOne(
        { _id: req.body.pageId },
        { paymentStatus: 'paid', status: 'published' }
      );

      res.json({ success: true, message: 'Payment verified' });
    } else {
      res.status(400).json({ error: 'Invalid payment signature' });
    }
  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({ error: 'Payment verification failed' });
  }
};
```

---

## 📋 PACKAGE.JSON FILES

### **frontend/package.json**
```json
{
  "name": "hybrid-lp-builder-frontend",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.14.0",
    "axios": "^1.4.0",
    "tailwindcss": "^3.3.0",
    "lucide-react": "^0.263.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.0.0",
    "vite": "^4.3.0",
    "autoprefixer": "^10.4.14",
    "postcss": "^8.4.27"
  }
}
```

### **backend/package.json**
```json
{
  "name": "hybrid-lp-builder-backend",
  "version": "1.0.0",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "mongoose": "^7.2.0",
    "dotenv": "^16.3.1",
    "bcryptjs": "^2.4.3",
    "jsonwebtoken": "^9.0.0",
    "cors": "^2.8.5",
    "axios": "^1.4.0",
    "razorpay": "^2.8.5",
    "nodemailer": "^6.9.4"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  }
}
```

---

## 🚀 QUICK START COMMANDS

```bash
# 1. Setup Frontend
cd frontend
npm install
cp .env.example .env.local
npm run dev

# 2. Setup Backend (new terminal)
cd backend
npm install
cp .env.example .env
npm run dev

# 3. Access
# Frontend: http://localhost:5173
# Backend: http://localhost:8080
```

---

## 📝 NEXT STEPS

1. ✅ Copy all files to your project
2. ✅ Install dependencies (`npm install`)
3. ✅ Setup MongoDB (local or MongoDB Atlas)
4. ✅ Add environment variables
5. ✅ Start development servers
6. ✅ Implement remaining components
7. ✅ Test each feature
8. ✅ Deploy to production

---

## 🎬 10-14 DAY BREAKDOWN

**Days 1-3:** Setup + Form + AI Integration  
**Days 4-7:** Editor + Canvas + Components  
**Days 8-10:** Backend APIs + Database  
**Days 11-14:** Testing + Payment + Launch  

---

**Ready to build? Start with these files! 🔥**
