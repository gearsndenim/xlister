// Global flag to prevent duplicate executions
if (typeof isCurrentlyFilling === 'undefined') {
    var isCurrentlyFilling = false;
}

async function waitForSelector(selector, timeout = 4000) {
    return new Promise((resolve, reject) => {
        const interval = setInterval(() => {
            const element = document.querySelector(selector);
            if (element) {
                clearInterval(interval);
                resolve(element);
            }
        }, 100);
        setTimeout(() => {
            clearInterval(interval);
            reject(new Error('Timeout waiting for selector: ' + selector));
        }, timeout);
    });
}

async function waitForIframeReady(iframe, timeout = 5000) {
    return new Promise((resolve, reject) => {
        const checkIframe = () => {
            try {
                const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                if (iframeDoc && iframeDoc.readyState === 'complete' && iframeDoc.body) {
                    const editableDiv = iframeDoc.querySelector('div[contenteditable="true"]');
                    if (editableDiv) {
                        resolve(editableDiv);
                        return true;
                    }
                }
            } catch (error) {
                // Iframe not ready yet
            }
            return false;
        };

        // Check immediately
        if (checkIframe()) return;

        // Set up interval check
        const interval = setInterval(() => {
            if (checkIframe()) {
                clearInterval(interval);
            }
        }, 100);

        // Set timeout
        setTimeout(() => {
            clearInterval(interval);
            reject(new Error('Timeout waiting for iframe to be ready'));
        }, timeout);
    });
}

async function fillDropdown(buttonSelector, searchInputSelector, value) {
    const button = document.querySelector(buttonSelector);
    if (!button) return;
    button.click();
    const input = await waitForSelector(searchInputSelector);
    input.focus();
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 500));
    const dropdownMenu = button.parentElement.querySelector('.menu__items'); // <<< restrict search to the correct menu
    const menuItems = Array.from(dropdownMenu?.querySelectorAll('span') || []);
    const match = menuItems.find(item => item.innerText.trim().toLowerCase() === value.trim().toLowerCase());
    if (match) {
        match.click();
    } else {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    }
}

async function fillMultiSelect(buttonSelector, searchInputSelector, values) {
    const button = document.querySelector(buttonSelector);
    if (!button) return;
    
    // Open dropdown once at the beginning
    button.click();
    await new Promise(resolve => setTimeout(resolve, 800));
    
    // Find the search input - try multiple selectors
    let input = document.querySelector(searchInputSelector);
    if (!input) {
        input = document.querySelector('input[placeholder*="Search"]');
    }
    if (!input) {
        input = document.querySelector('.filter-menu input[type="text"]');
    }
    
    if (!input) {
        console.warn(`⚠️ Could not find search input for multi-select field`);
        document.body.click();
        return;
    }
    
    // Process values in batches to avoid overwhelming the interface
    const batchSize = 5;
    const selectedCount = { count: 0 };
    
    for (let batchStart = 0; batchStart < values.length; batchStart += batchSize) {
        const batch = values.slice(batchStart, batchStart + batchSize);
        
        for (const value of batch) {
            await selectSingleValue(input, value, selectedCount);
        }
        
        // Brief pause between batches to let the UI settle
        if (batchStart + batchSize < values.length) {
            await new Promise(resolve => setTimeout(resolve, 200));
        }
    }
    
    // Final verification and close
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Close dropdown
    document.body.click();
    await new Promise(resolve => setTimeout(resolve, 300));
}

async function selectSingleValue(input, value, selectedCount) {
    // Clear and set the search value
    input.focus();
    input.value = '';
    await new Promise(resolve => setTimeout(resolve, 50));
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Look for matching menu items
    const menuItems = Array.from(document.querySelectorAll('.filter-menu__item'));
    const match = menuItems.find(item => {
        const text = item.querySelector('.filter-menu__text');
        return text && text.textContent.trim().toLowerCase() === value.trim().toLowerCase();
    });
    
    if (match) {
        const isChecked = match.getAttribute('aria-checked') === 'true';
        if (!isChecked) {
            // Select the item efficiently
            match.click();
            selectedCount.count++;
            await new Promise(resolve => setTimeout(resolve, 150));
        }
    } else {
        // Try Enter key as fallback for custom values
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await new Promise(resolve => setTimeout(resolve, 200));
    }
}

function calculateCategoryMatchScore(labelText, targetCategory, targetPath, categoryInfo) {
    let score = 0;
    let reasons = [];
    
    const labelLower = labelText.toLowerCase();
    const targetLower = targetCategory.toLowerCase();
    const targetPathLower = targetPath?.toLowerCase() || '';
    
    // Debug logging for gender detection
    console.warn(`🔍 Scoring: "${labelText}" vs target "${targetCategory}"`);
    console.warn(`📍 Target path: "${targetPath}"`);
    console.warn(`👤 Category info:`, categoryInfo);
    
    // 1. Category name matching (most important)
    if (labelLower === targetLower) {
        score += 100;
        reasons.push('exact category name match');
    } else if (labelLower.includes(targetLower)) {
        score += 80;
        reasons.push('partial category name match');
    } else if (targetLower.includes(labelLower)) {
        score += 60;
        reasons.push('category name contains match');
    }
    
    // 2. Gender/department matching (very important for disambiguation)
    if (targetPathLower) {
        console.warn(`🚻 Gender analysis: targetPath="${targetPathLower}"`);
        if (targetPathLower.includes('men') && !targetPathLower.includes('women')) {
            // This is a men's item
            console.warn(`♂️ Detected men's item from path`);
            if (labelLower.includes('men') && !labelLower.includes('women')) {
                score += 50;
                reasons.push('men\'s category match');
            } else if (labelLower.includes('women') || labelLower.includes('ladies')) {
                score -= 50; // Penalty for wrong gender
                reasons.push('wrong gender (women vs men)');
            }
        } else if (targetPathLower.includes('women') || targetPathLower.includes('ladies')) {
            // This is a women's item
            console.warn(`♀️ Detected women's item from path`);
            if (labelLower.includes('women') || labelLower.includes('ladies')) {
                score += 50;
                reasons.push('women\'s category match');
            } else if (labelLower.includes('men') && !labelLower.includes('women')) {
                score -= 50; // Penalty for wrong gender
                reasons.push('wrong gender (men vs women)');
            }
        } else {
            console.warn(`⚪ No clear gender detected in path`);
        }
        
        // 3. Other path elements matching
        const pathElements = targetPathLower.split(' > ').map(p => p.trim());
        for (const element of pathElements) {
            if (element.length > 3 && labelLower.includes(element)) {
                score += 10;
                reasons.push(`path element match: ${element}`);
            }
        }
    }
    
    // Additional gender detection from categoryInfo if path doesn't have it
    if (categoryInfo) {
        const categoryData = JSON.stringify(categoryInfo).toLowerCase();
        if (categoryData.includes('women') || categoryData.includes('ladies')) {
            console.warn(`♀️ Detected women's item from categoryInfo`);
            if (labelLower.includes('women') || labelLower.includes('ladies')) {
                score += 40;
                reasons.push('women\'s category match (from info)');
            } else if (labelLower.includes('men') && !labelLower.includes('women')) {
                score -= 40;
                reasons.push('wrong gender from info (men vs women)');
            }
        } else if (categoryData.includes('men') && !categoryData.includes('women')) {
            console.warn(`♂️ Detected men's item from categoryInfo`);
            if (labelLower.includes('men') && !labelLower.includes('women')) {
                score += 40;
                reasons.push('men\'s category match (from info)');
            } else if (labelLower.includes('women') || labelLower.includes('ladies')) {
                score -= 40;
                reasons.push('wrong gender from info (women vs men)');
            }
        }
    }
    
    // 4. Specific category type matching
    if (categoryInfo.pathArray) {
        const pathArray = categoryInfo.pathArray.map(p => p.toLowerCase());
        
        // Check for specific subcategories in the path
        if (pathArray.includes('activewear') && labelLower.includes('activewear')) {
            score += 30;
            reasons.push('activewear subcategory match');
        }
        if (pathArray.includes('shirts') && labelLower.includes('shirt')) {
            score += 20;
            reasons.push('shirts subcategory match');
        }
        if (pathArray.includes('clothing') && labelLower.includes('clothing')) {
            score += 10;
            reasons.push('clothing category match');
        }
    }
    
    return {
        score: Math.max(0, score), // Don't allow negative scores
        reason: reasons.join(', ') || 'no specific matches'
    };
}

async function fillFields(data) {
    // Prevent duplicate execution with better checking
    if (isCurrentlyFilling) {
        return;
    }
    
    // Store the current listing data globally for category matching
    window.currentListingData = data;
    
    // Additional protection: check if we recently processed the same data
    const dataHash = JSON.stringify(data).substring(0, 100); // Simple hash
    if (window.lastProcessedDataHash === dataHash && 
        window.lastFillTimestamp && 
        (Date.now() - window.lastFillTimestamp) < 5000) {
        return;
    }
    
    isCurrentlyFilling = true;
    window.lastProcessedDataHash = dataHash;
    window.lastFillTimestamp = Date.now();
    
    // Safety timeout to reset flag in case of unexpected errors
    const safetyTimeout = setTimeout(() => {
        if (isCurrentlyFilling) {
            console.warn('🚨 Safety timeout triggered - resetting isCurrentlyFilling flag');
            isCurrentlyFilling = false;
            removeLoadingOverlay();
        }
    }, 120000); // 2 minutes timeout
    
    // Create and show loading overlay
    const loadingOverlay = createLoadingOverlay();
    document.body.appendChild(loadingOverlay);
    
    try {
        // Wait for page to be fully loaded before attempting to fill fields
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Load settings
        let settings;
        try {
            const response = await fetch(chrome.runtime.getURL('settings.json'));
            settings = await response.json();
        } catch (error) {
            console.error('Failed to load settings, using defaults');
            settings = {
                defaults: { defaultConditionText: 'washed using hypoallergenic laundry detergent that is free of dyes and perfumes.' }
            };
        }
        
        const isEbayCA = window.location.hostname.includes('ebay.ca');
        
        // Wait for key elements to be available
        try {
            await waitForSelector('input[name="title"]', 10000);
        } catch (error) {
            console.error('❌ Timeout waiting for page elements to load');
            removeLoadingOverlay();
            alert('Error: Page not fully loaded. Please try again.');
            return;
        }
        
        const titleInput = document.querySelector('input[name="title"]');
        const priceInput = document.querySelector('input[name="price"]');
        const descTextarea = document.querySelector('textarea[name="description"]');
        const conditionTextarea = document.querySelector('textarea[name="itemConditionDescription"]');
        const skuInput = document.querySelector('input[name="customLabel"]');

        if (titleInput && data.title) {
            // Set title immediately
            titleInput.focus();
            titleInput.value = data.title;
            titleInput.dispatchEvent(new Event('input', { bubbles: true }));
            titleInput.dispatchEvent(new Event('change', { bubbles: true }));
            
            // Set title again after a delay to counteract eBay's interference
            setTimeout(() => {
                const titleInputDelayed = document.querySelector('input[name="title"]');
                if (titleInputDelayed && titleInputDelayed.value !== data.title) {
                    titleInputDelayed.focus();
                    titleInputDelayed.value = data.title;
                    titleInputDelayed.dispatchEvent(new Event('input', { bubbles: true }));
                    titleInputDelayed.dispatchEvent(new Event('change', { bubbles: true }));
                    titleInputDelayed.dispatchEvent(new Event('blur', { bubbles: true }));
                }
            }, 2000);
            
            // Set title one more time after attributes are processed
            setTimeout(() => {
                const titleInputFinal = document.querySelector('input[name="title"]');
                if (titleInputFinal && titleInputFinal.value !== data.title) {
                    titleInputFinal.focus();
                    titleInputFinal.value = data.title;
                    titleInputFinal.dispatchEvent(new Event('input', { bubbles: true }));
                    titleInputFinal.dispatchEvent(new Event('change', { bubbles: true }));
                    titleInputFinal.dispatchEvent(new Event('blur', { bubbles: true }));
                }
            }, 5000);
        }

        if (skuInput && data.sku) {
            skuInput.focus();
            skuInput.value = data.sku;
            skuInput.dispatchEvent(new Event('input', { bubbles: true }));
            skuInput.dispatchEvent(new Event('change', { bubbles: true }));
        }

        // Use CAD price for eBay.ca, USD price for eBay.com
        const priceToUse = isEbayCA ? (data.priceCAD || data.price) : (data.price || data.priceUSD);
        
        if (priceInput && priceToUse) {
            priceInput.focus();
            priceInput.value = priceToUse;
            priceInput.dispatchEvent(new Event('input', { bubbles: true }));
            priceInput.dispatchEvent(new Event('change', { bubbles: true }));
        }

        // Enhanced category handling with smart navigation for both eBay and Store categories
        if (data.categoryInfo || data.category || data.categoryId) {
            await handleCategorySelection(data);
        } else {
            console.log('⚠️ No category information found in data to set');
        }

        // Continue with rest of form filling after category is set

        // Handle description field (rich text editor)
        if (data.description) {
            let description = data.description;
            let descriptionSet = false;
            
            // Method 1: Try the rich text editor iframe approach first
            const descriptionIframe = document.querySelector('iframe[id*="se-rte-frame"]');
            if (descriptionIframe) {
                try {
                    // Wait for iframe to be fully loaded and contenteditable div to be available
                    const editableDiv = await waitForIframeReady(descriptionIframe);
                    
                    // Set the content (convert newlines to <br> for HTML)
                    const htmlDescription = description.replace(/\n/g, '<br>');
                    editableDiv.innerHTML = htmlDescription;
                    
                    // Remove placeholder class if it exists
                    editableDiv.classList.remove('placeholder');
                    
                    // Focus the field first to simulate user interaction
                    editableDiv.focus();
                    
                    // Wait a bit for focus to register
                    await new Promise(resolve => setTimeout(resolve, 100));
                    
                    // Trigger events on the contenteditable div
                    editableDiv.dispatchEvent(new Event('input', { bubbles: true }));
                    editableDiv.dispatchEvent(new Event('change', { bubbles: true }));
                    
                    // Wait a bit more before blurring to ensure the content is registered
                    await new Promise(resolve => setTimeout(resolve, 200));
                    
                    // Blur the field to trigger eBay's auto-save API call
                    editableDiv.blur();
                    editableDiv.dispatchEvent(new Event('blur', { bubbles: true }));
                    
                    // Also trigger events on the iframe itself
                    descriptionIframe.dispatchEvent(new Event('input', { bubbles: true }));
                    descriptionIframe.dispatchEvent(new Event('change', { bubbles: true }));
                    
                    // Also update the hidden textarea to ensure synchronization
                    const hiddenTextarea = document.querySelector('textarea[name="description"]');
                    if (hiddenTextarea) {
                        hiddenTextarea.value = description;
                        hiddenTextarea.dispatchEvent(new Event('input', { bubbles: true }));
                        hiddenTextarea.dispatchEvent(new Event('change', { bubbles: true }));
                        hiddenTextarea.dispatchEvent(new Event('blur', { bubbles: true }));
                    }
                    
                    // Wait a bit more to allow the API call to complete
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                    descriptionSet = true;
                    
                } catch (error) {
                    console.warn('⚠️ Error waiting for iframe to be ready:', error);
                }
            }
            
            // Method 2: Fallback to hidden textarea if iframe method fails
            if (!descriptionSet) {
                const descTextarea = document.querySelector('textarea[name="description"]');
                if (descTextarea) {
                    descTextarea.value = description;
                    descTextarea.dispatchEvent(new Event('input', { bubbles: true }));
                    descTextarea.dispatchEvent(new Event('change', { bubbles: true }));
                    descriptionSet = true;
                }
            }
            
            if (!descriptionSet) {
                console.warn('⚠️ Could not find description field to set');
            }
        }

        // Handle condition field
        if (data.condition || data.itemConditionDescription) {
            const conditionText = data.itemConditionDescription || data.condition || 'Pre-owned';
            const conditionTextarea = document.querySelector('textarea[name="itemConditionDescription"]');
            if (conditionTextarea) {
                conditionTextarea.value = conditionText;
                conditionTextarea.dispatchEvent(new Event('input', { bubbles: true }));
                conditionTextarea.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }

        // Handle other form fields
        // Set quantity if provided
        if (data.quantity) {
            const quantityInput = document.querySelector('input[name="quantity"], input[name="qty"]');
            if (quantityInput) {
                quantityInput.value = data.quantity;
                quantityInput.dispatchEvent(new Event('input', { bubbles: true }));
                quantityInput.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }

        console.log('✅ Form filling completed successfully!');

        async function handleCategorySelection(data) {
            // Handle both eBay categories and Store categories
            let targetProductCategory = null;
            let targetStoreCategory = null;
            let categoryPath = null;
            let isInferred = false;
            
            if (data.categoryInfo) {
                targetProductCategory = data.categoryInfo.category;
                targetStoreCategory = data.categoryInfo.storeCategory;
                categoryPath = data.categoryInfo.path;
                isInferred = data.categoryInfo.inferred || false;
            } else if (data.category) {
                // Try to determine if this is a store category or product category
                if (isStoreCategory(data.category)) {
                    targetStoreCategory = data.category;
                } else {
                    targetProductCategory = data.category;
                }
            }
            
            // Handle eBay product category first (main category)
            if (targetProductCategory) {
                if (!isValidProductCategory(targetProductCategory)) {
                    console.warn('🚫 Product category appears to be invalid:', targetProductCategory);
                } else {
                    // Clean up category text for better matching
                    const cleanedCategory = targetProductCategory
                        .replace(/–/g, '-')
                        .replace(/—/g, '-')
                        .trim();
                    
                    const success = await navigateToCategory(cleanedCategory, categoryPath);
                    if (!success) {
                        console.warn('⚠️ Could not navigate to product category, trying fallback methods');
                        await fallbackCategorySelection(cleanedCategory);
                    }
                }
            }
            
            // Store category handling (optional - only if provided)
            if (targetStoreCategory) {
                await handleStoreCategory(targetStoreCategory);
            }
            
            if (!targetProductCategory && !targetStoreCategory) {
                console.warn('⚠️ No valid category information available - skipping category selection');
                return;
            }
        }
        
        function isStoreCategory(category) {
            if (!category) return false;
            
            const storeCategoryPatterns = [
                /^0[-–]30\s*days?$/i,
                /^31[-–]60\s*days?$/i,
                /^61[-–]90\s*days?$/i,
                /^91[-–]120\s*days?$/i,
                /^121[-–]180\s*days?$/i,
                /^181\+?\s*days?$/i
            ];
            
            return storeCategoryPatterns.some(pattern => pattern.test(category.trim()));
        }
        
        async function handleStoreCategory(storeCategory) {
            // Look for store category selection elements
            const storeCategoryButton = document.querySelector('button[name="primaryStoreCategoryId"], button[name="storeCategoryId"]');
            if (storeCategoryButton) {
                storeCategoryButton.click();
                await new Promise(resolve => setTimeout(resolve, 800));
                
                // Look for radio buttons with store category options
                const radioOptions = document.querySelectorAll('input[name="primaryStoreCategoryId"][type="radio"]');
                let categorySelected = false;
                
                for (const radio of radioOptions) {
                    const label = document.querySelector(`label[for="${radio.id}"]`);
                    if (label) {
                        const labelText = label.textContent.trim();
                        // Check if this label matches our store category with flexible matching
                        const normalizedLabel = labelText.replace(/[-–—]/g, '-').toLowerCase();
                        const normalizedTarget = storeCategory.replace(/[-–—]/g, '-').toLowerCase();
                        
                        if (normalizedLabel === normalizedTarget ||
                            labelText === storeCategory ||
                            labelText.includes(storeCategory) ||
                            storeCategory.includes(labelText)) {
                            
                            radio.click();
                            await new Promise(resolve => setTimeout(resolve, 200));
                            
                            const doneButton = document.querySelector('button[_track="1.primaryStoreCategoryId.2.Done"]');
                            if (doneButton) {
                                doneButton.click();
                                categorySelected = true;
                                await new Promise(resolve => setTimeout(resolve, 1000));
                            }
                            break;
                        }
                    }
                }
                
                if (!categorySelected) {
                    // Extract the numeric range from the target (e.g., "91-120" from "91-120 days")
                    const targetMatch = storeCategory.match(/(\d+)[-–](\d+)/);
                    if (targetMatch) {
                        const targetStart = parseInt(targetMatch[1]);
                        const targetEnd = parseInt(targetMatch[2]);
                        
                        for (const radio of radioOptions) {
                            const label = document.querySelector(`label[for="${radio.id}"]`);
                            if (label) {
                                const labelText = label.textContent.trim();
                                const labelMatch = labelText.match(/(\d+)[-–](\d+)/);
                                
                                if (labelMatch) {
                                    const labelStart = parseInt(labelMatch[1]);
                                    const labelEnd = parseInt(labelMatch[2]);
                                    
                                    if (labelStart === targetStart && labelEnd === targetEnd) {
                                        radio.click();
                                        await new Promise(resolve => setTimeout(resolve, 200));
                                        
                                        const doneButton = document.querySelector('button[_track="1.primaryStoreCategoryId.2.Done"]');
                                        if (doneButton) {
                                            doneButton.click();
                                            categorySelected = true;
                                            await new Promise(resolve => setTimeout(resolve, 1000));
                                        }
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
                
                if (!categorySelected) {
                    console.warn('⚠️ Store category not found in available options');
                    
                    const doneButton = document.querySelector('button[_track="1.primaryStoreCategoryId.2.Done"]');
                    if (doneButton) {
                        doneButton.click();
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                }
            } else {
                console.warn('⚠️ Store category button not found');
            }
        }
        
        function isValidProductCategory(category) {
            if (!category || typeof category !== 'string' || category.length < 3) {
                return false;
            }
            
            // Store categories are valid but handled separately
            if (isStoreCategory(category)) {
                return false; // It's a store category, not a product category
            }
            
            // Filter out patterns that are clearly not product categories
            const invalidPatterns = [
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
                /^(select|choose|edit|done|cancel|save)$/i
            ];
            
            for (const pattern of invalidPatterns) {
                if (pattern.test(category.trim())) {
                    return false;
                }
            }
            
            // Additional keyword-based filtering (but not including "days" since we handle store categories separately)
            const categoryLower = category.toLowerCase();
            const invalidKeywords = [
                'return policy', 'shipping', 'payment',
                'condition', 'format', 'duration', 'location', 'quantity'
            ];
            
            for (const keyword of invalidKeywords) {
                if (categoryLower.includes(keyword)) {
                    return false;
                }
            }
            
            return true;
        }
        
        async function navigateToCategory(targetCategory, categoryPath) {
            // Step 1: Find and click the category selection button
            const categoryButton = await findCategoryButton();
            if (!categoryButton) {
                console.log('❌ Could not find category selection button');
                return false;
            }
            
            console.log('🔍 Found category button, clicking to open selection');
            categoryButton.click();
            await new Promise(resolve => setTimeout(resolve, 600)); // Reduced from 1000ms to 600ms
            
            // Step 2: Navigate through the category hierarchy
            if (categoryPath && categoryPath.length > 0) {
                console.log('🗺️ Attempting to navigate through category path:', categoryPath);
                return await navigateCategoryPath(categoryPath);
            } else {
                console.log('🔍 Searching for direct category match:', targetCategory);
                return await searchForCategory(targetCategory);
            }
        }
        
        async function findCategoryButton() {
            const selectors = [
                'button[name="categoryId"]',
                'button[aria-label*="Category"]',
                'button[aria-label*="category"]',
                'button[name="primaryStoreCategoryId"]',
                'button[name="storeCategoryId"]',
                '.category-selector button',
                '[data-testid="category-selector"] button'
            ];
            
            for (const selector of selectors) {
                const button = document.querySelector(selector);
                if (button) {
                    return button;
                }
            }
            
            console.warn('❌ No category button found with any selector');
            return null;
        }
        
        async function navigateCategoryPath(categoryPath) {
            try {
                for (let i = 0; i < categoryPath.length; i++) {
                    const categoryName = categoryPath[i];
                    console.log(`🔍 Looking for category level ${i + 1}: "${categoryName}"`);
                    
                    // Look for category options at current level
                    const categoryFound = await selectCategoryAtLevel(categoryName);
                    
                    if (!categoryFound) {
                        console.log(`⚠️ Could not find category "${categoryName}" at level ${i + 1}`);
                        return false;
                    }
                    
                    // Wait for next level to load if not at the end
                    if (i < categoryPath.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 800));
                    }
                }
                
                // After navigating the full path, confirm the selection
                return await confirmCategorySelection();
                
            } catch (error) {
                console.error('❌ Error navigating category path:', error);
                return false;
            }
        }
        
        async function selectCategoryAtLevel(categoryName) {
            console.log(`🔍 Searching for category "${categoryName}" at current level`);
            
            // Look for various category selection elements
            const allElements = document.querySelectorAll(
                'input[type="radio"], a, button, li, [role="option"], label'
            );
            
            console.log(`📊 Found ${allElements.length} potential category elements`);
            
            // Log first few options for debugging
            console.log('🔍 Available category options:');
            for (let i = 0; i < Math.min(10, allElements.length); i++) {
                const element = allElements[i];
                const text = element.textContent.trim();
                if (text.length > 0 && text.length < 100) {
                    console.log(`   ${i + 1}. "${text}"`);
                }
            }
            
            // Try exact matches first
            for (const element of allElements) {
                const text = element.textContent.trim();
                if (text === categoryName) {
                    console.log('✅ Found exact match for category:', categoryName);
                    
                    // If it's a label for a radio button, click the radio button instead
                    if (element.tagName === 'LABEL' && element.getAttribute('for')) {
                        const radioId = element.getAttribute('for');
                        const radio = document.getElementById(radioId);
                        if (radio) {
                            console.log('🔘 Clicking associated radio button');
                            radio.click();
                        } else {
                            element.click();
                        }
                    } else {
                        console.log('👆 Clicking element directly');
                        element.click();
                    }
                    return true;
                }
            }
            
            // Try partial matches
            console.log('🔍 No exact match found, trying partial matches...');
            for (const element of allElements) {
                const text = element.textContent.trim().toLowerCase();
                if (text.includes(categoryName.toLowerCase()) && text.length < categoryName.length + 20) {
                    console.log('✅ Found partial match for category:', categoryName, '→', element.textContent.trim());
                    
                    // If it's a label for a radio button, click the radio button instead
                    if (element.tagName === 'LABEL' && element.getAttribute('for')) {
                        const radioId = element.getAttribute('for');
                        const radio = document.getElementById(radioId);
                        if (radio) {
                            console.log('🔘 Clicking associated radio button for partial match');
                            radio.click();
                        } else {
                            element.click();
                        }
                    } else {
                        console.log('👆 Clicking element directly for partial match');
                        element.click();
                    }
                    return true;
                }
            }
            
            console.log('❌ No match found for category:', categoryName);
            return false;
        }
        
        async function searchForCategory(targetCategory) {
            // Wait a moment for the category dialog to load
            await new Promise(resolve => setTimeout(resolve, 500)); // Reduced from 2000ms to 500ms
            
            // First, try to find clickable category elements directly
            const clickableElements = document.querySelectorAll('button, a, [role="button"], [role="option"], li, label');
            let foundShorts = false;
            
            for (const element of clickableElements) {
                const text = element.textContent.trim();
                if (text.toLowerCase().includes('short') && text.length < 50) {
                    
                    // Try clicking it
                    try {
                        element.click();
                        foundShorts = true;
                        await new Promise(resolve => setTimeout(resolve, 400)); // Reduced from 1000ms to 400ms
                        return await confirmCategorySelection();
                    } catch (error) {
                        console.warn(`❌ Failed to click element: ${error.message}`);
                    }
                }
            }
            
            if (!foundShorts) {
                // Let's try to find the category selection dialog specifically
                const categorySelectors = [
                    '.category-picker-dialog',
                    '.category-selection-dialog',
                    '[data-testid*="category"]',
                    '.modal-dialog',
                    '.dropdown-menu',
                    '.category-dropdown',
                    'div[role="dialog"]',
                    'div[role="listbox"]'
                ];
                
                let categoryContainer = null;
                for (const selector of categorySelectors) {
                    categoryContainer = document.querySelector(selector);
                    if (categoryContainer && categoryContainer.offsetHeight > 0) {
                        break;
                    }
                }
                
                if (categoryContainer) {
                    const containerElements = categoryContainer.querySelectorAll('button, a, [role="button"], [role="option"], li, label, span, div');
                    
                    // First, check if we're in a subcategory and need to navigate up
                    const currentPath = Array.from(containerElements).find(el => 
                        el.textContent.includes('Selected') && el.textContent.includes('>')
                    );
                    
                    if (currentPath) {
                        // If we're in Jeans, we need to go up to Men's Clothing
                        if (currentPath.textContent.includes('Jeans')) {
                            
                            // Look for "Men's Clothing" button to go back
                            const mensClothingButton = Array.from(containerElements).find(el => 
                                el.textContent.toLowerCase().includes("men's clothing") ||
                                el.textContent.toLowerCase().includes("mens clothing")
                            );
                            
                            if (mensClothingButton) {
                                mensClothingButton.click();
                                
                                // Wait for navigation and search again
                                await new Promise(resolve => setTimeout(resolve, 1500));
                                
                                // Now search for Shorts in the new view
                                const updatedElements = categoryContainer.querySelectorAll('button, a, [role="button"], [role="option"], li, label, span, div');
                                
                                for (const element of updatedElements) {
                                    const text = element.textContent.trim().toLowerCase();
                                    if (text === 'shorts' || text.includes('short') && text.length < 30) {
                                        try {
                                            element.click();
                                            foundShorts = true;
                                            await new Promise(resolve => setTimeout(resolve, 1000));
                                            return await confirmCategorySelection();
                                        } catch (error) {
                                            console.warn(`❌ Failed to click shorts: ${error.message}`);
                                        }
                                    }
                                }
                            }
                        }
                    }
                    
                    // If we didn't find shorts through navigation, try clicking any shorts element
                    if (!foundShorts) {
                        for (let i = 0; i < Math.min(20, containerElements.length); i++) {
                            const element = containerElements[i];
                            const text = element.textContent.trim();
                            if (text.length > 0 && text.length < 100) {
                                if (text.toLowerCase().includes('short')) {
                                    try {
                                        element.click();
                                        foundShorts = true;
                                        await new Promise(resolve => setTimeout(resolve, 1000));
                                        return await confirmCategorySelection();
                                    } catch (error) {
                                        // Continue to next element
                                    }
                                }
                            }
                        }
                    }
                }
            }
            
            // NEW: Try the search box approach
            return await searchCategoryByTyping(targetCategory);
        }
        
        async function searchCategoryByTyping(targetCategory) {
            // Get the full category info from data
            const categoryInfo = window.currentListingData?.categoryInfo || {};
            const targetPath = categoryInfo.fullPath || categoryInfo.pathArray?.join(' > ') || '';
            
            // Look for the search box in the category dialog
            const searchBoxSelectors = [
                '.se-search-box input',
                '.se-search-box__field input',
                'input[aria-label="Item category"]',
                '.category-picker input[type="text"]',
                '.textbox__control'
            ];
            
            let searchBox = null;
            for (const selector of searchBoxSelectors) {
                searchBox = document.querySelector(selector);
                if (searchBox) {
                    break;
                }
            }
            
            if (!searchBox) {
                console.warn('❌ No search box found');
                return false;
            }
            
            // Clear and type the target category in the search box
            searchBox.focus();
            searchBox.value = '';
            
            // Small delay to ensure search box is ready
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Handle "&" character issue - if category contains "&", search only the first word
            let searchTerm = targetCategory;
            if (targetCategory.includes('&')) {
                // Extract first word before "&" for search
                searchTerm = targetCategory.split('&')[0].trim();
                console.warn(`⚠️ Category contains "&" - searching for "${searchTerm}" instead of full "${targetCategory}"`);
            }
            
            // Method 1: Type character by character with events
            for (let i = 0; i < searchTerm.length; i++) {
                searchBox.value += searchTerm[i];
                searchBox.dispatchEvent(new Event('input', { bubbles: true }));
                searchBox.dispatchEvent(new Event('keyup', { bubbles: true }));
                await new Promise(resolve => setTimeout(resolve, 30)); // Reduced from 50ms to 30ms
            }
            
            // Method 2: Set full value and trigger multiple events
            searchBox.value = searchTerm;
            searchBox.dispatchEvent(new Event('input', { bubbles: true }));
            searchBox.dispatchEvent(new Event('change', { bubbles: true }));
            searchBox.dispatchEvent(new Event('keyup', { bubbles: true }));
            searchBox.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
            
            // Method 3: Try pressing Enter key
            searchBox.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
            searchBox.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', bubbles: true }));
            searchBox.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
            
            // Wait for search results to appear with multiple checks
            let searchResultsFound = false;
            let attempts = 0;
            const maxAttempts = 6; // Reduced from 8 to 6 attempts
            
            while (!searchResultsFound && attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 300)); // Reduced from 500ms to 300ms
                attempts++;
                
                // Check for search results
                const resultCheckSelectors = [
                    '.category-picker__search-result',
                    'input[name="categoryId"]',
                    '.search-list__options-header',
                    'fieldset input[type="radio"]'
                ];
                
                for (const selector of resultCheckSelectors) {
                    const results = document.querySelectorAll(selector);
                    if (results.length > 0) {
                        searchResultsFound = true;
                        break;
                    }
                }
            }
            
            if (!searchResultsFound) {
                console.warn('❌ No search results appeared after typing');
                return false;
            }
            
            // Look for the best result matching both category name and path
            const resultSelectors = [
                'input[name="categoryId"]' // Any categoryId radio button
            ];
            
            let targetResult = null;
            let bestMatch = { score: 0, element: null, reason: '', labelText: '' };
            
            for (const selector of resultSelectors) {
                const elements = document.querySelectorAll(selector);
                
                for (const element of elements) {
                    const label = document.querySelector(`label[for="${element.id}"]`);
                    const labelText = label ? label.textContent : 'Unknown';
                    
                    // When searching with partial term due to "&", prioritize exact match to original category
                    let score;
                    if (searchTerm !== targetCategory) {
                        // We searched with partial term, look for exact match to original
                        if (labelText.toLowerCase().includes(targetCategory.toLowerCase())) {
                            score = { score: 1000, reason: 'exact match to original category with &' };
                            console.warn(`🎯 Found exact match for "${targetCategory}": "${labelText}"`);
                        } else {
                            // Score this option based on category name and path matching
                            score = calculateCategoryMatchScore(labelText, targetCategory, targetPath, categoryInfo);
                        }
                    } else {
                        // Normal scoring
                        score = calculateCategoryMatchScore(labelText, targetCategory, targetPath, categoryInfo);
                    }
                    
                    console.warn(`📊 Score for "${labelText}": ${score.score} (${score.reason})`);
                    
                    if (score.score > bestMatch.score) {
                        bestMatch = { score: score.score, element: element, reason: score.reason, labelText: labelText };
                        console.warn(`🏆 New best match: "${labelText}" with score ${score.score}`);
                    }
                }
            }
            
            if (bestMatch.element) {
                targetResult = bestMatch.element;
                
                // Validate that the selected category matches the intended category
                const selectedCategoryText = bestMatch.labelText;
                const isGoodMatch = selectedCategoryText.toLowerCase().includes(targetCategory.toLowerCase()) ||
                                   targetCategory.toLowerCase().includes(selectedCategoryText.toLowerCase()) ||
                                   bestMatch.score >= 80; // High confidence score
                
                if (!isGoodMatch) {
                    console.warn(`⚠️ CATEGORY MISMATCH: Selected "${selectedCategoryText}" but intended "${targetCategory}"`);
                    // Store mismatch info for later alert
                    window.categoryMismatch = {
                        intended: targetCategory,
                        selected: selectedCategoryText,
                        searchTerm: searchTerm
                    };
                }
            } else {
                console.warn('❌ No suitable match found');
                return false;
            }
            
            // Click the radio button
            targetResult.checked = true; // Set as checked
            targetResult.click(); // Also trigger click event
            targetResult.dispatchEvent(new Event('change', { bubbles: true })); // Trigger change event
            
            // Wait a moment for selection to register
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Look for and click Done/Confirm button
            const allButtons = document.querySelectorAll('button');
            let doneButtonFound = false;
            
            for (const button of allButtons) {
                const buttonText = button.textContent.toLowerCase().trim();
                if (buttonText === 'done' || buttonText === 'confirm' || buttonText === 'select') {
                    button.click();
                    doneButtonFound = true;
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    break;
                }
            }
            
            if (!doneButtonFound) {
                console.warn('⚠️ No Done button found, but selection was made');
            }
            
            return true;
            
            // If no search found, try direct text matching
            return await findAndClickCategoryByText(targetCategory);
        }
        
        async function findAndClickCategoryByText(targetCategory) {
            const allClickableElements = document.querySelectorAll(
                'a, button, li, [role="option"], [role="button"], .clickable, .selectable'
            );
            
            // First pass: exact matches
            for (const element of allClickableElements) {
                const text = element.textContent.trim();
                if (text === targetCategory) {
                    console.log('✅ Found exact text match for category:', targetCategory);
                    element.click();
                    return await confirmCategorySelection();
                }
            }
            
            // Second pass: partial matches
            for (const element of allClickableElements) {
                const text = element.textContent.trim().toLowerCase();
                if (text.includes(targetCategory.toLowerCase()) && text.length < targetCategory.length + 30) {
                    console.log('✅ Found partial text match for category:', targetCategory, '→', element.textContent.trim());
                    element.click();
                    return await confirmCategorySelection();
                }
            }
            
            return false;
        }
        
        async function confirmCategorySelection() {
            // Look for confirmation buttons like "Done", "Select", "Confirm", etc.
            const allButtons = document.querySelectorAll('button, [role="button"]');
            
            for (const button of allButtons) {
                const text = button.textContent.trim().toLowerCase();
                const ariaLabel = (button.getAttribute('aria-label') || '').toLowerCase();
                
                if ((text.includes('done') || text.includes('select') || text.includes('confirm') || 
                     text.includes('ok') || text.includes('save') ||
                     ariaLabel.includes('done') || ariaLabel.includes('select') || ariaLabel.includes('confirm')) &&
                    button.offsetParent !== null) { // Check if visible
                    
                    console.log('✅ Confirming category selection with button:', button.textContent.trim());
                    button.click();
                    await new Promise(resolve => setTimeout(resolve, 500));
                    return true;
                }
            }
            
            // Alternative: close any open modals/dialogs by clicking outside
            const modals = document.querySelectorAll('.modal, .dialog, .popup, .overlay');
            if (modals.length > 0) {
                console.log('🔄 Closing category selection modal');
                document.body.click();
                await new Promise(resolve => setTimeout(resolve, 500));
                return true;
            }
            
            return true; // Assume success if no explicit confirmation needed
        }
        
        async function fallbackCategorySelection(targetCategory) {
            // This is the original category selection logic as a fallback
            console.log('🔄 Using fallback category selection method');
            
            // Try multiple methods to find and set the category
            
            // Method 1: Look for primary store category button first
            const storeCategoryButton = document.querySelector('button[name="primaryStoreCategoryId"], button[name="storeCategoryId"]');
            if (storeCategoryButton && targetCategory) {
                storeCategoryButton.click();
                await new Promise(resolve => setTimeout(resolve, 800));
                
                // In the first popup, look for radio buttons with category labels
                const radioOptions = document.querySelectorAll('input[name="primaryStoreCategoryId"][type="radio"]');
                let categorySelected = false;
                
                for (const radio of radioOptions) {
                    const label = document.querySelector(`label[for="${radio.id}"]`);
                    if (label) {
                        const labelText = label.textContent.trim();
                        // Check if this label matches our category
                        if (labelText.toLowerCase().includes(targetCategory.toLowerCase()) ||
                            targetCategory.toLowerCase().includes(labelText.toLowerCase()) ||
                            (labelText.includes('Clothing') && targetCategory.toLowerCase().includes('clothing')) ||
                            (labelText.includes('Jeans') && targetCategory.toLowerCase().includes('jeans'))) {
                            
                            // Select the radio button first
                            radio.click();
                            await new Promise(resolve => setTimeout(resolve, 200));
                            
                            // Then click Done to trigger the API call and close popup
                            const firstDoneButton = document.querySelector('button[_track="1.primaryStoreCategoryId.2.Done"]');
                            if (firstDoneButton) {
                                firstDoneButton.click();
                                console.log('✅ Selected store category and triggered save:', labelText);
                                categorySelected = true;
                                
                                // Wait for API call to complete
                                await new Promise(resolve => setTimeout(resolve, 500)); // Reduced from 1000ms to 500ms
                                
                                // Handle the second popup that might appear
                                const secondDoneButton = document.querySelector('button[_track="0.CATEGORY.1.Done"]');
                                if (secondDoneButton) {
                                    secondDoneButton.click();
                                    console.log('✅ Closed item category popup');
                                    await new Promise(resolve => setTimeout(resolve, 500));
                                }
                            }
                            break;
                        }
                    }
                }
                
                // If no specific category found, just close the popup
                if (!categorySelected) {
                    const firstDoneButton = document.querySelector('button[_track="1.primaryStoreCategoryId.2.Done"]');
                    if (firstDoneButton) {
                        firstDoneButton.click();
                        console.log('🔧 Closed store category popup without selection');
                        await new Promise(resolve => setTimeout(resolve, 500));
                        
                        // Close second popup if it appears
                        const secondDoneButton = document.querySelector('button[_track="0.CATEGORY.1.Done"]');
                        if (secondDoneButton) {
                            secondDoneButton.click();
                            await new Promise(resolve => setTimeout(resolve, 500));
                        }
                    }
                }
            }
            
            // Method 2: Look for main category button/dropdown
            const categoryButton = document.querySelector('button[name="categoryId"], button[aria-label*="category"], button[aria-label*="Category"]');
            if (categoryButton && targetCategory && !storeCategoryButton) {
                categoryButton.click();
                await new Promise(resolve => setTimeout(resolve, 800));
                
                // Look for category search input
                const categorySearch = document.querySelector('input[placeholder*="category"], input[placeholder*="Category"], input[aria-label*="category"]');
                if (categorySearch) {
                    categorySearch.focus();
                    categorySearch.value = targetCategory;
                    categorySearch.dispatchEvent(new Event('input', { bubbles: true }));
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                    // Look for matching category in dropdown and click it (this will close popup)
                    const categoryOptions = document.querySelectorAll('[role="option"], .category-option, [data-testid*="category-option"]');
                    const matchingCategory = Array.from(categoryOptions).find(option => 
                        option.textContent.toLowerCase().includes(targetCategory.toLowerCase())
                    );
                    
                    if (matchingCategory) {
                        matchingCategory.click();
                        console.log('✅ Selected and closed main category popup:', targetCategory);
                        await new Promise(resolve => setTimeout(resolve, 500));
                    } else {
                        // Try Enter key to select first match
                        categorySearch.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
                        console.log('🔧 Attempted to select main category with Enter:', targetCategory);
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                } else {
                    // No search input found, just close the popup
                    document.body.click();
                    await new Promise(resolve => setTimeout(resolve, 300));
                }
            }
            
            // Wait a bit for category selection to register
            await new Promise(resolve => setTimeout(resolve, 300));
        }

        // Handle description field (rich text editor)
        if (data.description) {
            let description = data.description;
            let descriptionSet = false;
            
            // Method 1: Try the rich text editor iframe approach first
            const descriptionIframe = document.querySelector('iframe[id*="se-rte-frame"]');
            if (descriptionIframe) {
                try {
                    // Wait for iframe to be fully loaded and contenteditable div to be available
                    const editableDiv = await waitForIframeReady(descriptionIframe);
                    
                    // Set the content (convert newlines to <br> for HTML)
                    const htmlDescription = description.replace(/\n/g, '<br>');
                    editableDiv.innerHTML = htmlDescription;
                    
                    // Remove placeholder class if it exists
                    editableDiv.classList.remove('placeholder');
                    
                    // Focus the field first to simulate user interaction
                    editableDiv.focus();
                    
                    // Wait a bit for focus to register
                    await new Promise(resolve => setTimeout(resolve, 100));
                    
                    // Trigger events on the contenteditable div
                    editableDiv.dispatchEvent(new Event('input', { bubbles: true }));
                    editableDiv.dispatchEvent(new Event('change', { bubbles: true }));
                    
                    // Wait a bit more before blurring to ensure the content is registered
                    await new Promise(resolve => setTimeout(resolve, 200));
                    
                    // Blur the field to trigger eBay's auto-save API call
                    editableDiv.blur();
                    editableDiv.dispatchEvent(new Event('blur', { bubbles: true }));
                    
                    // Also trigger events on the iframe itself
                    descriptionIframe.dispatchEvent(new Event('input', { bubbles: true }));
                    descriptionIframe.dispatchEvent(new Event('change', { bubbles: true }));
                    
                    // Also update the hidden textarea to ensure synchronization
                    const hiddenTextarea = document.querySelector('textarea[name="description"]');
                    if (hiddenTextarea) {
                        hiddenTextarea.value = description;
                        hiddenTextarea.dispatchEvent(new Event('input', { bubbles: true }));
                        hiddenTextarea.dispatchEvent(new Event('change', { bubbles: true }));
                        hiddenTextarea.dispatchEvent(new Event('blur', { bubbles: true }));
                    }
                    
                    // Wait a bit more to allow the API call to complete
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                    descriptionSet = true;
                    
                } catch (error) {
                    console.warn('⚠️ Error waiting for iframe to be ready:', error);
                }
            }
            
            // Method 2: Fallback to hidden textarea if iframe method fails
            if (!descriptionSet) {
                const descTextarea = document.querySelector('textarea[name="description"]');
                if (descTextarea) {
                    descTextarea.value = description;
                    descTextarea.dispatchEvent(new Event('input', { bubbles: true }));
                    descTextarea.dispatchEvent(new Event('change', { bubbles: true }));
                    descriptionSet = true;
                }
            }
            
            // Method 3: Try other possible selectors
            if (!descriptionSet) {
                const alternativeSelectors = [
                    'textarea[data-testid="richEditor"]',
                    'textarea[placeholder*="description"]',
                    'div[contenteditable="true"]'
                ];
                
                for (const selector of alternativeSelectors) {
                    const element = document.querySelector(selector);
                    if (element) {
                        if (element.tagName.toLowerCase() === 'textarea') {
                            element.value = description;
                            element.dispatchEvent(new Event('input', { bubbles: true }));
                            element.dispatchEvent(new Event('change', { bubbles: true }));
                        } else if (element.contentEditable === 'true') {
                            element.innerHTML = description.replace(/\n/g, '<br>');
                            element.dispatchEvent(new Event('input', { bubbles: true }));
                        }
                        
                        descriptionSet = true;
                        break;
                    }
                }
            }
            
            if (!descriptionSet) {
                console.warn('⚠️ Could not find any description field to populate');
            } else {
                // Additional step: Check if eBay's auto-save system is active and try to trigger it
                setTimeout(async () => {
                    try {
                        // Try to find the description field again and trigger one more blur event
                        const iframe = document.querySelector('iframe[id*="se-rte-frame"]');
                        if (iframe) {
                            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                            const editableDiv = iframeDoc?.querySelector('div[contenteditable="true"]');
                            if (editableDiv) {
                                // One final focus/blur cycle to ensure auto-save is triggered
                                editableDiv.focus();
                                await new Promise(resolve => setTimeout(resolve, 100));
                                editableDiv.blur();
                            }
                        }
                    } catch (error) {
                        // Silent failure is okay here
                    }
                }, 1000); // Wait 1 second after the main operation
            }
        }

        if (conditionTextarea && data.conditionDescription) {
            if (data.conditionDescription.endsWith(".")) {
                data.conditionDescription = data.conditionDescription.slice(0, -1);
            }
            const defaultConditionText = settings.defaults.defaultConditionText || 'washed using hypoallergenic laundry detergent that is free of dyes and perfumes.'
            if (!data.conditionDescription.endsWith(defaultConditionText)) {
                conditionTextarea.value = data.conditionDescription + ', ' + defaultConditionText;
            } else {
                conditionTextarea.value = data.conditionDescription;
            }
            conditionTextarea.dispatchEvent(new Event('input', { bubbles: true }));
        }

        // Fill basic visible fields first (these are typically always visible)
        if (data.brand) await fillDropdown('button[name="attributes.Brand"]', 'input[name="search-box-attributesBrand"]', data.brand);
        if (data.size) await fillDropdown('button[name="attributes.Size"]', 'input[name="search-box-attributesSize"]', data.size);
        if (data.color) await fillDropdown('button[name="attributes.Color"]', 'input[name="search-box-attributesColor"]', data.color);

        // Check for and click "Show more" button if it exists and is not expanded
        const showMoreButton = document.querySelector('button[_track="1.ATTRIBUTES.0.ShowMore"][aria-expanded="false"]');
        if (showMoreButton) {
            showMoreButton.click();
            await new Promise(resolve => setTimeout(resolve, 1500)); // Wait longer for fields to appear
        }

        // DYNAMIC FIELD DETECTION AND FILLING
        
        // Get all attribute buttons on the page
        const attributeButtons = document.querySelectorAll('button[name^="attributes."]');
        
        // Create a comprehensive mapping for field normalization
        const fieldMappings = {
            // Direct mappings
            'brand': 'brand',
            'size': 'size', 
            'color': 'color',
            'style': 'style',
            'fit': 'fit',
            'rise': 'rise',
            'inseam': 'inseam',
            'waist size': 'waistSize',
            'fabric wash': 'fabricWash',  // Updated to match extraction
            'closure': 'closure',
            'type': 'type',
            'fabric type': 'fabricType',
            'neckline': 'neckline',
            'sleeve length': 'sleeveLength',
            'collar style': 'collarStyle',
            'chest size': 'chestSize',
            'shirt length': 'shirtLength',
            'country/region of manufacture': 'countryRegionOfManufacture',  // Updated to match extraction
            'material': 'material',
            'pattern': 'pattern',
            'season': 'season',
            'occasion': 'occasion',
            'vintage': 'vintage',
            'theme': 'theme',
            'character': 'character',
            'department': 'department',
            'model': 'model',
            'features': 'features',
            'performance/activity': 'performance',
            'lining': 'lining',
            'accents': 'accents',
            'sleeve': 'sleeve',
            'length': 'length',
            'heel height': 'heelHeight',
            'toe style': 'toeStyle',
            'fastening': 'fastening',
            'pocket': 'pocket',
            'placket': 'placket',
            'hood': 'hood',
            'cuff': 'cuff',
            'hem': 'hem',
            'product line': 'productLine',
            'pocket type': 'pocketType',
            'garment care': 'garmentCare',
            'mpn': 'mpn',
            'unit type': 'unitType',
            // Additional mappings for common fields that may not be on page
            'jacket/coat length': 'jacketCoatLength',
            'jacket lapel style': 'jacketLapelStyle',
            'lining material': 'liningMaterial',
            'number of pieces': 'numberOfPieces',
            'set includes': 'setIncludes',
            'size type': 'sizeType'
        };

        // Process each attribute button found on the page
        for (const button of attributeButtons) {
            const attributeName = button.getAttribute('name').replace('attributes.', '');
            const normalizedName = attributeName.toLowerCase();
            
            // Skip basic fields already handled
            if (['brand', 'size', 'color'].includes(normalizedName)) {
                continue;
            }
            
            // Try to find matching JSON property using field mappings first
            let jsonProperty = fieldMappings[normalizedName];
            
            // If not in mapping, try dynamic conversion (same as extraction)
            if (!jsonProperty) {
                jsonProperty = attributeName
                    .toLowerCase()
                    .replace(/[^a-zA-Z0-9]/g, ' ')
                    .trim()
                    .split(' ')
                    .map((word, index) => index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1))
                    .join('');
            }
            
            // Check if we have data for this field
            if (data[jsonProperty] && data[jsonProperty] !== '' && 
                !(Array.isArray(data[jsonProperty]) && data[jsonProperty].length === 0)) {
                
                const value = data[jsonProperty];
                
                try {
                    if (['material', 'theme', 'accents', 'features', 'season'].includes(jsonProperty) && Array.isArray(value)) {
                        // Handle multi-select fields (material, theme, accents, features, season)
                        await fillMultiSelect(
                            `button[name="attributes.${attributeName}"]`,
                            'input[aria-label="Search or enter your own. Search results appear below"]',
                            value
                        );
                    } else {
                        // Handle regular dropdown fields
                        const searchInputName = `search-box-attributes${attributeName.replace(/[^a-zA-Z]/g, '')}`;
                        await fillDropdown(
                            `button[name="attributes.${attributeName}"]`,
                            `input[name="${searchInputName}"]`,
                            Array.isArray(value) ? value[0] : value
                        );
                    }
                } catch (error) {
                    console.warn(`⚠️ Failed to fill ${attributeName}:`, error.message);
                }
            } else {
                console.warn(`📝 Field ${attributeName} found on page but no data in JSON (${jsonProperty})`);
            }
        }

        // Check for JSON fields that weren't found on the page
        // Handle image uploading if image URLs are provided
        if (data.images && Array.isArray(data.images) && data.images.length > 0) {
            await handleImageUpload(data.images);
        }

        const pageFieldNames = Array.from(attributeButtons).map(button => {
            const attributeName = button.getAttribute('name').replace('attributes.', '');
            return attributeName.toLowerCase();
        });
        
        // Check each JSON property against available page fields
        Object.keys(data).forEach(jsonKey => {
            // Skip non-attribute fields and fields that are commonly not on page
            if (['source', 'templateType', 'title', 'sku', 'priceCAD', 'priceUSD', 
                 'description', 'condition', 'conditionDescription', 'adRate', 
                 'originalUrl', 'extractedAt', 'category', 'categoryId', 'images',
                 'categoryInfo', 'jacketCoatLength', 'jacketLapelStyle', 'liningMaterial',
                 'numberOfPieces', 'setIncludes', 'sizeType', 'sleeveLength'].includes(jsonKey)) {
                return;
            }
            
            // Skip basic fields we already handled
            if (['brand', 'size', 'color'].includes(jsonKey)) {
                return;
            }
            
            // Skip empty values
            if (!data[jsonKey] || data[jsonKey] === '' || 
                (Array.isArray(data[jsonKey]) && data[jsonKey].length === 0)) {
                return;
            }
            
            // Try to find corresponding page field
            let foundOnPage = false;
            
            // First check direct matches in fieldMappings
            for (const [pageField, jsonProperty] of Object.entries(fieldMappings)) {
                if (jsonProperty === jsonKey && pageFieldNames.includes(pageField)) {
                    foundOnPage = true;
                    break;
                }
            }
            
            // If not found, try dynamic conversion back to page field name
            if (!foundOnPage) {
                // Convert camelCase back to potential page field names
                const potentialPageFields = [
                    // Direct lowercase
                    jsonKey.toLowerCase(),
                    // Add spaces before capitals
                    jsonKey.replace(/([A-Z])/g, ' $1').toLowerCase().trim(),
                    // Add spaces and slashes
                    jsonKey.replace(/([A-Z])/g, '/$1').toLowerCase().trim()
                ];
                
                foundOnPage = potentialPageFields.some(field => pageFieldNames.includes(field));
            }
            
            if (!foundOnPage) {
                console.log(`⚠️ JSON has data for "${jsonKey}" (${data[jsonKey]}) but no corresponding field found on page`);
            }
        });

        // Handle condition selection
        // First, check if we need to infer condition from conditionDescription
        if ((!data.condition || data.condition === 'undefined' || data.condition === '') && data.conditionDescription) {
            // If we have a condition description but no condition, default to pre-owned
            data.condition = 'pre-owned';
        }

        if (data.condition && data.condition !== 'undefined' && data.condition !== '') {
            // Create mapping for common condition values
            const conditionMappings = {
                'new with tags': 'New with tags',
                'new': 'New with tags',
                'pre-owned': 'Pre-owned - Good',
                'pre-owned - good': 'Pre-owned - Good',
                'good': 'Pre-owned - Good',
                'used': 'Pre-owned - Good',
                'pre-owned - excellent': 'Pre-owned - Excellent',
                'excellent': 'Pre-owned - Excellent',
                'pre-owned - very good': 'Pre-owned - Very Good',
                'very good': 'Pre-owned - Very Good',
                'pre-owned - fair': 'Pre-owned - Fair',
                'fair': 'Pre-owned - Fair'
            };
            
            const normalizedCondition = data.condition.toLowerCase();
            const mappedCondition = conditionMappings[normalizedCondition] || data.condition;
            
            // Try to find and click the condition button first
            const conditionButtons = document.querySelectorAll('.condition-recommendation-value');
            let conditionSet = false;
            
            for (const button of conditionButtons) {
                const buttonText = button.textContent.trim();
                if (buttonText === mappedCondition) {
                    button.click();
                    conditionSet = true;
                    break;
                }
            }
            
            // If not found in visible buttons, try the "..." more options button
            if (!conditionSet) {
                const moreOptionsButton = document.querySelector('.condition-recommendation-more-values');
                if (moreOptionsButton) {
                    moreOptionsButton.click();
                    
                    // Wait for more options to appear and try again
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                    const allConditionButtons = document.querySelectorAll('.condition-recommendation-value');
                    for (const button of allConditionButtons) {
                        const buttonText = button.textContent.trim();
                        if (buttonText === mappedCondition) {
                            button.click();
                            conditionSet = true;
                            break;
                        }
                    }
                }
            }
            
            if (!conditionSet) {
                console.warn(`⚠️ Could not find condition button for: ${data.condition} (mapped to: ${mappedCondition})`);
                return;
            }
            
            // Wait for eBay to update the DOM after condition selection
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Now modify the DOM to show the filled condition state
            const conditionSection = document.querySelector('.smry.summary__condition, .smry.summary--warn.summary__condition');
            
            if (conditionSection) {
                // Remove warning class and update structure
                conditionSection.classList.remove('summary--warn');
                conditionSection.classList.add('summary__condition');
                
                // Clear the warning notice
                const noticeDiv = conditionSection.querySelector('.summary__notice');
                if (noticeDiv) {
                    noticeDiv.innerHTML = '';
                }
                
                // Update the condition value button text
                const conditionValueButton = conditionSection.querySelector('#summary-condition-field-value');
                if (conditionValueButton) {
                    conditionValueButton.textContent = mappedCondition;
                }
                
                // Remove the condition recommendation section and replace with filled structure
                const summaryRow = conditionSection.querySelector('.summary-row');
                if (summaryRow) {
                    try {
                        // Replace the summary-row content with the filled state structure
                        summaryRow.innerHTML = `
                            <div class="summary-column">
                                <div class="smry--section">
                                    <div class="summary-section__sublabel">
                                        <h3 id="summary-condition-field-label" class="textual-display">Item condition</h3>
                                    </div>
                                    <button id="summary-condition-field-value" name="condition" aria-labelledby="summary-condition-field-value summary-condition-field-label" _track="2.condition.0.Edit" class="smry--value refocus fake-link" data-ebayui="" type="button">${mappedCondition}</button>
                                </div>
                            </div>
                        `;
                    } catch (error) {
                        console.warn(`⚠️ Error updating summary-row:`, error);
                    }
                }
                
                // Handle condition description
                if (data.conditionDescription && !mappedCondition.toLowerCase().includes('new')) {
                    
                    // Find and populate the actual condition description textarea that eBay uses
                    setTimeout(() => {
                        const actualConditionTextarea = document.querySelector('textarea[name="itemConditionDescription"]');
                        if (actualConditionTextarea) {
                            actualConditionTextarea.value = data.conditionDescription;
                            actualConditionTextarea.dispatchEvent(new Event('input', { bubbles: true }));
                            actualConditionTextarea.dispatchEvent(new Event('change', { bubbles: true }));
                        } else {
                            console.warn(`⚠️ Could not find eBay's condition textarea`);
                        }
                    }, 1000); // Wait a bit longer for eBay's DOM to update
                }
            } else {
                console.warn(`⚠️ Could not find condition section to modify`);
            }
        }

        // Wait a bit more to ensure all async operations are complete
        await new Promise(resolve => setTimeout(resolve, 1000));

        // VALIDATION CHECKS AT THE END OF FORM FILLING
        
        // First check for category mismatch
        if (window.categoryMismatch) {
            const mismatch = window.categoryMismatch;
            console.warn(`⚠️ Category mismatch detected: intended "${mismatch.intended}" but selected "${mismatch.selected}"`);
            
            // Remove loading overlay first
            removeLoadingOverlay();
            
            const userConfirmed = confirm(
                `⚠️ CATEGORY MISMATCH DETECTED!\n\n` +
                `Intended Category: "${mismatch.intended}"\n` +
                `Selected Category: "${mismatch.selected}"\n` +
                `Search Term Used: "${mismatch.searchTerm}"\n\n` +
                `This happened because the "&" character in the category name caused search issues.\n` +
                `Please verify and manually correct the category if needed.\n\n` +
                `Click OK to continue, or Cancel to review the category selection.`
            );
            
            if (!userConfirmed) {
                // Focus on the category field with visual highlight
                const categoryTrigger = document.querySelector('button[data-testid="category-field-trigger"]') ||
                                      document.querySelector('.category-picker__trigger') ||
                                      document.querySelector('[data-testid="category"]') ||
                                      document.querySelector('.category-field button') ||
                                      document.querySelector('button[aria-label*="category"]');
                
                if (categoryTrigger) {
                    categoryTrigger.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    categoryTrigger.focus();
                    categoryTrigger.style.border = '3px solid red';
                    categoryTrigger.style.backgroundColor = '#ffe6e6';
                    setTimeout(() => {
                        categoryTrigger.style.border = '';
                        categoryTrigger.style.backgroundColor = '';
                    }, 5000);
                    console.warn('🎯 Category field focused for user review');
                } else {
                    console.warn('⚠️ Category field not found for focus');
                }
                
                // Clear the mismatch flag and stop execution
                delete window.categoryMismatch;
                isCurrentlyFilling = false;
                return;
            }
            
            // Clear the mismatch flag if user confirmed
            delete window.categoryMismatch;
        }

        // Check for country of manufacture - required field enforcement (at the end)
        const hasCountryOfManufacture = data.countryRegionOfManufacture || 
                                       data.countryOfManufacture || 
                                       data['country/region of manufacture'] ||
                                       data.country;
        
        if (!hasCountryOfManufacture) {
            console.warn('⚠️ No country of manufacture found in data - this is required information');
            
            // Remove loading overlay first
            removeLoadingOverlay();
            
            // Show warning dialog that requires acknowledgment
            const userConfirmed = confirm(
                '⚠️ WARNING: Country of Manufacture Missing!\n\n' +
                'This is a key piece of information required for eBay listings.\n' +
                'You will need to manually fill this field before publishing.\n\n' +
                'Click OK to continue and focus on the images panel,\n' +
                'or Cancel to stop the auto-fill process.'
            );
            
            if (!userConfirmed) {
                console.warn('❌ User cancelled auto-fill due to missing country of manufacture');
                isCurrentlyFilling = false;
                return;
            }
        } else {
            // Remove loading overlay if country of manufacture is present
            removeLoadingOverlay();
        }
        
        // Focus on the images panel (div class=uploader-ui)
        const imagesPanel = document.querySelector('div.uploader-ui, .uploader-ui, [data-testid="uploader-ui"], .photo-upload, .image-upload');
        if (imagesPanel) {
            console.warn('📸 Focusing on images panel for user attention');
            imagesPanel.focus();
            imagesPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            // Add a subtle highlight to draw attention to the images area
            const originalBorder = imagesPanel.style.border;
            imagesPanel.style.border = '3px solid #ff6b35';
            imagesPanel.style.transition = 'border 0.3s ease';
            
            // Remove highlight after 3 seconds
            setTimeout(() => {
                imagesPanel.style.border = originalBorder;
            }, 3000);
        } else {
            console.warn('⚠️ Could not find images panel to focus on');
            // Fallback to title input if images panel not found
            const titleInputFinal = document.querySelector('input[name="title"]');
            if (titleInputFinal) {
                titleInputFinal.focus();
                titleInputFinal.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
        
    } catch (error) {
        console.error('❌ Error filling fields:', error);
        removeLoadingOverlay();
        isCurrentlyFilling = false;  // Reset flag on error
        alert('Error filling some fields. Please check the console for details.');
    } finally {
        clearTimeout(safetyTimeout);  // Clear safety timeout
        isCurrentlyFilling = false;  // Always reset flag when done
    }
}

function createLoadingOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'ebay-xlister-loading-overlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.7);
        z-index: 10000;
        display: flex;
        justify-content: center;
        align-items: center;
        font-family: Arial, sans-serif;
    `;
    
    const messageBox = document.createElement('div');
    messageBox.style.cssText = `
        background-color: white;
        padding: 30px;
        border-radius: 10px;
        text-align: center;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        max-width: 400px;
    `;
    
    const spinner = document.createElement('div');
    spinner.style.cssText = `
        border: 4px solid #f3f3f3;
        border-top: 4px solid #3498db;
        border-radius: 50%;
        width: 40px;
        height: 40px;
        animation: spin 1s linear infinite;
        margin: 0 auto 20px auto;
    `;
    
    const message = document.createElement('div');
    message.id = 'loading-message';
    message.textContent = 'Please wait while we populate your listing details...';
    message.style.cssText = `
        font-size: 16px;
        color: #333;
        font-weight: 500;
    `;
    
    // Add CSS animation for spinner
    const style = document.createElement('style');
    style.textContent = `
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    `;
    document.head.appendChild(style);
    
    messageBox.appendChild(spinner);
    messageBox.appendChild(message);
    overlay.appendChild(messageBox);
    
    return overlay;
}

function updateLoadingMessage(newMessage) {
    const messageElement = document.getElementById('loading-message');
    if (messageElement) {
        messageElement.textContent = newMessage;
    }
}

function removeLoadingOverlay() {
    const overlay = document.getElementById('ebay-xlister-loading-overlay');
    if (overlay) {
        overlay.remove();
    }
}

async function handleImageUpload(imageUrls) {
    try {
        // Update loading message
        updateLoadingMessage(`Uploading ${imageUrls.length} images...`);
        
        // Find the image upload area
        const uploadArea = await findImageUploadArea();
        if (!uploadArea) {
            console.error('❌ Could not find image upload area');
            updateLoadingMessage('Could not find image upload area. Continuing with other fields...');
            await new Promise(resolve => setTimeout(resolve, 2000));
            return;
        }
        
        // Process images one by one to avoid overwhelming eBay's servers
        for (let i = 0; i < imageUrls.length; i++) {
            const imageUrl = imageUrls[i];
            
            // Update progress message
            updateLoadingMessage(`Uploading image ${i + 1} of ${imageUrls.length}...`);
            
            try {
                await uploadSingleImage(imageUrl, uploadArea);
                // Wait between uploads to be respectful to eBay's servers
                if (i < imageUrls.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1500));
                }
            } catch (error) {
                console.error(`❌ Failed to upload image ${i + 1}:`, error);
                // Continue with next image even if one fails
            }
        }
        
        updateLoadingMessage('Images uploaded! Finishing up...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
    } catch (error) {
        console.error('❌ Error in image upload process:', error);
        updateLoadingMessage('Error uploading images. Continuing with other fields...');
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
}

async function findImageUploadArea() {
    // Try multiple selectors for the image upload area on eBay.ca
    const selectors = [
        // eBay specific photo upload selectors
        'input[type="file"][accept*="image"]',
        'input[name*="photo"]',
        'input[name*="image"]',
        // Upload buttons and areas
        'button[aria-label*="upload"], button[aria-label*="Upload"]',
        'button[aria-label*="photo"], button[aria-label*="Photo"]',
        'button[aria-label*="Add photo"], button[aria-label*="Add Photo"]',
        // Upload zones and containers
        '[data-testid*="image-upload"], [data-testid*="photo-upload"]',
        '[data-testid*="upload-zone"], [data-testid*="photo-zone"]',
        '.image-upload, .photo-upload, .upload-zone',
        '.se-photo-upload, .photo-upload-container',
        // Generic upload areas
        '.file-upload, .upload-area',
        '[role="button"][aria-label*="upload"]'
    ];
    
    for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element) {
            return element;
        }
    }
    
    // If no direct upload found, look for "Add photos" or similar buttons
    console.log('🔍 Looking for "Add photos" buttons...');
    const addPhotoButtons = Array.from(document.querySelectorAll('button, a, div')).filter(el => {
        const text = el.textContent.toLowerCase();
        const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
        return text.includes('add photo') || text.includes('upload') || text.includes('add image') ||
               ariaLabel.includes('add photo') || ariaLabel.includes('upload') || ariaLabel.includes('add image');
    });
    
    if (addPhotoButtons.length > 0) {
        console.log('✅ Found "Add photos" button:', addPhotoButtons[0].textContent.trim());
        return addPhotoButtons[0];
    }
    
    // Final attempt: look for any file input
    const anyFileInput = document.querySelector('input[type="file"]');
    if (anyFileInput) {
        return anyFileInput;
    }
    
    console.warn('⚠️ Could not find any image upload element');
    return null;
}

async function uploadSingleImage(imageUrl, uploadElement) {
    try {
        // Method 1: Try to convert URL to File object and upload
        const file = await urlToFile(imageUrl);
        if (file && uploadElement.tagName === 'INPUT' && uploadElement.type === 'file') {
            // Create a new DataTransfer object to simulate file selection
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            uploadElement.files = dataTransfer.files;
            
            // Trigger the change event
            uploadElement.dispatchEvent(new Event('change', { bubbles: true }));
            return;
        }
        
        // Method 2: Try to trigger file dialog and use drag-and-drop simulation
        if (uploadElement.tagName === 'BUTTON' || uploadElement.classList.contains('upload')) {
            // Click the upload button to open file dialog
            uploadElement.click();
            
            // Wait for file input to appear
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Try to find the file input that appeared
            const fileInput = document.querySelector('input[type="file"]:not([style*="display: none"])');
            if (fileInput && file) {
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(file);
                fileInput.files = dataTransfer.files;
                fileInput.dispatchEvent(new Event('change', { bubbles: true }));
                console.log('📁 Uploaded via opened file dialog:', imageUrl);
                return;
            }
        }
        
        // Method 3: Try drag and drop simulation
        if (file) {
            await simulateDragAndDrop(uploadElement, file);
            console.log('🎯 Uploaded via drag and drop simulation:', imageUrl);
            return;
        }
        
        console.warn('⚠️ Could not upload image:', imageUrl);
        
    } catch (error) {
        console.error('❌ Error uploading image:', imageUrl, error);
        throw error;
    }
}

async function urlToFile(imageUrl) {
        try {
            console.warn('🌐 Requesting image from background script:', imageUrl);        // Send message to background script to fetch the image
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
                action: 'fetchImageAsBlob',
                imageUrl: imageUrl
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('❌ Chrome runtime error:', chrome.runtime.lastError);
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }
                
                if (response && response.success) {
                    // Convert base64 to blob
                    const base64Data = response.base64Data;
                    const mimeType = response.mimeType || 'image/jpeg';
                    
                    console.log(`📐 Image dimensions: ${response.originalDimensions} → ${response.finalDimensions}`);
                    
                    try {
                        // Convert base64 to blob
                        const byteCharacters = atob(base64Data);
                        const byteNumbers = new Array(byteCharacters.length);
                        for (let i = 0; i < byteCharacters.length; i++) {
                            byteNumbers[i] = byteCharacters.charCodeAt(i);
                        }
                        const byteArray = new Uint8Array(byteNumbers);
                        const blob = new Blob([byteArray], { type: mimeType });
                        
                        // Check and resize the image if needed in content script
                        const img = new Image();
                        img.onload = () => {
                            const originalWidth = img.width;
                            const originalHeight = img.height;
                            
                            console.warn(`📏 Image dimensions: ${originalWidth}x${originalHeight}`);
                            
                            // Skip images that are too small (thumbnails from expired listings)
                            if (originalWidth < 100 || originalHeight < 100) {
                                reject(new Error(`Image too small (${originalWidth}x${originalHeight}) - likely thumbnail from expired listing`));
                                return;
                            }
                            
                            let newWidth = originalWidth;
                            let newHeight = originalHeight;
                            
                            // If width is less than 500px, scale up to 500px width while maintaining aspect ratio
                            if (originalWidth < 500) {
                                const scaleFactor = 500 / originalWidth;
                                newWidth = 500;
                                newHeight = Math.round(originalHeight * scaleFactor);
                                console.log(`📈 Scaling up image to: ${newWidth}x${newHeight}`);
                            }
                            
                            if (newWidth !== originalWidth || newHeight !== originalHeight) {
                                // Need to resize
                                const canvas = document.createElement('canvas');
                                const ctx = canvas.getContext('2d');
                                
                                canvas.width = newWidth;
                                canvas.height = newHeight;
                                
                                ctx.drawImage(img, 0, 0, newWidth, newHeight);
                                
                                canvas.toBlob((resizedBlob) => {
                                    const filename = imageUrl.split('/').pop().split('?')[0] || 'image.jpg';
                                    const file = new File([resizedBlob], filename, { type: 'image/jpeg' });
                                    
                                    console.log(`📁 Created resized file: ${filename} (${(resizedBlob.size / 1024).toFixed(1)}KB) ${newWidth}x${newHeight}`);
                                    resolve(file);
                                }, 'image/jpeg', 0.9);
                            } else {
                                // No resize needed
                                const filename = imageUrl.split('/').pop().split('?')[0] || 'image.jpg';
                                const file = new File([blob], filename, { type: mimeType });
                                
                                console.log(`📁 Created file: ${filename} (${(blob.size / 1024).toFixed(1)}KB) ${originalWidth}x${originalHeight}`);
                                resolve(file);
                            }
                        };
                        
                        img.onerror = (error) => {
                            console.error('❌ Image load error:', error);
                            reject(new Error('Failed to load image for resizing'));
                        };
                        
                        // Create object URL from blob to load into image
                        const objectUrl = URL.createObjectURL(blob);
                        img.src = objectUrl;
                        
                    } catch (conversionError) {
                        console.error('❌ Error converting base64 to file:', conversionError);
                        reject(conversionError);
                    }
                } else {
                    const errorMsg = response?.error || 'Failed to fetch image';
                    console.error('❌ Background script returned error:', errorMsg);
                    reject(new Error(errorMsg));
                }
            });
        });
    } catch (error) {
        console.error('❌ Error converting URL to file:', error);
        throw error;
    }
}

async function simulateDragAndDrop(targetElement, file) {
    try {
        console.log('🎯 Starting drag and drop simulation with file:', file.name, file.size);
        
        // Create drag and drop events
        const dragEnterEvent = new DragEvent('dragenter', {
            bubbles: true,
            cancelable: true,
            dataTransfer: new DataTransfer()
        });
        
        const dragOverEvent = new DragEvent('dragover', {
            bubbles: true,
            cancelable: true,
            dataTransfer: new DataTransfer()
        });
        
        const dropEvent = new DragEvent('drop', {
            bubbles: true,
            cancelable: true,
            dataTransfer: new DataTransfer()
        });
        
        // Add file to drop event
        dropEvent.dataTransfer.items.add(file);
        
        // Simulate the drag and drop sequence
        targetElement.dispatchEvent(dragEnterEvent);
        await new Promise(resolve => setTimeout(resolve, 100));
        
        targetElement.dispatchEvent(dragOverEvent);
        await new Promise(resolve => setTimeout(resolve, 100));
        
        targetElement.dispatchEvent(dropEvent);
        await new Promise(resolve => setTimeout(resolve, 500));
        
        console.log('✅ Drag and drop simulation completed');
    } catch (error) {
        console.error('❌ Error in drag and drop simulation:', error);
        throw error;
    }
}

async function saveDraft() {
    const saveButton = document.querySelector('button[aria-label="Save for later"]');
    if (saveButton) {
        saveButton.click();
        alert('Draft saved!');
    } else {
        alert('Save button not found.');
    }
}


chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || !msg.action) return;

    // Add timestamp to prevent rapid duplicate calls
    const now = Date.now();
    if (window.lastFillTimestamp && (now - window.lastFillTimestamp) < 2000) {
        console.warn('⚠️ Ignoring duplicate fill request (too soon after last request)');
        return;
    }

    if (msg.action === 'update' || msg.action === 'fillForm') {
        window.lastFillTimestamp = now;
        fillFields(msg.data);
    } else if (msg.action === 'save') {
        window.lastFillTimestamp = now;
        fillFields(msg.data).then(saveDraft);
    } else if (msg.action === 'extractedEbayComData') {
        // This is for manual popup workflow - just log for now
    }
});

// Listen for direct trigger from background script (used in auto-bridging)
window.addEventListener('message', function(event) {
    if (event.source !== window) return;
    
    if (event.data.source === 'EBAY_US_CA_BRIDGE_TRIGGER') {
        // Get the saved JSON data from storage and fill the form
        chrome.storage.local.get('latestEbayJson', ({ latestEbayJson }) => {
            if (latestEbayJson) {
                fillFields(latestEbayJson);
            } else {
                console.error('❌ No saved data found for bridging');
            }
        });
    }
});

// Keyboard shortcut handler: Cmd+Period (Mac) or Ctrl+Period (Windows/Linux)
document.addEventListener('keydown', function(event) {
    // Check for Cmd+Period (Mac) or Ctrl+Period (Windows/Linux)
    const isShortcut = (event.metaKey || event.ctrlKey) && event.key === '.';
    
    if (isShortcut) {
        // Throttle rapid keyboard shortcuts
        const now = Date.now();
        if (window.lastKeyboardShortcut && (now - window.lastKeyboardShortcut) < 1000) {
            console.warn('⚠️ Keyboard shortcut throttled (too rapid)');
            event.preventDefault();
            return;
        }
        window.lastKeyboardShortcut = now;
        
        event.preventDefault();
        
        const currentUrl = window.location.href;
        
        // Determine action based on current page
        if (currentUrl.includes('ebay.ca') && currentUrl.includes('/lstng')) {
            // eBay.ca listing page - Fill form with saved data
            chrome.storage.local.get('latestEbayJson', ({ latestEbayJson }) => {
                if (latestEbayJson) {
                    fillFields(latestEbayJson);
                } else {
                    alert('⚠️ No saved JSON data found. Please extract data from an eBay.com listing first.');
                }
            });
            
        } else if (currentUrl.includes('ebay.com') && (currentUrl.includes('/lstng') || currentUrl.includes('/sl/list'))) {
            // eBay.com listing page - Extract data and bridge to eBay.ca
            
            // Start the extraction with keyboard shortcut flag
            chrome.runtime.sendMessage({ 
                action: "extractEbayComListing",
                fromKeyboardShortcut: true 
            }, (response) => {
                // Response handled silently
            });
            
        } else if (currentUrl.includes('ebay.com') && currentUrl.includes('/itm/')) {
            // eBay.com item page - Navigate to edit mode
            const itemIdMatch = currentUrl.match(/\/itm\/(\d+)/);
            
            if (itemIdMatch) {
                const itemId = itemIdMatch[1];
                const editUrl = `https://www.ebay.com/sl/list?itemId=${itemId}&mode=ReviseItem`;
                window.location.href = editUrl;
            } else {
                alert('❌ Could not extract item ID from URL');
            }
            
        } else if (currentUrl.includes('chatgpt.com')) {
            // ChatGPT page - Extract JSON and create listing
            chrome.runtime.sendMessage({ action: "extractJsonFromChatGPT" });
            
        } else {
            // Unknown page - show help
            alert(`⌨️ Keyboard Shortcut Help (Cmd/Ctrl + Period):

🇺🇸 eBay.com listing page: Extract data & bridge to eBay.ca
📦 eBay.com item page: Navigate to edit mode  
🇨🇦 eBay.ca listing page: Fill form with saved data
🤖 ChatGPT page: Extract JSON from conversation

Current page not supported: ${window.location.hostname}`);
        }
    }
});
