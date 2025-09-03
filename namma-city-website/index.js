// Minimal HTTP server for the Namma City B2B seller platform.
//
// This implementation uses only Node.js built‑in modules so it can run in
// restricted environments without installing additional NPM packages.  It
// provides a REST API supporting seller registration, login, product
// management, logistics provider lookup and pricing information.  Data is
// stored in memory and will be lost when the process restarts.

const http = require('http');
const { URL } = require('url');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// In‑memory stores
const sellers = [];
const products = [];

// Static logistics provider definitions (see README for details)
const logisticsProviders = [
  {
    id: 'loadshare',
    name: 'Loadshare',
    description: 'First logistics network participant on ONDC; offers hyperlocal, standard, same‑day (SDD) and next‑day (NDD) services for F&B and groceries',
    cities: ['Bangalore', 'Bhubaneswar', 'Chandigarh', 'Dehradun', 'Delhi', 'Guwahati', 'Hyderabad', 'Jaipur', 'Kolkata', 'Lucknow', 'Mumbai', 'Patna', 'Pune', 'Siliguri', 'Trivandrum'],
    baseFeeINR: 30,
  },
  {
    id: 'shiprocket',
    name: 'Shiprocket',
    description: 'Pan‑India ecommerce shipping aggregator; supports hyperlocal and national shipping',
    cities: ['All'],
    baseFeeINR: 50,
  },
  {
    id: 'dunzo',
    name: 'Dunzo',
    description: 'Hyperlocal delivery partner for food and essentials; widely available in metro cities including Bangalore',
    cities: ['Bangalore', 'Delhi', 'Gurugram', 'Hyderabad', 'Chennai', 'Pune'],
    baseFeeINR: 35,
  },
  {
    id: 'ekart',
    name: 'eKart',
    description: 'Flipkart’s logistics arm; provides standard and express e‑commerce deliveries across India',
    cities: ['All'],
    baseFeeINR: 45,
  },
  {
    id: 'ecomexpress',
    name: 'Ecom Express',
    description: 'Pan‑India logistics provider offering hyperlocal, same‑day and next‑day delivery services',
    cities: ['All'],
    baseFeeINR: 40,
  },
  {
    id: 'grab',
    name: 'Grab',
    description: 'Hyperlocal delivery service specialising in quick commerce and F&B delivery',
    cities: ['Bangalore', 'Mumbai', 'Delhi', 'Hyderabad'],
    baseFeeINR: 30,
  },
  {
    id: 'delhivery',
    name: 'Delhivery',
    description: 'Large logistics provider offering express, same‑day and next‑day deliveries across most Indian pin codes',
    cities: ['All'],
    baseFeeINR: 45,
  },
  {
    id: 'dtdc',
    name: 'DTDC',
    description: 'Courier service that joined ONDC in 2023; offers next‑day delivery, pick‑up/drop‑off and reverse logistics with coverage expanding to over 14,700 pin codes',
    cities: ['All'],
    baseFeeINR: 50,
  },
];

// Utility: generate a UUID using Node's crypto module
function generateId() {
  return crypto.randomUUID();
}

// Utility: parse JSON body from request
function parseJson(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        const obj = JSON.parse(data);
        resolve(obj);
      } catch (err) {
        reject(err);
      }
    });
  });
}

// Middleware: basic CORS handling
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-auth-token');
}

// Handler functions for each endpoint

async function handleRegister(req, res) {
  try {
    const body = await parseJson(req);
    const { name, email, password, subscriptionPlan } = body;
    if (!name || !email || !password) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: 'Name, email and password are required' }));
    }
    const existing = sellers.find((s) => s.email === email);
    if (existing) {
      res.statusCode = 409;
      return res.end(JSON.stringify({ error: 'Seller with this email already exists' }));
    }
    const seller = {
      id: generateId(),
      name,
      email,
      password,
      subscriptionPlan: subscriptionPlan || 'monthly',
      createdAt: new Date().toISOString(),
    };
    sellers.push(seller);
    res.statusCode = 201;
    return res.end(JSON.stringify({ message: 'Seller registered successfully', sellerId: seller.id }));
  } catch (err) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
  }
}

async function handleLogin(req, res) {
  try {
    const body = await parseJson(req);
    const { email, password } = body;
    const seller = sellers.find((s) => s.email === email && s.password === password);
    if (!seller) {
      res.statusCode = 401;
      return res.end(JSON.stringify({ error: 'Invalid credentials' }));
    }
    res.statusCode = 200;
    return res.end(JSON.stringify({ message: 'Login successful', token: seller.id }));
  } catch (err) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
  }
}

function authenticateSeller(req) {
  const token = req.headers['x-auth-token'];
  if (!token) return null;
  return sellers.find((s) => s.id === token) || null;
}

async function handleGetProducts(req, res) {
  const seller = authenticateSeller(req);
  if (!seller) {
    res.statusCode = 401;
    return res.end(JSON.stringify({ error: 'Missing or invalid authentication token' }));
  }
  const sellerProducts = products.filter((p) => p.sellerId === seller.id);
  res.statusCode = 200;
  res.end(JSON.stringify({ products: sellerProducts }));
}

async function handleAddProduct(req, res) {
  const seller = authenticateSeller(req);
  if (!seller) {
    res.statusCode = 401;
    return res.end(JSON.stringify({ error: 'Missing or invalid authentication token' }));
  }
  try {
    const body = await parseJson(req);
    const { name, description, price, inventory, imageUrl, deliveryPartnerId } = body;
    if (!name || price === undefined || inventory === undefined) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: 'Name, price and inventory are required' }));
    }
    // Validate that selected deliveryPartnerId exists if provided
    if (deliveryPartnerId && !logisticsProviders.find(lp => lp.id === deliveryPartnerId)) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: 'Invalid deliveryPartnerId' }));
    }
    const product = {
      id: generateId(),
      sellerId: seller.id,
      name,
      description: description || '',
      price: Number(price),
      inventory: Number(inventory),
      imageUrl: imageUrl || '',
      deliveryPartnerId: deliveryPartnerId || null,
      createdAt: new Date().toISOString(),
    };
    products.push(product);
    res.statusCode = 201;
    res.end(JSON.stringify({ message: 'Product created successfully', product }));
  } catch (err) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
  }
}

async function handleUpdateProduct(req, res, id) {
  const seller = authenticateSeller(req);
  if (!seller) {
    res.statusCode = 401;
    return res.end(JSON.stringify({ error: 'Missing or invalid authentication token' }));
  }
  try {
    const product = products.find((p) => p.id === id && p.sellerId === seller.id);
    if (!product) {
      res.statusCode = 404;
      return res.end(JSON.stringify({ error: 'Product not found' }));
    }
    const body = await parseJson(req);
    const { name, description, price, inventory, imageUrl, deliveryPartnerId } = body;
    if (name !== undefined) product.name = name;
    if (description !== undefined) product.description = description;
    if (price !== undefined) product.price = Number(price);
    if (inventory !== undefined) product.inventory = Number(inventory);
    if (imageUrl !== undefined) product.imageUrl = imageUrl;
    if (deliveryPartnerId !== undefined) {
      if (deliveryPartnerId && !logisticsProviders.find(lp => lp.id === deliveryPartnerId)) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: 'Invalid deliveryPartnerId' }));
      }
      product.deliveryPartnerId = deliveryPartnerId;
    }
    res.statusCode = 200;
    res.end(JSON.stringify({ message: 'Product updated successfully', product }));
  } catch (err) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
  }
}

async function handleDeleteProduct(req, res, id) {
  const seller = authenticateSeller(req);
  if (!seller) {
    res.statusCode = 401;
    return res.end(JSON.stringify({ error: 'Missing or invalid authentication token' }));
  }
  const index = products.findIndex((p) => p.id === id && p.sellerId === seller.id);
  if (index === -1) {
    res.statusCode = 404;
    return res.end(JSON.stringify({ error: 'Product not found' }));
  }
  products.splice(index, 1);
  res.statusCode = 200;
  res.end(JSON.stringify({ message: 'Product deleted successfully' }));
}

function handleGetDeliveryProviders(req, res) {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const city = (parsedUrl.searchParams.get('city') || '').trim();
  const providers = logisticsProviders.filter((lp) => {
    if (lp.cities.includes('All')) return true;
    if (!city) return false;
    return lp.cities.map((c) => c.toLowerCase()).includes(city.toLowerCase());
  });
  res.statusCode = 200;
  res.end(JSON.stringify({ providers }));
}

function handlePricing(req, res) {
  const subscriptionFee = {
    plan: 'monthly',
    amountINR: 1000,
    currency: 'INR',
    description: 'Monthly subscription fee for sellers using the Namma City platform. Gives access to product listing, order management and integrations with ONDC logistics partners.'
  };
  const ondcFee = {
    effectiveFrom: '2025-01-01',
    amountINR: 1.5,
    currency: 'INR',
    thresholdINR: 250,
    description: 'Per‑transaction network fee charged by ONDC for each successful transaction above INR 250 (exclusive of taxes). This fee is collected by ONDC and passed through to Seller Network Participants.'
  };
  res.statusCode = 200;
  res.end(JSON.stringify({ subscriptionFee, ondcFee }));
}

// Main request handler
async function requestListener(req, res) {
  setCors(res);
  // Handle preflight CORS requests
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  // Simple JSON content type for API
  res.setHeader('Content-Type', 'application/json');
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  if (req.method === 'GET' && pathname === '/') {
    res.statusCode = 200;
    return res.end(JSON.stringify({ message: 'Welcome to Namma City B2B Seller Platform on ONDC' }));
  }
  // Registration
  if (req.method === 'POST' && pathname === '/api/register') {
    return handleRegister(req, res);
  }
  // Login
  if (req.method === 'POST' && pathname === '/api/login') {
    return handleLogin(req, res);
  }
  // Products list
  if (req.method === 'GET' && pathname === '/api/products') {
    return handleGetProducts(req, res);
  }
  // Add product
  if (req.method === 'POST' && pathname === '/api/products') {
    return handleAddProduct(req, res);
  }
  // Update or delete product by ID
  if ((req.method === 'PUT' || req.method === 'DELETE') && pathname.startsWith('/api/products/')) {
    const parts = pathname.split('/');
    const id = parts[parts.length - 1];
    if (req.method === 'PUT') {
      return handleUpdateProduct(req, res, id);
    }
    if (req.method === 'DELETE') {
      return handleDeleteProduct(req, res, id);
    }
  }
  // Delivery providers
  if (req.method === 'GET' && pathname === '/api/delivery-providers') {
    return handleGetDeliveryProviders(req, res);
  }
  // Pricing info
  if (req.method === 'GET' && pathname === '/api/pricing') {
    return handlePricing(req, res);
  }

  // Public list of all products (marketplace)
  if (req.method === 'GET' && pathname === '/api/all-products') {
    // Include seller name and available logistics providers for demonstration purposes.
    const enrichedProducts = products.map((p) => {
      const seller = sellers.find((s) => s.id === p.sellerId) || { name: 'Unknown' };
      // For simplicity, assign a flat delivery fee of 50 INR for all providers. In a
      // real application you would calculate this based on weight, distance and
      // provider pricing models.
      const providersWithFee = logisticsProviders.map((lp) => ({
        id: lp.id,
        name: lp.name,
        deliveryFeeINR: 50,
      }));
      return {
        ...p,
        sellerName: seller.name,
        deliveryOptions: providersWithFee,
      };
    });
    res.statusCode = 200;
    return res.end(JSON.stringify({ products: enrichedProducts }));
  }

  // Serve static files from the public directory for simple front‑end pages.
  if (req.method === 'GET') {
    // Map root path to index.html
    let filePath;
    if (pathname === '/' || pathname === '/index.html') {
      filePath = 'index.html';
    } else if (pathname === '/register.html') {
      filePath = 'register.html';
    } else if (pathname === '/login.html') {
      filePath = 'login.html';
    } else if (pathname === '/dashboard.html') {
      filePath = 'dashboard.html';
    } else if (pathname.startsWith('/js/')) {
      filePath = pathname.substring(1);
    }
    if (filePath) {
      const fs = require('fs');
      const path = require('path');
      const publicDir = path.join(__dirname, 'public');
      const fullPath = path.join(publicDir, filePath);
      try {
        const content = fs.readFileSync(fullPath);
        // Set content type based on file extension
        if (filePath.endsWith('.html')) {
          res.setHeader('Content-Type', 'text/html');
        } else if (filePath.endsWith('.js')) {
          res.setHeader('Content-Type', 'application/javascript');
        }
        res.statusCode = 200;
        return res.end(content);
      } catch (err) {
        // file not found
      }
    }
  }

  // Marketplace: list all products across sellers with delivery info
  if (req.method === 'GET' && pathname === '/api/marketplace') {
    // Construct marketplace listing
    const entries = products.map(p => {
      const seller = sellers.find(s => s.id === p.sellerId) || { name: 'Unknown' };
      const provider = p.deliveryPartnerId ? logisticsProviders.find(lp => lp.id === p.deliveryPartnerId) : null;
      const deliveryFee = provider ? provider.baseFeeINR : null;
      return {
        id: p.id,
        name: p.name,
        description: p.description,
        priceINR: p.price,
        inventory: p.inventory,
        imageUrl: p.imageUrl,
        sellerName: seller.name,
        deliveryPartnerId: p.deliveryPartnerId,
        deliveryPartnerName: provider ? provider.name : null,
        deliveryFeeINR: deliveryFee,
      };
    });
    res.statusCode = 200;
    return res.end(JSON.stringify({ products: entries }));
  }

  // Static file handling for the website
  if (req.method === 'GET' && !pathname.startsWith('/api')) {
    // Determine the file to serve. Default to index.html.
    let filePath = pathname;
    if (filePath === '/' || filePath === '') {
      filePath = '/index.html';
    }
    // Resolve the file path within the public directory
    // Prevent directory traversal by normalising the path.
    const publicDir = path.join(__dirname, 'public');
    const safePath = path.normalize(filePath).replace(/^\/+/, '');
    const fullPath = path.join(publicDir, safePath);
    // If the path refers to a directory, append index.html
    let finalPath = fullPath;
    try {
      const stat = fs.statSync(finalPath);
      if (stat.isDirectory()) {
        finalPath = path.join(finalPath, 'index.html');
      }
    } catch (e) {
      // Ignore; file may not exist
    }
    fs.readFile(finalPath, (err, data) => {
      if (err) {
        // File not found; continue to 404
        res.statusCode = 404;
        return res.end(JSON.stringify({ error: 'Not Found' }));
      }
      // Determine content type based on extension
      const ext = path.extname(finalPath).toLowerCase();
      let contentType = 'application/octet-stream';
      if (ext === '.html') contentType = 'text/html';
      else if (ext === '.css') contentType = 'text/css';
      else if (ext === '.js') contentType = 'text/javascript';
      else if (ext === '.json') contentType = 'application/json';
      else if (ext === '.png') contentType = 'image/png';
      else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
      else if (ext === '.svg') contentType = 'image/svg+xml';
      res.statusCode = 200;
      // For HTML files we set a different Content-Type and don't wrap JSON
      res.setHeader('Content-Type', contentType);
      return res.end(data);
    });
    return;
  }
  // Unknown route
  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'Not Found' }));
}

// Create and start the HTTP server
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
  requestListener(req, res).catch((err) => {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'Internal Server Error' }));
    console.error(err);
  });
});
server.listen(PORT, () => {
  console.log(`Namma City server listening on port ${PORT}`);
});