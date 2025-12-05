// index.js - Cloudflare Workers with Rate Limiting
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

// Configuration
const CONFIG = {
  BRAND: "BLACK 🖤 ENTHEM",
  OWNER: "@BlackEnthemOwner",
  TELEGRAM: "https://t.me/blackenthem_1",
  FREE_LIMIT: 100,
  SOURCE_APIS: {
    mobile: {
      url: "https://gauravapi.gauravyt492.workers.dev/?mobile=",
      regex: /^[6-9]\d{9}$/,
      error: "Invalid Indian Mobile Number"
    },
    email: {
      url: "https://another-api.com/email?q=",
      regex: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
      error: "Invalid Email Address"
    }
  }
}

// KV Namespace for storing usage (setup in Cloudflare dashboard)
// const USAGE_KV = API_USAGE

// Premium error response
function premiumError() {
  return new Response(JSON.stringify({
    error: "API Down - Buy Premium",
    message: "This API service is currently unavailable for free users",
    contact: `DM ${CONFIG.OWNER} for premium access with custom name`,
    telegram: CONFIG.TELEGRAM,
    status: 403,
    BRAND: CONFIG.BRAND
  }, null, 2), {
    status: 403,
    headers: {
      'Content-Type': 'application/json',
      'X-Brand': CONFIG.BRAND
    }
  })
}

// Get client identifier
function getClientId(request) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown'
  const userAgent = request.headers.get('User-Agent') || ''
  return btoa(ip + userAgent.substring(0, 20)).replace(/[^a-z0-9]/gi, '')
}

// Check rate limit (simplified - in production use KV)
let usageCache = {}

function checkRateLimit(clientId) {
  const now = Date.now()
  const dayInMs = 24 * 60 * 60 * 1000
  
  if (!usageCache[clientId]) {
    usageCache[clientId] = { count: 0, resetTime: now + dayInMs }
  }
  
  // Reset after 24 hours
  if (now > usageCache[clientId].resetTime) {
    usageCache[clientId] = { count: 0, resetTime: now + dayInMs }
  }
  
  usageCache[clientId].count++
  
  return usageCache[clientId].count <= CONFIG.FREE_LIMIT
}

// Clean and validate input
function cleanNumber(number) {
  if (!number) return null
  let cleaned = number.toString().trim()
  if (cleaned.startsWith('+91')) cleaned = cleaned.substring(3)
  if (cleaned.startsWith('91') && cleaned.length === 12) cleaned = cleaned.substring(2)
  return cleaned.replace(/\D/g, '')
}

// Fetch from source API
async function fetchFromSource(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      cf: { cacheTtl: 300 }
    })
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }
    
    return await response.json()
  } catch (error) {
    console.error('Source API error:', error)
    return null
  }
}

// Success response
function successResponse(data, remaining) {
  return new Response(JSON.stringify({
    data: {
      success: true,
      result: data,
      brand: CONFIG.BRAND,
      timestamp: new Date().toISOString(),
      searches_remaining: remaining
    }
  }, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'X-Brand': CONFIG.BRAND,
      'Cache-Control': 'public, max-age=60'
    }
  })
}

// Error response
function errorResponse(message, status = 400) {
  return new Response(JSON.stringify({
    success: false,
    error: message,
    brand: CONFIG.BRAND
  }, null, 2), {
    status: status,
    headers: { 'Content-Type': 'application/json' }
  })
}

// Main request handler
async function handleRequest(request) {
  const url = new URL(request.url)
  const path = url.pathname
  
  // Only allow GET
  if (request.method !== 'GET') {
    return errorResponse('Method not allowed', 405)
  }
  
  // Home page
  if (path === '/' && !url.search) {
    return new Response(JSON.stringify({
      message: "Secure API Services",
      brand: CONFIG.BRAND,
      note: "Add query parameters to use",
      example: "/?num=XXXXXXXXXX"
    }, null, 2), {
      headers: { 'Content-Type': 'application/json' }
    })
  }
  
  // Check for mobile number
  const mobileParam = url.searchParams.get('num') || 
                      url.searchParams.get('mobile') || 
                      url.searchParams.get('number')
  
  // Check rate limit
  const clientId = getClientId(request)
  if (!checkRateLimit(clientId)) {
    return premiumError()
  }
  
  const remaining = CONFIG.FREE_LIMIT - usageCache[clientId].count
  
  // Handle mobile lookup
  if (mobileParam) {
    const cleaned = cleanNumber(mobileParam)
    
    if (!cleaned || !CONFIG.SOURCE_APIS.mobile.regex.test(cleaned)) {
      return errorResponse(CONFIG.SOURCE_APIS.mobile.error)
    }
    
    const sourceData = await fetchFromSource(CONFIG.SOURCE_APIS.mobile.url + cleaned)
    
    if (!sourceData) {
      return errorResponse("No data found", 404)
    }
    
    // Extract result
    let result = []
    if (sourceData.data && sourceData.data.result) {
      result = sourceData.data.result
    } else if (sourceData.result) {
      result = sourceData.result
    }
    
    if (result.length === 0) {
      return errorResponse("No information available", 404)
    }
    
    return successResponse(result, remaining)
  }
  
  // Check for email
  const emailParam = url.searchParams.get('email')
  if (emailParam && CONFIG.SOURCE_APIS.email) {
    if (!CONFIG.SOURCE_APIS.email.regex.test(emailParam)) {
      return errorResponse(CONFIG.SOURCE_APIS.email.error)
    }
    
    // Here you would fetch from email API
    return errorResponse("Email lookup coming soon", 501)
  }
  
  // No valid parameters
  return errorResponse("Missing or invalid search parameter", 400)
}
