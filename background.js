chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log('🔧 Background script received message:', msg.action);
  
  if (msg.action === 'extractJsonFromChatGPT') {
    console.log('📩 Received extractJsonFromChatGPT trigger');

    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab || !tab.url.includes('chatgpt.com')) {
        console.log('❌ Not a ChatGPT tab, skipping');
        return;
      }

      console.log('✅ ChatGPT tab found. Injecting extraction script...');

      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          console.log('🚀 Running script in ChatGPT tab');

          function extractValidJson(text) {
            const textarea = document.createElement('textarea');
            textarea.innerHTML = text;
            const decoded = textarea.value;

            const match = decoded.match(/{[\s\S]*}/);
            if (!match) return null;

            try {
              return JSON.parse(match[0]);
            } catch (e) {
              return null;
            }
          }

          const codeBlocks = document.querySelectorAll('code');
          console.log(`🧱 Found ${codeBlocks.length} <code> blocks`);

          for (let i = codeBlocks.length - 1; i >= 0; i--) {
            const parsed = extractValidJson(codeBlocks[i].textContent);
            if (parsed && parsed.source === 'EBAY_LISTER') {
              console.log('📦 Found valid EBAY_LISTER JSON. Sending...');
              chrome.runtime.sendMessage({ action: "parsedEbayJson", payload: parsed });
              break;
            }
          }
        }
      });
    });
  }

  if (msg.action === 'extractEbayComListing') {
    console.log('📩 Received extractEbayComListing trigger');

    // Check if this was triggered by keyboard shortcut
    const isFromKeyboardShortcut = msg.fromKeyboardShortcut === true;
    console.log('🔍 Is from keyboard shortcut:', isFromKeyboardShortcut);

    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab || !tab.url.includes('ebay.com') || !(tab.url.includes('/lstng') || tab.url.includes('/sl/list'))) {
        console.log('❌ Not an eBay.com listing page, skipping');
        sendResponse({ success: false, error: 'Not an eBay.com listing page' });
        return;
      }

      console.log('✅ eBay.com listing page found. Injecting extraction script...');
      sendResponse({ success: true, message: 'Extraction started' });

      // Since we support both /lstng and /sl/list pages now, we can simplify the extraction
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: async (isFromKeyboardShortcut) => {
          console.log('🚀 Running eBay.com listing form extraction script');

          // Load settings
          let settings;
          try {
            const response = await fetch(chrome.runtime.getURL('settings.json'));
            settings = await response.json();
          } catch (error) {
            console.error('Failed to load settings, using defaults');
            settings = { currency: { usdToCadRate: 1.38 } };
          }

          // Function to extract images from the listing page
          function extractImages() {
            const images = [];
            
            console.log('🔍 Starting image extraction...');
            
            // Method 1: Extract from eBay's thumbnail buttons (background-image style)
            const thumbnailButtons = document.querySelectorAll('.uploader-thumbnails-ux__image[style*="background-image"]');
            console.log(`📋 Found ${thumbnailButtons.length} thumbnail buttons with background images`);
            
            thumbnailButtons.forEach((button, index) => {
              const style = button.getAttribute('style');
              if (style) {
                // Extract URL from background-image: url('...')
                const urlMatch = style.match(/background-image:\s*url\(['"]?([^'"]*?)['"]?\)/);
                if (urlMatch) {
                  let imageUrl = urlMatch[1];
                  
                  // Convert thumbnail URL to full-size URL
                  // From: https://i.ebayimg.com/00/s/MTQ0MFgxNDQw/z/w~AAAOSwbLhn~oJQ/$_57.JPG
                  // To:   https://i.ebayimg.com/images/g/w~AAAOSwbLhn~oJQ/s-l1600.webp
                  
                  if (imageUrl.includes('/00/s/') && imageUrl.includes('/z/')) {
                    // Extract the image ID (part after /z/)
                    const imageIdMatch = imageUrl.match(/\/z\/([^\/]+)/);
                    if (imageIdMatch) {
                      const imageId = imageIdMatch[1].replace(/\$_.*$/, ''); // Remove size suffix
                      imageUrl = `https://i.ebayimg.com/images/g/${imageId}/s-l1600.webp`;
                      console.log(`🔄 Converted thumbnail to full-size: ${imageUrl}`);
                    }
                  } else {
                    // Fallback: Clean up the URL for other formats
                    imageUrl = imageUrl
                      .replace(/\$_\d+\..*$/, '') // Remove size parameters completely
                      .replace(/\?.*$/, ''); // Remove query parameters
                  }
                  
                  if (!images.includes(imageUrl)) {
                    console.log(`✅ Found eBay thumbnail image ${index + 1}: ${imageUrl}`);
                    images.push(imageUrl);
                  }
                }
              }
            });
            
            // Method 2: Try traditional img selectors as fallback
            if (images.length === 0) {
              console.log('🔄 No thumbnail buttons found, trying traditional img selectors...');
              
              const imageSelectors = [
                'img[src*="ebayimg.com"]',
                'img[src*="i.ebayimg.com"]',
                'img[src*="thumbs.ebaystatic.com"]',
                '.photo-container img',
                '.image-preview img',
                '.gallery img',
                'img'
              ];
              
              for (const selector of imageSelectors) {
                const imageElements = document.querySelectorAll(selector);
                console.log(`📋 Found ${imageElements.length} images with selector: ${selector}`);
                
                imageElements.forEach((img, index) => {
                  let imageUrl = img.src || img.getAttribute('data-src') || img.getAttribute('data-original');
                  
                  if (imageUrl && !images.includes(imageUrl)) {
                    console.log(`🖼️ Processing image ${index + 1}: ${imageUrl}`);
                    
                    // Convert eBay thumbnail URLs to full-size URLs
                    if (imageUrl.includes('/00/s/') && imageUrl.includes('/z/')) {
                      // Extract the image ID (part after /z/)
                      const imageIdMatch = imageUrl.match(/\/z\/([^\/]+)/);
                      if (imageIdMatch) {
                        const imageId = imageIdMatch[1].replace(/\$_.*$/, ''); // Remove size suffix
                        imageUrl = `https://i.ebayimg.com/images/g/${imageId}/s-l1600.webp`;
                        console.log(`🔄 Converted thumbnail to full-size: ${imageUrl}`);
                      }
                    } else {
                      // Clean up the URL for other formats
                      imageUrl = imageUrl
                        .replace(/\/s-l\d+\./, '/s-l1600.') // Change to larger size
                        .replace(/\$_\d+\..*$/, '') // Remove size parameter completely
                        .replace(/\?.*$/, ''); // Remove query parameters
                    }
                    
                    // Only include actual product images (not UI icons, etc.)
                    const isEbayImage = imageUrl.includes('ebayimg.com');
                    const isNotUIElement = !imageUrl.includes('icon') && 
                                          !imageUrl.includes('logo') &&
                                          !imageUrl.includes('sprite') &&
                                          !imageUrl.includes('button') &&
                                          !imageUrl.includes('arrow');
                    const isReasonableSize = img.width > 50 && img.height > 50;
                    
                    if (isEbayImage && isNotUIElement && isReasonableSize) {
                      console.log(`✅ Added eBay image: ${imageUrl} (${img.width}x${img.height})`);
                      images.push(imageUrl);
                    } else if (!isEbayImage && img.width > 100 && img.height > 100) {
                      // Include non-eBay images if they're large enough (user uploaded)
                      console.log(`✅ Added user image: ${imageUrl} (${img.width}x${img.height})`);
                      images.push(imageUrl);
                    } else {
                      console.log(`⚠️ Skipped image: ${imageUrl} (${img.width}x${img.height}) - isEbay:${isEbayImage}, notUI:${isNotUIElement}, goodSize:${isReasonableSize}`);
                    }
                  }
                });
                
                // If we found images with this selector, we can break
                if (images.length > 0) {
                  console.log(`🎯 Found ${images.length} images with selector: ${selector}`);
                  break;
                }
              }
            }
            
            // Remove duplicates
            const uniqueImages = [...new Set(images)];
            console.log(`📸 Final image count: ${uniqueImages.length}`);
            uniqueImages.forEach((url, index) => {
              console.log(`📸 Image ${index + 1}: ${url}`);
            });
            
            return uniqueImages;
          }

          // Function to convert USD to CAD using settings
          function convertUsdToCad(usdPrice) {
            const exchangeRate = settings.currency.usdToCadRate || 1.38;
            const convertedPrice = parseFloat(usdPrice) * exchangeRate;
            
            // Round up to next dollar and set to .88 cents
            const roundedUp = Math.ceil(convertedPrice);
            return (roundedUp - 0.12).toFixed(2); // Subtract 0.12 to get .88 ending
          }

          // Extract listing data from eBay.com listing form
          function extractEbayListingFormData() {
            const data = {};

            // Extract basic form fields
            const titleInput = document.querySelector('input[name="title"]');
            if (titleInput) data.title = titleInput.value.trim();

            const priceInput = document.querySelector('input[name="price"]');
            if (priceInput && priceInput.value) {
              const usdPrice = priceInput.value.replace(/[^0-9.]/g, '');
              data.priceUSD = usdPrice;
              data.priceCAD = convertUsdToCad(usdPrice);
            }

            const skuInput = document.querySelector('input[name="customLabel"]');
            if (skuInput) data.sku = skuInput.value.trim();

            const descTextarea = document.querySelector('textarea[name="description"]');
            if (descTextarea) data.description = descTextarea.value.trim();

            const conditionTextarea = document.querySelector('textarea[name="itemConditionDescription"]');
            if (conditionTextarea) data.conditionDescription = conditionTextarea.value.trim();

            // Extract images
            data.images = extractImages();

            // Enhanced category extraction - get both category text and eBay category path
            data.categoryInfo = extractCategoryInfo();
            
            function extractCategoryInfo() {
              const categoryInfo = {};
              
              console.log('🔍 DEBUG: Starting category extraction process...');
              console.log('🔍 DEBUG: Page URL:', window.location.href);
              console.log('🔍 DEBUG: Page title:', document.title);
              
              // Helper function to determine if text represents an actual product category (not store category)
              function isActualProductCategory(text) {
                if (!text || text.length < 3) return false;
                
                // Store categories are valid but should be treated separately
                const storeCategoryPatterns = [
                  /^0[-–]\d+\s*days?$/i,      // "0-30 days", "0–30 days"
                  /^\d+[-–]\d+\s*days?$/i,   // "31-60 days", "91–120 days"
                  /^\d+\+?\s*days?$/i        // "181+ days"
                ];
                
                // Check if this is a store category (which is valid but different from product category)
                for (const pattern of storeCategoryPatterns) {
                  if (pattern.test(text.trim())) {
                    return false; // It's a store category, not a product category
                  }
                }
                
                // Filter out other non-product-category data
                const nonProductCategoryPatterns = [
                  /^(immediate|same day|next day|business day)$/i,
                  /^(no returns?|returns? accepted)$/i,
                  /^(free|paid|calculated)$/i,
                  /^(good|very good|excellent|new|used|pre-owned)$/i,
                  /^(auction|buy it now|fixed price)$/i,
                  /^(fast|standard|expedited|economy|overnight)$/i,
                  /^(paypal|credit card|cash|check)$/i,
                  /^\$\d+/i, // Prices starting with $
                  /^\d+\.\d+$/i, // Decimal numbers
                  /^(yes|no|n\/a|tbd|pending)$/i,
                  /^(select|choose|edit|done|cancel|save)$/i,
                  /^(none|other|misc|miscellaneous)$/i
                ];
                
                // Check against non-product-category patterns
                for (const pattern of nonProductCategoryPatterns) {
                  if (pattern.test(text.trim())) {
                    return false;
                  }
                }
                
                // Additional checks for common non-product-category content
                const textLower = text.toLowerCase().trim();
                const invalidTerms = [
                  'return policy', 'shipping', 'payment',
                  'condition', 'format', 'duration', 'location', 'quantity'
                ];
                
                for (const term of invalidTerms) {
                  if (textLower.includes(term)) {
                    return false;
                  }
                }
                
                // If it passes all filters, it's likely a real product category
                return true;
              }
              
              // Helper function to determine if text is a valid store category
              function isStoreCategory(text) {
                if (!text) return false;
                
                const storeCategoryPatterns = [
                  /^0[-–]30\s*days?$/i,
                  /^31[-–]60\s*days?$/i,
                  /^61[-–]90\s*days?$/i,
                  /^91[-–]120\s*days?$/i,
                  /^121[-–]180\s*days?$/i,
                  /^181\+?\s*days?$/i
                ];
                
                return storeCategoryPatterns.some(pattern => pattern.test(text.trim()));
              }
              
              // Method 1: Extract from category breadcrumb path (only if no main category found)
              if (!categoryInfo.category) {
                const categoryPath = extractCategoryPath();
                if (categoryPath) {
                  // Filter the category path to remove non-product-categories (but keep eBay categories)
                  const validPath = categoryPath.filter(item => isActualProductCategory(item));
                  if (validPath.length > 0) {
                    categoryInfo.path = validPath;
                    categoryInfo.category = validPath[validPath.length - 1]; // Last element is most specific
                  }
                }
              }
              
              // Method 2: Look for primary store category (only if no main category found)
              if (!categoryInfo.category) {
                const storeCategoryButton = document.querySelector('button[name="primaryStoreCategoryId"]');
                if (storeCategoryButton) {
                  const categoryText = storeCategoryButton.textContent.trim();
                  const cleanCategory = categoryText
                    .replace(/Store category/gi, '')
                    .replace(/First category/gi, '')
                    .replace(/Second category/gi, '')
                    .replace(/–/g, '-')
                    .trim();
                  
                  // Check if this is a store category (time-based) or a product category
                  if (isStoreCategory(cleanCategory)) {
                    categoryInfo.storeCategory = cleanCategory;
                    console.log('🏪 Found store category:', cleanCategory);
                  } else if (isActualProductCategory(cleanCategory)) {
                    categoryInfo.storeProductCategory = cleanCategory;
                    categoryInfo.category = cleanCategory;
                    console.log('📦 Found product category in store section:', cleanCategory);
                  } else if (cleanCategory && cleanCategory !== 'Edit' && cleanCategory !== 'Select') {
                    console.log('❓ Found unrecognized category type:', cleanCategory);
                  }
                }
              }
              
              // Method 3: Look for main category selector (HIGHEST PRIORITY)
              // Look for the specific category button structure
              let categoryButton = document.querySelector('button[name="categoryId"]');
              
              // Also try alternative selectors for the category button
              if (!categoryButton) {
                categoryButton = document.querySelector('button[aria-label*="Item category"]');
              }
              if (!categoryButton) {
                categoryButton = document.querySelector('button[_track*="primaryCategory"]');
              }
              if (!categoryButton) {
                categoryButton = document.querySelector('.summary__section-column button[name="categoryId"]');
              }
              if (!categoryButton) {
                categoryButton = document.querySelector('button.value.fake-link[name="categoryId"]');
              }
              
              console.log('🔍 DEBUG: Category button search results:');
              console.log('   - button[name="categoryId"]:', !!document.querySelector('button[name="categoryId"]'));
              console.log('   - button[aria-label*="Item category"]:', !!document.querySelector('button[aria-label*="Item category"]'));
              console.log('   - button[_track*="primaryCategory"]:', !!document.querySelector('button[_track*="primaryCategory"]'));
              
              if (categoryButton) {
                const categoryText = categoryButton.textContent.trim();
                console.log('🔍 DEBUG: Found category button with text:', categoryText);
                console.log('🔍 DEBUG: Button HTML:', categoryButton.outerHTML.substring(0, 200));
                
                // Also capture the category path from the same section
                const categorySection = categoryButton.closest('.summary__section-column') || categoryButton.parentElement;
                let categoryPath = '';
                if (categorySection) {
                  const pathElement = categorySection.querySelector('.value-secondary, [class*="secondary"]');
                  if (pathElement) {
                    categoryPath = pathElement.textContent.trim();
                    // Clean up the path text (remove "in " prefix)
                    categoryPath = categoryPath.replace(/^in\s+/i, '');
                    console.log('🔍 DEBUG: Found category path:', categoryPath);
                  }
                }
                
                const isValidProductCategory = isActualProductCategory(categoryText);
                if (categoryText && !categoryText.includes('Select') && !categoryText.includes('Choose') && 
                    !categoryText.includes('Edit') && isValidProductCategory) {
                  categoryInfo.category = categoryText;
                  if (categoryPath) {
                    categoryInfo.fullPath = categoryPath;
                    categoryInfo.pathArray = categoryPath.split(' > ').map(item => item.trim());
                  }
                  console.log('📦 Found main eBay category:', categoryText);
                  console.log('📍 Found category path:', categoryPath);
                } else if (categoryText && !isValidProductCategory) {
                  console.log('❓ Found non-product category in main selector:', categoryText);
                } else {
                  console.log('❓ Category button text not suitable:', categoryText);
                }
              } else {
                console.log('❌ No category button found with any selector');
                
                // Debug: show all buttons to help find the right selector
                const allButtons = document.querySelectorAll('button');
                console.log('🔍 DEBUG: All buttons on page:');
                allButtons.forEach((btn, index) => {
                  if (index < 10) { // Only show first 10 to avoid spam
                    const text = btn.textContent.trim().substring(0, 50);
                    const name = btn.getAttribute('name') || 'no-name';
                    const ariaLabel = btn.getAttribute('aria-label') || 'no-aria-label';
                    console.log(`   ${index + 1}. name="${name}" aria-label="${ariaLabel}" text="${text}"`);
                  }
                });
              }
              
              // Method 4: Extract category ID from URL
              const urlMatch = window.location.href.match(/categoryId=(\d+)/);
              if (urlMatch) {
                categoryInfo.categoryId = urlMatch[1];
              }
              
              // Method 5: Look for eBay's internal category data (only if no main category found)
              if (!categoryInfo.category) {
                const categoryData = extractEbayCategoryData();
                if (categoryData) {
                  // Validate category data before using it
                  if (categoryData.categoryName && isActualProductCategory(categoryData.categoryName)) {
                    categoryInfo.categoryName = categoryData.categoryName;
                    categoryInfo.category = categoryData.categoryName;
                    console.log('📦 Found product category in internal data:', categoryData.categoryName);
                  } else if (categoryData.categoryName) {
                    console.log('❓ Found non-product category in internal data:', categoryData.categoryName);
                  }
                  
                  if (categoryData.categoryId) {
                    categoryInfo.categoryId = categoryData.categoryId;
                  }
                  
                  if (categoryData.breadcrumbs) {
                    const validBreadcrumbs = categoryData.breadcrumbs.filter(item => 
                      typeof item === 'string' && isActualProductCategory(item)
                    );
                    if (validBreadcrumbs.length > 0) {
                      categoryInfo.breadcrumbs = validBreadcrumbs;
                      if (!categoryInfo.category) categoryInfo.category = validBreadcrumbs[validBreadcrumbs.length - 1];
                    }
                  }
                }
              }
              
              // Method 6: Fallback - infer category from title or item details if no valid category found
              if (!categoryInfo.category) {
                console.log('⚠️ No category found through extraction methods, attempting inference from title');
                const inferredCategory = inferCategoryFromTitle();
                if (inferredCategory) {
                  categoryInfo.category = inferredCategory;
                  categoryInfo.inferred = true;
                  console.log('🔍 Inferred category from title:', inferredCategory);
                } else {
                  console.log('❌ Could not infer category from title either');
                }
              } else {
                console.log('✅ Category found through extraction, skipping inference');
              }
              
              // Clean up category text if found
              if (categoryInfo.category) {
                categoryInfo.category = categoryInfo.category
                  .replace(/\s*\(.*?\)/g, '') // Remove parenthetical content
                  .replace(/Edit$|Select$|Choose$/g, '') // Remove trailing UI text
                  .trim();
                
                // If category is too generic or empty after cleaning, remove it
                if (!categoryInfo.category || categoryInfo.category.length < 3 || 
                    ['Edit', 'Select', 'Choose', 'Category'].includes(categoryInfo.category)) {
                  delete categoryInfo.category;
                }
              }
              
              return categoryInfo;
            }
            
            function extractCategoryPath() {
              // Look for category breadcrumb navigation
              const breadcrumbSelectors = [
                'nav[aria-label*="breadcrumb"] a',
                '.breadcrumb a',
                '[data-testid="breadcrumb"] a',
                '.category-breadcrumb a',
                '.bread-crumb a',
                'ol.breadcrumb a',
                '.category-path a',
                '.nav-breadcrumb a'
              ];
              
              for (const selector of breadcrumbSelectors) {
                const breadcrumbs = document.querySelectorAll(selector);
                if (breadcrumbs.length > 1) {
                  const path = Array.from(breadcrumbs)
                    .map(link => link.textContent.trim())
                    .filter(text => {
                      if (!text) return false;
                      // Filter out common non-category breadcrumb items
                      const nonCategoryItems = [
                        'eBay', 'Home', 'All Categories', 'My eBay', 'Sell', 'Selling',
                        'List an item', 'Create listing', 'Edit listing', 'Revise',
                        'Back to listing', 'Previous page'
                      ];
                      return !nonCategoryItems.some(item => text.toLowerCase().includes(item.toLowerCase()));
                    })
                    .slice(0, -1); // Remove the last item (usually the current listing title)
                  
                  if (path.length > 0) {
                    console.log('📍 Found category path:', path);
                    return path;
                  }
                }
              }
              
              // Alternative: Look for eBay's category navigation structure
              const categoryNavElements = document.querySelectorAll('.category-nav a, .cat-nav a, [data-testid="category-nav"] a');
              if (categoryNavElements.length > 0) {
                const navPath = Array.from(categoryNavElements)
                  .map(link => link.textContent.trim())
                  .filter(text => text && text !== 'eBay' && text !== 'Home');
                
                if (navPath.length > 0) {
                  console.log('📍 Found category nav path:', navPath);
                  return navPath;
                }
              }
              
              // Alternative: Look for category path in page title or meta
              const pageTitle = document.title;
              if (pageTitle.includes(' in ')) {
                const titleParts = pageTitle.split(' in ');
                if (titleParts.length > 1) {
                  const categoryPart = titleParts[1].split(' |')[0].trim();
                  if (categoryPart && !categoryPart.includes('eBay')) {
                    console.log('📍 Found category from page title:', [categoryPart]);
                    return [categoryPart];
                  }
                }
              }
              
              console.log('⚠️ No category path found');
              return null;
            }
            
            function extractEbayCategoryData() {
              // Look for eBay's internal category data in page scripts or data attributes
              const categoryData = {};
              
              // Check for category data in script tags
              const scripts = document.querySelectorAll('script');
              for (const script of scripts) {
                const content = script.textContent;
                
                // Look for category ID patterns
                const categoryIdMatch = content.match(/"categoryId":\s*"?(\d+)"?/);
                if (categoryIdMatch) {
                  categoryData.categoryId = categoryIdMatch[1];
                }
                
                // Look for category name patterns
                const categoryNameMatch = content.match(/"categoryName":\s*"([^"]+)"/);
                if (categoryNameMatch) {
                  categoryData.categoryName = categoryNameMatch[1];
                }
                
                // Look for breadcrumb data
                const breadcrumbMatch = content.match(/"breadcrumbs":\s*\[([^\]]+)\]/);
                if (breadcrumbMatch) {
                  try {
                    const breadcrumbData = JSON.parse(`[${breadcrumbMatch[1]}]`);
                    categoryData.breadcrumbs = breadcrumbData;
                  } catch (e) {
                    // Silent fail
                  }
                }
              }
              
              return Object.keys(categoryData).length > 0 ? categoryData : null;
            }
            
            function inferCategoryFromTitle() {
              // Try to infer category from the item title
              const titleInput = document.querySelector('input[name="title"]');
              if (!titleInput || !titleInput.value) return null;
              
              const title = titleInput.value.toLowerCase();
              
              // Common clothing categories
              const categoryMappings = {
                'jeans': ['jean', 'denim'],
                'shorts': ['short', 'cutoff', 'jort'],
                'pants': ['pant', 'trouser', 'chino', 'slack'],
                'hoodie': ['hoodie', 'hoody', 'sweatshirt'],
                'jacket': ['jacket', 'blazer', 'coat', 'windbreaker'],
                'shirt': ['shirt', 'tee', 'top', 'blouse', 'polo'],
                'sweater': ['sweater', 'pullover', 'cardigan', 'jumper'],
                'dress': ['dress', 'gown', 'frock'],
                'skirt': ['skirt', 'mini', 'maxi'],
                'shoes': ['shoe', 'sneaker', 'boot', 'sandal', 'heel'],
                'hat': ['hat', 'cap', 'beanie', 'snapback'],
                'bag': ['bag', 'purse', 'backpack', 'tote', 'clutch'],
                'watch': ['watch', 'timepiece'],
                'sunglasses': ['sunglass', 'glasses', 'shades']
              };
              
              // Check for category keywords in title
              for (const [category, keywords] of Object.entries(categoryMappings)) {
                for (const keyword of keywords) {
                  if (title.includes(keyword)) {
                    // Try to determine if it's men's or women's
                    const isWomens = title.includes('women') || title.includes('ladies') || 
                                    title.includes('girl') || title.includes('female');
                    const isMens = title.includes('men') || title.includes('guy') || 
                                  title.includes('male') || title.includes('boy');
                    
                    let categoryName = category.charAt(0).toUpperCase() + category.slice(1);
                    
                    if (isWomens) {
                      categoryName = `Women's ${categoryName}`;
                    } else if (isMens) {
                      categoryName = `Men's ${categoryName}`;
                    }
                    
                    return categoryName;
                  }
                }
              }
              
              return null;
            }
            
            // Maintain backward compatibility
            if (data.categoryInfo && data.categoryInfo.category) {
              data.category = data.categoryInfo.category;
            }
            if (data.categoryInfo && data.categoryInfo.categoryId) {
              data.categoryId = data.categoryInfo.categoryId;
            }

            // FULLY DYNAMIC ATTRIBUTE EXTRACTION
            const attributeButtons = document.querySelectorAll('button[name^="attributes."]');
            
            // Discover and extract ALL attribute fields dynamically
            attributeButtons.forEach(button => {
              const fullAttributeName = button.getAttribute('name').replace('attributes.', '');
              const buttonText = button.textContent.trim();
              
              // Convert attribute name to camelCase property name
              const propertyName = fullAttributeName
                .toLowerCase()
                .replace(/[^a-zA-Z0-9]/g, ' ')  // Replace special chars with spaces
                .trim()
                .split(' ')
                .map((word, index) => index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1))
                .join('');
              
              // Check if this is a multi-select field by looking for "(+X)" pattern or checking for selected items
              const isMultiSelect = buttonText.includes('(+') || buttonText.includes(' (+');
              
              if (isMultiSelect) {
                // For multi-select fields, we need to find the selected items in the dropdown
                try {
                  // Look for the dropdown menu associated with this button
                  const buttonId = button.getAttribute('aria-controls');
                  let menuContainer = null;
                  
                  if (buttonId) {
                    menuContainer = document.getElementById(buttonId);
                  }
                  
                  if (!menuContainer) {
                    // Fallback: look for menu container near this button
                    menuContainer = button.parentElement.querySelector('[data-testid="menu-container"]');
                  }
                  
                  if (!menuContainer) {
                    // Another fallback: look more broadly
                    const buttonParent = button.closest('.se-field, .fake-menu-button');
                    if (buttonParent) {
                      menuContainer = buttonParent.querySelector('[data-testid="menu-container"]');
                    }
                  }
                  
                  if (menuContainer) {
                    // Find all checked items in the selected options section
                    const selectedItems = menuContainer.querySelectorAll('.filter-menu__item[aria-checked="true"], .filter-menu__item[checked]');
                    
                    const selectedValues = Array.from(selectedItems).map(item => {
                      const textElement = item.querySelector('.filter-menu__text');
                      return textElement ? textElement.textContent.trim() : '';
                    }).filter(text => text);
                    
                    // Remove duplicates by converting to Set and back to Array
                    const uniqueValues = [...new Set(selectedValues)];
                    
                    if (uniqueValues.length > 0) {
                      data[propertyName] = uniqueValues;
                    }
                  } else {
                    // Fallback: extract from button text
                    const mainValue = buttonText.replace(/\s*\(\+\d+\).*/, '').trim();
                    if (mainValue && !mainValue.includes('Select') && !mainValue.includes('Choose')) {
                      data[propertyName] = [mainValue];
                    }
                  }
                } catch (error) {
                  // Fallback: extract main value from button text
                  const mainValue = buttonText.replace(/\s*\(\+\d+\).*/, '').trim();
                  if (mainValue && !mainValue.includes('Select') && !mainValue.includes('Choose')) {
                    data[propertyName] = [mainValue];
                  }
                }
              } else {
                // Single-select field - use button text
                if (buttonText && 
                    !buttonText.includes('Select') && 
                    !buttonText.includes('Choose') && 
                    !buttonText.includes('--') &&
                    !buttonText.includes('Loading')) {
                  data[propertyName] = buttonText;
                }
              }
            });

            // Extract condition from the listing summary view
            // On eBay.com listing pages, condition is shown as a button element
            const conditionButton = document.querySelector('button[name="condition"]#summary-condition-field-value');
            
            if (conditionButton) {
              data.condition = conditionButton.textContent.trim();
              console.log('🏷️ [EXTRACTION] Extracted condition from summary button:', data.condition);
            } else {
              console.log('🏷️ [EXTRACTION] No condition button found in summary, trying radio buttons...');
              // Fallback: try radio buttons (if on edit page instead of listing page)
              const selectedCondition = document.querySelector('input[name="condition"]:checked') ||
                                       document.querySelector('input[type="radio"][name="condition"]:checked');
              
              if (selectedCondition) {
                // Map condition values back to readable text
                const conditionMap = {
                  '1000': 'new with tags/box',
                  '1500': 'new without tags/box', 
                  '1750': 'new with defects',
                  '2990': 'pre-owned - excellent',
                  '3000': 'pre-owned - good',
                  '3010': 'pre-owned - fair'
                };
                data.condition = conditionMap[selectedCondition.value] || selectedCondition.value;
                console.log('🏷️ [EXTRACTION] Extracted condition from radio:', data.condition);
              } else {
                console.warn('⚠️ [EXTRACTION] Could not find condition element');
              }
            }

            // Add metadata
            data.source = 'EBAY_US_CA_BRIDGE';
            data.originalUrl = window.location.href;
            data.extractedAt = new Date().toISOString();

            return data;
          }

          const extractedData = extractEbayListingFormData();
          
          // Log category extraction results
          console.log('📋 Category extraction results:');
          if (extractedData.categoryInfo) {
            console.log('   📍 Category info:', extractedData.categoryInfo);
            console.log('   📂 Category path:', extractedData.categoryInfo.path);
            console.log('   🏷️ eBay product category:', extractedData.categoryInfo.category);
            console.log('   🏪 Store category:', extractedData.categoryInfo.storeCategory);
            console.log('   🔢 Category ID:', extractedData.categoryInfo.categoryId);
            console.log('   🧠 Inferred from title:', extractedData.categoryInfo.inferred || false);
          } else {
            console.log('   ⚠️ No category information extracted');
          }
          
          // Convert extracted eBay.com data to bridged JSON format - FULLY DYNAMIC
          const bridgedJson = {
            source: "EBAY_US_CA_BRIDGE",
            adRate: "6.0"
          };
          
          // Dynamically copy ALL extracted fields to bridged JSON
          Object.keys(extractedData).forEach(key => {
            bridgedJson[key] = extractedData[key];
          });

          console.log('🌉 Final bridged JSON preview:');
          console.log('   📋 Title:', bridgedJson.title);
          console.log('   💰 Price USD/CAD:', bridgedJson.priceUSD, '/', bridgedJson.priceCAD);
          console.log('   🏷️ Category info:', bridgedJson.categoryInfo);
          console.log('   📸 Images:', bridgedJson.images?.length || 0, 'images');
          
          // Save to storage for popup sync
          chrome.storage.local.set({ latestEbayJson: bridgedJson });
          
          // Send back to popup with explicit UI update request
          chrome.runtime.sendMessage({ 
            action: "extractedEbayComData", 
            payload: bridgedJson
          });
          
          // If triggered by keyboard shortcut, send message to background for auto-bridging
          if (isFromKeyboardShortcut) {
            console.log('⌨️ Keyboard shortcut triggered - auto-bridging to eBay.ca');
            chrome.runtime.sendMessage({ 
              action: "autoBridgeToEbayCA", 
              payload: bridgedJson 
            });
          }
        },
        args: [isFromKeyboardShortcut] // Pass the parameter
      });
    });
    
    return true; // Will respond asynchronously
  }

  if (msg.action === 'autoBridgeToEbayCA') {
    console.log('📩 Received autoBridgeToEbayCA trigger');
    const bridgedJson = msg.payload;
    
    // Load settings to get the base eBay.ca URL
    fetch(chrome.runtime.getURL('settings.json'))
      .then(response => response.json())
      .then(settings => {
        // Use the template ID from settings
        const templateId = settings.templates?.ebayCA?.defaultTemplateId || '6650616013';
        const defaultTemplateUrl = `https://www.ebay.ca/lstng?mode=AddItem&templateId=${templateId}`;
        
        console.log('🎯 Opening eBay.ca listing page with template for category navigation:', defaultTemplateUrl);
        console.log('📋 Category info to be set:', bridgedJson.categoryInfo);
        
        // Create new tab with eBay.ca working template
        chrome.tabs.create({ url: defaultTemplateUrl }, (newTab) => {
          // Wait for tab to load, then fill the form
          chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
            if (tabId === newTab.id && info.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(listener);
              
              // Inject content script and fill form
              chrome.scripting.executeScript({
                target: { tabId: newTab.id },
                files: ['contentScript.js']
              }, () => {
                // Send the listing data to fill the form (including enhanced category info)
                chrome.tabs.sendMessage(newTab.id, { 
                  action: 'fillForm', 
                  data: bridgedJson 
                });
              });
            }
          });
        });
      })
      .catch(error => {
        console.error('❌ Failed to load settings for auto-bridge:', error);
      });
      
    return true; // Will respond asynchronously
  }

  if (msg.action === 'createListing') {
    console.log('📩 Received createListing trigger');
    
    // Load settings to get template URLs
    fetch(chrome.runtime.getURL('settings.json'))
      .then(response => response.json())
      .then(settings => {
        const listingData = msg.data;
        
        // Use the template ID from settings
        const templateId = settings.templates?.ebayCA?.defaultTemplateId || '6650616013';
        const defaultTemplateUrl = `https://www.ebay.ca/lstng?mode=AddItem&templateId=${templateId}`;
        
        console.log('🎯 Opening eBay.ca listing page with template for category navigation:', defaultTemplateUrl);
        console.log('📋 Category info to be set:', listingData.categoryInfo);
        
        // Create new tab with eBay.ca working template
        chrome.tabs.create({ url: defaultTemplateUrl }, (newTab) => {
          // Wait for tab to load, then fill the form
          chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
            if (tabId === newTab.id && info.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(listener);
              
              // Inject content script and fill form
              chrome.scripting.executeScript({
                target: { tabId: newTab.id },
                files: ['contentScript.js']
              }, () => {
                // Send the listing data to fill the form
                chrome.tabs.sendMessage(newTab.id, { 
                  action: 'fillForm', 
                  data: listingData 
                });
              });
            }
          });
        });
        
        sendResponse({ success: true });
      })
      .catch(error => {
        console.error('❌ Failed to load settings:', error);
        sendResponse({ success: false, error: error.message });
      });
    
    return true; // Will respond asynchronously
  }

  if (msg.action === 'fetchImageAsBlob') {
    // Clean up the image URL - remove potential eBay URL artifacts
    let cleanUrl = msg.imageUrl;
    if (cleanUrl.endsWith('F') && cleanUrl.includes('$_')) {
      // Remove the trailing 'F' from malformed eBay URLs like '$_57.JPGF'
      cleanUrl = cleanUrl.slice(0, -1);
    }
    
    // Check if this is a small thumbnail (likely from expired listing)
    const isSmallThumbnail = cleanUrl.includes('$_57') || cleanUrl.includes('$_12') || cleanUrl.includes('$_35');
    
    console.log('📩 Received fetchImageAsBlob request for:', msg.imageUrl);
    if (cleanUrl !== msg.imageUrl) {
      console.log('🧹 Cleaned URL:', cleanUrl);
    }
    
    if (isSmallThumbnail) {
      console.warn('⚠️ This appears to be a small thumbnail, likely from an expired listing');
    }
    
    // Fetch the image and convert to base64
    fetch(cleanUrl)
      .then(response => {
        console.log('📡 Fetch response status:', response.status);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.blob();
      })
      .then(blob => {
        console.log('📦 Blob received, size:', blob.size, 'type:', blob.type);
        
        // Check if blob is too small (likely a broken thumbnail)
        if (blob.size < 1000) { // Less than 1KB is probably broken
          throw new Error(`Image too small (${blob.size} bytes) - likely from expired listing`);
        }
        
        // In service worker context, we can't use Image/Canvas directly
        // Convert blob to base64 directly and let content script handle resizing
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64Data = reader.result.split(',')[1]; // Remove data:image/...;base64, prefix
            console.log('✅ Base64 conversion completed, length:', base64Data.length);
            resolve({
              success: true,
              base64Data: base64Data,
              mimeType: blob.type,
              originalDimensions: 'unknown', // Will be determined in content script
              finalDimensions: 'unknown'
            });
          };
          reader.onerror = (error) => {
            console.error('❌ FileReader error:', error);
            reject(error);
          };
          reader.readAsDataURL(blob);
        });
      })
      .then(result => {
        console.log(`✅ Image processed: ${result.originalDimensions} → ${result.finalDimensions}`);
        sendResponse(result);
      })
      .catch(error => {
        console.error('❌ Error fetching image:', error);
        sendResponse({
          success: false,
          error: error.message
        });
      });
    
    return true; // Will respond asynchronously
  }
  
  return true; // Keep message port open for async responses
});
