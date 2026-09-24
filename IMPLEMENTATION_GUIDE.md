# 🚀 HYBRID LANDING PAGE BUILDER - COMPLETE IMPLEMENTATION GUIDE


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

## Step-by-Step Instructions | 10-14 Days to Launch

---

## 📋 TABLE OF CONTENTS
1. Setup & Installation
2. Day-by-Day Breakdown
3. Code Implementation
4. API Testing
5. Deployment
6. Troubleshooting

---

## ⚙️ SETUP & INSTALLATION

### **Prerequisites:**
```bash
# Install Node.js (v16+)
# Install MongoDB (local or get MongoDB Atlas URL)
# Install VS Code or preferred editor
# Get API Keys:
  - Claude API Key: https://console.anthropic.com
  - Unsplash API Key: https://unsplash.com/oauth/applications
  - Razorpay Account: https://razorpay.com
```

### **Step 1: Create Project Directories**

```bash
# Create root directory
mkdir hybrid-landing-builder
cd hybrid-landing-builder

# Create frontend and backend folders
mkdir frontend backend docs
```

### **Step 2: Setup Frontend**

```bash
cd frontend

# Create Vite React project
npm create vite@latest . -- --template react

# Install dependencies
npm install
npm install react-router-dom axios tailwindcss lucide-react

# Create .env.local file
cat > .env.local << EOF
VITE_API_URL=http://localhost:8080
VITE_APP_NAME=Landing Page Builder
EOF

# Test that it works
npm run dev
```

### **Step 3: Setup Backend**

```bash
cd ../backend

# Initialize npm project
npm init -y

# Install dependencies
npm install express mongoose dotenv bcryptjs jsonwebtoken cors axios nodemailer razorpay nodemon

# Create .env file
cat > .env << EOF
PORT=8080
MONGODB_URI=mongodb://localhost:27017/landing-builder
JWT_SECRET=your-super-secret-jwt-key-change-this
CLAUDE_API_KEY=sk-ant-xxxxx (Get from Anthropic)
UNSPLASH_API_KEY=xxxxx (Get from Unsplash)
RAZORPAY_KEY_ID=xxxxx
RAZORPAY_KEY_SECRET=xxxxx
NODE_ENV=development
EOF

# Create start script
npm install -D nodemon
```

---

## 📅 DAY-BY-DAY BREAKDOWN

### **DAYS 1-2: Setup + Database Models**

**Tasks:**
- [x] Project structure created
- [x] Dependencies installed
- [x] Database connected
- [ ] Create User model (backend/models/User.js)
- [ ] Create LandingPage model (backend/models/LandingPage.js)
- [ ] Create Payment model (backend/models/Payment.js)

**Code to Add:**

**backend/models/User.js:**
```javascript
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  phone: String,
  businessName: String,
  subscription: { type: String, default: 'free' },
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

---

### **DAYS 3-4: Authentication System**

**Tasks:**
- [ ] Setup authentication routes (backend/routes/auth.js)
- [ ] Setup auth middleware (backend/middleware/auth.js)
- [ ] Create Login page (frontend/src/pages/Login.jsx)
- [ ] Create Register page (frontend/src/pages/Register.jsx)
- [ ] Test login/register flow

**Test Commands:**
```bash
# Test Register
curl -X POST http://localhost:8080/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"John","email":"john@example.com","password":"123456","confirmPassword":"123456"}'

# Test Login
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"john@example.com","password":"123456"}'
```

---

### **DAYS 5-6: Form & AI Generation**

**Tasks:**
- [ ] Create FormInputs component (frontend/src/components/Generator/FormInputs.jsx)
- [ ] Create Generator routes (backend/routes/generator.js)
- [ ] Test Claude API integration
- [ ] Test Unsplash image fetching

**Test Claude Integration:**
```bash
# Test generation endpoint
curl -X POST http://localhost:8080/api/generator/generate \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "businessName":"My Shop",
    "businessType":"ecommerce",
    "description":"We sell high-quality products",
    "features":["Fast delivery","Quality products","Great support"]
  }'
```

---

### **DAYS 7-8: Editor Component**

**Tasks:**
- [ ] Create MainEditor component (frontend/src/components/Editor/MainEditor.jsx)
- [ ] Create Sidebar component (frontend/src/components/Editor/Sidebar.jsx)
- [ ] Create Canvas component (frontend/src/components/Editor/Canvas.jsx)
- [ ] Create TextEditor component
- [ ] Create ColorPicker component
- [ ] Setup editor routes (backend/routes/editor.js)

**Key Features:**
- Drag-drop sections
- Text editing
- Color changing
- Live preview

---

### **DAYS 9-10: Backend APIs & Database**

**Tasks:**
- [ ] Create pages routes (backend/routes/pages.js)
- [ ] Implement CRUD operations
- [ ] Setup payment routes (backend/routes/payment.js)
- [ ] Implement Razorpay integration
- [ ] Test all API endpoints

**Test Endpoints:**
```bash
# Get all user pages
curl http://localhost:8080/api/pages \
  -H "Authorization: Bearer YOUR_TOKEN"

# Create payment order
curl -X POST http://localhost:8080/api/payment/create-order \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"pageId":"PAGE_ID","amount":1500}'
```

---

### **DAYS 11-12: Dashboard & UI Polish**

**Tasks:**
- [ ] Create Dashboard page
- [ ] Create SiteCard component
- [ ] Create Analytics dashboard
- [ ] Add Navbar component
- [ ] Add responsive design
- [ ] Test all pages

---

### **DAYS 13-14: Testing, Optimization & Deployment**

**Tasks:**
- [ ] End-to-end testing
- [ ] Fix bugs
- [ ] Performance optimization
- [ ] Security audit
- [ ] Deploy frontend to Vercel
- [ ] Deploy backend to Railway/Render
- [ ] Setup custom domain
- [ ] LAUNCH! 🚀

---

## 💻 QUICK COPY-PASTE CODE SNIPPETS

### **server.js Setup**
```javascript
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ Error:', err));

app.get('/health', (req, res) => {
  res.json({ status: 'Running' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
```

### **Simple Login Component**
```javascript
import { useState } from 'react';
import axios from 'axios';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await axios.post(
        `${import.meta.env.VITE_API_URL}/api/auth/login`,
        { email, password }
      );
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('user', JSON.stringify(response.data.user));
      window.location.href = '/dashboard';
    } catch (error) {
      alert('Login failed: ' + error.response?.data?.error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-20">
      <form onSubmit={handleSubmit} className="bg-white p-8 rounded-lg shadow">
        <h1 className="text-2xl font-bold mb-6">Login</h1>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-4 py-2 border rounded mb-4"
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-4 py-2 border rounded mb-6"
          required
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
        >
          {loading ? 'Logging in...' : 'Login'}
        </button>
      </form>
    </div>
  );
}
```

---

## 🧪 API TESTING CHECKLIST

### **Authentication Endpoints:**
- [ ] POST /api/auth/register
- [ ] POST /api/auth/login
- [ ] GET /api/auth/profile

### **Generator Endpoints:**
- [ ] POST /api/generator/generate
- [ ] GET /api/generator/templates
- [ ] POST /api/generator/preview

### **Editor Endpoints:**
- [ ] GET /api/editor/:id
- [ ] PUT /api/editor/:id
- [ ] PUT /api/editor/:id/sections

### **Payment Endpoints:**
- [ ] POST /api/payment/create-order
- [ ] POST /api/payment/verify-order

---

## 📦 DEPLOYMENT GUIDES

### **Deploy Frontend to Vercel:**
```bash
cd frontend
npm install -g vercel
vercel
# Follow prompts, connect your GitHub account
```

### **Deploy Backend to Railway:**
```bash
# 1. Go to railway.app
# 2. Connect GitHub
# 3. Select backend folder
# 4. Add environment variables
# 5. Deploy
```

### **Setup Custom Domain:**
```bash
# In Vercel: Settings → Domains → Add custom domain
# In Railway: Settings → Custom Domain
# Update DNS records with provider
```

---

## 🐛 TROUBLESHOOTING

### **Issue: MongoDB Connection Failed**
```javascript
// Check connection string
// Make sure MongoDB is running
// Try: mongodb://localhost:27017/landing-builder
// Or use MongoDB Atlas free tier
```

### **Issue: CORS Error**
```javascript
// Add to backend/server.js
app.use(cors({
  origin: ['http://localhost:5173', 'https://yourdomain.com'],
  credentials: true
}));
```

### **Issue: Claude API 401 Error**
```javascript
// Check API key is correct
// Make sure key starts with sk-ant-
// Check key has correct permissions
```

### **Issue: Token Invalid**
```javascript
// Make sure JWT_SECRET is same in .env
// Check token expiry time
// Clear localStorage and re-login
```

---

## ✅ FINAL CHECKLIST

- [ ] All 3 pages work (Form, Editor, Dashboard)
- [ ] Login/Register working
- [ ] AI generation working
- [ ] Payment system working
- [ ] Responsive design working
- [ ] Fast load times
- [ ] No console errors
- [ ] Security headers added
- [ ] Rate limiting enabled
- [ ] Error handling implemented
- [ ] Analytics tracking set up
- [ ] Documentation complete
- [ ] Ready for launch! 🎉

---

## 🚀 LAUNCH CHECKLIST

```bash
# Before going live:

# 1. Test full flow
- Create account
- Generate LP
- Edit LP
- Make payment
- Get LP URL

# 2. Load testing
- Test with 100+ simultaneous users
- Check server response times
- Monitor database performance

# 3. Security audit
- Enable HTTPS
- Add rate limiting
- Implement CORS properly
- Sanitize inputs
- Validate outputs

# 4. Monitor & backup
- Setup error logging (Sentry)
- Setup uptime monitoring (Uptime Robot)
- Automated backups
- 24/7 support ready

# 5. Go live!
- Deploy frontend
- Deploy backend
- Update DNS
- Monitor first 24 hours
- Be ready to fix issues

# 6. Marketing
- Create landing page
- Social media posts
- Email campaign
- Partner outreach
- Start getting customers!
```

---

## 💰 PRICING STRATEGY

### **Recommended:**
- **Basic LP:** ₹500-800
- **Professional LP:** ₹1000-1500
- **Premium LP:** ₹1500-2000
- **Monthly subscription:** ₹999/month (unlimited)

### **Why This Works:**
- One-time payment = quick revenue
- Subscription = recurring revenue
- Premium = high margins
- Customers feel they get value

---

## 📊 SUCCESS METRICS

Track these to know you're on track:

1. **User Acquisition:**
   - Target: 10 users/day by week 4
   - Target: 100 users by month 2

2. **Conversion:**
   - Form completion: 70%+
   - Payment success: 85%+
   - Customer retention: 30%+

3. **Revenue:**
   - Day 1: ₹0
   - Week 1: ₹5,000-10,000
   - Month 1: ₹80,000-100,000
   - Month 2: ₹150,000+

4. **Performance:**
   - Page load time: < 2 seconds
   - API response: < 500ms
   - Uptime: 99.5%+

---

## 📞 SUPPORT

### **Getting Help:**
- Check error message carefully
- Search documentation
- Ask in relevant forums
- Reach out on Twitter/GitHub

### **Common Solutions:**
1. Clear cache and cookies
2. Check browser console for errors
3. Verify API keys
4. Restart servers
5. Check MongoDB connection

---

**You've got this! 🚀 In 14 days, you'll have a functioning revenue-generating platform!**
