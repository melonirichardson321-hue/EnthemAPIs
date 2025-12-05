// index.js - Only 2 APIs with hidden credits
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

// Configuration
const CONFIG = {
  BRAND: "BLACK 🖤 ENTHEM",
  OWNER: "@BlackEnthemOwner",
  TELEGRAM: "https://t.me/blackenthem_1",
  FREE_LIMIT: 100,
  
  // Only 2 hidden source APIs
  HIDDEN_APIS: {
    "gaurav": {
      url: "https://gauravapi.gauravyt492.workers.dev/?mobile={query}"
    },
    "veeru": {
      url: "https://veerulookup.onrender.com/search_phone?number={query}"
    }
  }
}

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

// Rate limiting
let usageData = {}

function checkRateLimit(ip) {
  const now = Date.now()
  const dayInMs = 86400000
  
  if (!usageData[ip]) {
    usageData[ip] = { count: 0, resetTime: now + dayInMs }
  }
  
  const user = usageData[ip]
  
  // Reset after 24 hours
  if (now > user.resetTime) {
    user.count = 0
    user.resetTime = now + dayInMs
  }
  
  user.count++
  
  // Clean old data occasionally
  if (Math.random() < 0.01) {
    for (const key in usageData) {
      if (now > usageData[key].resetTime + dayInMs) {
        delete usageData[key]
      }
    }
  }
  
  return {
    allowed: user.count <= CONFIG.FREE_LIMIT,
    remaining: Math.max(0, CONFIG.FREE_LIMIT - user.count)
  }
}

// Clean mobile number
function cleanNumber(number) {
  if (!number) return null
  let cleaned = number.toString().trim()
  if (cleaned.startsWith('+91')) cleaned = cleaned.substring(3)
  if (cleaned.startsWith('91') && cleaned.length === 12) cleaned = cleaned.substring(2)
  return cleaned.replace(/\D/g, '')
}

// Validate Indian mobile number
function validateMobile(number) {
  const cleaned = cleanNumber(number)
  const regex = /^[6-9]\d{9}$/
  return cleaned && regex.test(cleaned) ? cleaned : null
}

// Fetch from API with timeout
async function fetchFromAPI(apiUrl, mobileNumber) {
  try {
    const url = apiUrl.replace('{query}', mobileNumber)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      signal: controller.signal,
      cf: { cacheTtl: 300 }
    })
    
    clearTimeout(timeout)
    
    if (!response.ok) {
      return null
    }
    
    return await response.json()
  } catch (error) {
    console.error('API fetch error:', error.message)
    return null
  }
}

// Remove credit field from response (hide anshapi)
function removeCredits(data) {
  if (typeof data !== 'object' || data === null) return data
  
  // Remove credit/credits/anshapi fields
  const cleaned = { ...data }
  
  if (cleaned.credit) delete cleaned.credit
  if (cleaned.credits) delete cleaned.credits
  if (cleaned.source) delete cleaned.source
  
  // Recursively clean nested objects
  for (const key in cleaned) {
    if (typeof cleaned[key] === 'object') {
      cleaned[key] = removeCredits(cleaned[key])
    } else if (typeof cleaned[key] === 'string') {
      // Remove any mention of anshapi from strings
      cleaned[key] = cleaned[key].replace(/anshapi/gi, '').trim()
    }
  }
  
  return cleaned
}

// Extract data from API response
function extractData(apiResponse, apiType) {
  if (!apiResponse) return null
  
  // Remove credits first
  const cleanedResponse = removeCredits(apiResponse)
  
  // Try different response formats
  if (apiType === 'gaurav') {
    // Gaurav API format
    if (cleanedResponse.data && Array.isArray(cleanedResponse.data.result)) {
      return cleanedResponse.data.result
    }
  } else if (apiType === 'veeru') {
    // Veeru API format - remove credit field
    if (Array.isArray(cleanedResponse)) {
      return cleanedResponse
    } else if (cleanedResponse.result && Array.isArray(cleanedResponse.result)) {
      return cleanedResponse.result
    } else if (cleanedResponse.data && Array.isArray(cleanedResponse.data)) {
      return cleanedResponse.data
    }
  }
  
  return null
}

// Try multiple APIs
async function tryAllAPIs(mobileNumber) {
  const apis = Object.entries(CONFIG.HIDDEN_APIS)
  
  for (const [apiName, apiConfig] of apis) {
    try {
      const data = await fetchFromAPI(apiConfig.url, mobileNumber)
      if (data) {
        const extracted = extractData(data, apiName)
        if (extracted && extracted.length > 0) {
          return {
            success: true,
            data: extracted,
            source: apiName
          }
        }
      }
    } catch (error) {
      console.log(`API ${apiName} failed:`, error.message)
    }
  }
  
  return { success: false, error: "No data found from any source" }
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

// Home page
function homeResponse() {
  return new Response(JSON.stringify({
    message: "Secure Mobile Lookup API",
    brand: CONFIG.BRAND,
    usage: "Add ?num=XXXXXXXXXX to URL",
    example: "/?num=7070096514",
    limit: `${CONFIG.FREE_LIMIT} free searches per day`,
    contact: CONFIG.OWNER
  }, null, 2), {
    headers: { 'Content-Type': 'application/json' }
  })
}

// Main handler
async function handleRequest(request) {
  const url = new URL(request.url)
  
  // Home page
  if (url.pathname === '/' && !url.searchParams.has('num') && !url.searchParams.has('mobile')) {
    return homeResponse()
  }
  
  // Get mobile number
  const mobileParam = url.searchParams.get('num') || url.searchParams.get('mobile')
  
  if (!mobileParam) {
    return errorResponse("Missing mobile number. Use ?num=XXXXXXXXXX")
  }
  
  // Validate
  const mobileNumber = validateMobile(mobileParam)
  if (!mobileNumber) {
    return errorResponse("Invalid Indian mobile number. Must be 10 digits starting with 6-9")
  }
  
  // Rate limiting
  const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown'
  const rateLimit = checkRateLimit(clientIP)
  
  if (!rateLimit.allowed) {
    return premiumError()
  }
  
  // Fetch data from APIs
  const result = await tryAllAPIs(mobileNumber)
  
  if (!result.success) {
    return errorResponse("No information found for this number", 404)
  }
  
  return successResponse(result.data, rateLimit.remaining)
}

// Export for ES modules
export default {
  fetch: handleRequest
}
