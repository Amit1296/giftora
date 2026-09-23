# Giftora Website Performance Analysis

**Date:** September 6, 2026  
**URL:** https://gift-ora.online/  
**Lighthouse Version:** 13.4.1

---

## Executive Summary

The Giftora website has **moderate performance** with significant opportunities for improvement. While the Speed Index is good, critical metrics like CLS and TBT need immediate attention.

| Metric | Value | Score | Status |
|--------|-------|-------|--------|
| First Contentful Paint (FCP) | 1.8s | 0.89 | ✅ Good |
| Largest Contentful Paint (LCP) | 3.2s | 0.74 | ⚠️ Needs Improvement |
| Speed Index | 2.4s | 0.98 | ✅ Excellent |
| Total Blocking Time (TBT) | 1,160ms | 0.22 | ❌ Poor |
| Max Potential FID | 360ms | 0.23 | ❌ Poor |
| Cumulative Layout Shift (CLS) | 0.49 | 0.17 | ❌ Poor |
| Time to Interactive (TTI) | 3.9s | 0.89 | ✅ Good |
| Server Response Time | 37ms | 1.0 | ✅ Excellent |

---

## Critical Issues

### 1. Cumulative Layout Shift (CLS) - 0.49 ❌

**Impact:** High visual instability, poor user experience

**Layout Shift Culprits:**
- Hero section (`section#home`) - Major shift contributor
- Hero CTA buttons (`div.hero-cta`) - 0.032 shift score
- Delivery check hint (`span.delivery-check-hint`) - Minor shift

**Root Causes:**
- Images without explicit dimensions
- Dynamic content loading after initial render
- Font loading causing text reflow

### 2. Total Blocking Time (TBT) - 1,160ms ❌

**Impact:** Page feels unresponsive during load

**Long Tasks Breakdown:**
| Source | Duration | Start Time |
|--------|----------|------------|
| Main document | 892ms | 938ms |
| js/script.min.js | 363ms | 2873ms |
| js/script.min.js | 243ms | 3684ms |
| js/script.min.js | 213ms | 3355ms |
| Unattributable | 165ms | 2038ms |
| js/script.min.js | 150ms | 2723ms |
| js/script.min.js | 120ms | 2573ms |
| js/script.min.js | 119ms | 3236ms |
| js/script.min.js | 116ms | 3568ms |

**Total:** 14 long tasks, 2,819ms total blocking time

### 3. Main Thread Work - 9.5s ❌

**Breakdown:**
| Category | Duration | Percentage |
|----------|----------|------------|
| Style & Layout | 4,591ms | 48.1% |
| Other | 2,257ms | 23.7% |
| Rendering | 2,100ms | 22.0% |
| Script Evaluation | 307ms | 3.2% |
| Parse HTML & CSS | 216ms | 2.3% |
| Script Parsing | 48ms | 0.5% |
| Garbage Collection | 13ms | 0.1% |

---

## Performance Opportunities

### 1. Cache Policy Optimization - Potential Savings: 162 KiB ❌

**Resources with poor cache policies:**
| Resource | Size | Wasted Bytes |
|----------|------|--------------|
| fraunces-latin.woff2 | 68 KB | 27 KB |
| occasion-wedding.webp | 39 KB | 16 KB |
| products.js | 38 KB | 15 KB |
| occasion-birthday.webp | 35 KB | 14 KB |
| occasion-gifts.webp | 34 KB | 13 KB |
| teacher-books.jpg | 28 KB | 11 KB |
| occasion-anniversary.webp | 28 KB | 11 KB |
| dancing-script-latin.woff2 | 26 KB | 11 KB |
| occasion-housewarming.webp | 20 KB | 8 KB |
| script.min.js | 19 KB | 8 KB |

**Recommendation:** Extend cache lifetime for static assets to 1 year (31536000s)

### 2. Image Optimization - Potential Savings: 79 KiB ⚠️

**Issues:**
- Slider images not using modern formats
- `teacher-books.jpg` could be converted to WebP
- Missing lazy loading on below-the-fold images

**Affected Images:**
- `occasion-birthday.webp` - Slider image
- `occasion-gifts.webp` - Slider image
- `teacher-books.jpg` - Premium banner

### 3. Render-Blocking Resources - 760ms Delay ⚠️

**Blocking Resources:**
| Resource | Size | Delay |
|----------|------|-------|
| css/fonts.css | 1.4 KB | 455ms |
| css/style.min.css | 15.7 KB | 305ms |

**Recommendation:** 
- Inline critical CSS
- Defer non-critical CSS
- Use `<link rel="preload">` for fonts

### 4. Forced Reflow - 49.6ms ❌

**Source:** `js/script.min.js` (line 37274)

**Impact:** JavaScript causing forced layout recalculations

---

## Resource Analysis

### Total Page Weight: 562 KiB ✅

**Largest Resources:**
| Resource | Size | Type |
|----------|------|------|
| /api/products | 147 KB | API Response |
| fraunces-latin.woff2 | 68 KB | Font |
| occasion-wedding.webp | 39 KB | Image |
| products.js | 38 KB | Script |
| occasion-birthday.webp | 35 KB | Image |
| occasion-gifts.webp | 34 KB | Image |
| teacher-books.jpg | 28 KB | Image |
| occasion-anniversary.webp | 28 KB | Image |
| dancing-script-latin.woff2 | 26 KB | Font |
| occasion-housewarming.webp | 20 KB | Image |

### Network Requests: 31

**By Type:**
- Scripts: 9
- Stylesheets: 2
- Fonts: 6
- Images: 10+
- API Calls: 2+

---

## Recommendations

### Immediate Actions (High Impact)

1. **Fix Layout Shifts**
   - Add explicit `width` and `height` attributes to all images
   - Reserve space for dynamic content with CSS `aspect-ratio`
   - Use `font-display: optional` for web fonts

2. **Reduce Main Thread Work**
   - Defer non-critical JavaScript
   - Use `requestIdleCallback` for heavy computations
   - Break up long tasks with `setTimeout` or `requestAnimationFrame`

3. **Optimize Caching**
   - Set `Cache-Control: public, max-age=31536000` for static assets
   - Implement content hashing for cache busting

### Short-term Actions (Medium Impact)

4. **Optimize Images**
   - Convert all images to WebP/AVIF formats
   - Implement responsive images with `srcset`
   - Add `loading="lazy"` to below-the-fold images

5. **Eliminate Render-Blocking Resources**
   - Inline critical CSS in `<head>`
   - Load non-critical CSS asynchronously
   - Preload important fonts

6. **Reduce JavaScript Payload**
   - Code-split large bundles
   - Remove unused code
   - Use tree shaking

### Long-term Actions (Low Impact)

7. **Implement Performance Monitoring**
   - Add Real User Monitoring (RUM)
   - Track Core Web Vitals
   - Set up performance budgets

8. **Consider CDN**
   - Serve static assets from edge locations
   - Implement automatic image optimization
   - Use Brotli compression

---

## Technical Details

### Server Configuration

**Current Settings:**
```javascript
server.requestTimeout = 120 * 1000;  // 120s
server.headersTimeout = 65 * 1000;   // 65s
server.keepAliveTimeout = 72 * 1000; // 72s
server.maxHeadersCount = 80;
```

**Caching Headers:**
```javascript
// Static assets
".svg": "public, max-age=86400"
".png": "public, max-age=86400"
".jpg": "public, max-age=86400"
".webp": "public, max-age=86400"
".woff2": "public, max-age=86400"

// Dynamic content
".html": "no-cache"
".js": "no-cache, must-revalidate"
".css": "no-cache, must-revalidate"
```

### Security Headers
- Content-Security-Policy: ✅ Implemented
- X-Content-Type-Options: ✅ nosniff
- X-Frame-Options: ✅ SAMEORIGIN
- Referrer-Policy: ✅ strict-origin-when-cross-origin
- Strict-Transport-Security: ✅ Enabled (HTTPS)

---

## Conclusion

The Giftora website has a solid foundation but needs optimization in three key areas:

1. **Visual Stability** - Fix CLS issues to prevent layout shifts
2. **Interactivity** - Reduce TBT to improve responsiveness
3. **Caching** - Implement proper cache policies to reduce load times

**Estimated Improvement Potential:**
- CLS: 0.49 → 0.1 (80% improvement)
- TBT: 1,160ms → 200ms (83% improvement)
- Cache Savings: 162 KiB → 0 KiB (100% improvement)
- Image Savings: 79 KiB → 0 KiB (100% improvement)

**Priority Order:**
1. Fix layout shifts (CLS)
2. Optimize caching
3. Reduce main thread work
4. Optimize images

Implementing these changes will significantly improve user experience and Core Web Vitals scores.