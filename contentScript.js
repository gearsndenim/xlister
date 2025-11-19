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

// Map country names from US eBay format to Canadian eBay format
function mapCountryForCanada(countryName) {
    if (!countryName) return countryName;
    
    const countryMappings = {
        'turkey': 'türkiye',
        'south korea': 'korea, south',
        'north korea': 'korea, north', 
        'united states': 'united states',
        'united kingdom': 'united kingdom',
        'china': 'china',
        'vietnam': 'viet nam',
        'russia': 'russian federation',
        'iran': 'iran, islamic republic of',
        'syria': 'syrian arab republic',
        'venezuela': 'venezuela, bolivarian republic of',
        'bolivia': 'bolivia, plurinational state of',
        'macedonia': 'north macedonia',
        'czech republic': 'czechia',
        'congo': 'congo, the democratic republic of the',
        'cape verde': 'cabo verde',
        'myanmar': 'myanmar',
        'burma': 'myanmar', // Burma is also Myanmar
        'ivory coast': 'côte d\'ivoire',
        'swaziland': 'eswatini'
    };
    
    const normalizedInput = countryName.toLowerCase().trim();
    
    // Check if we have a direct mapping
    if (countryMappings[normalizedInput]) {
        return countryMappings[normalizedInput];
    }
    
    // Return original if no mapping found
    return countryName;
}

async function fillDropdown(buttonSelector, searchInputSelector, value) {
    const button = document.querySelector(buttonSelector);
    if (!button) return;
    
    // Safety check: prevent theme values from being set in brand field
    if (buttonSelector.includes('Brand') && ['Sports', 'Art', 'Beach', 'Bike', 'Bohemian', 'California', 'Classic', 'College', 'Logo'].includes(value)) {
        console.warn(`🚫 Prevented theme value "${value}" from being set in brand field`);
        return;
    }
    
    button.click();
    await new Promise(resolve => setTimeout(resolve, 300)); // Give time for dropdown to open
    
    const input = await waitForSelector(searchInputSelector);
    if (!input) {
        console.warn(`⚠️ Could not find input for ${buttonSelector}`);
        return;
    }

    // Apply country mapping for Country/Region of Manufacture field
    let searchValue = value;
    if (buttonSelector.includes('Country/Region of Manufacture')) {
        searchValue = mapCountryForCanada(value);
        if (searchValue !== value) {
            console.log(`🗺️ Country mapping: "${value}" → "${searchValue}"`);
        }
    }
    
    input.focus();
    input.value = searchValue;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Look for dropdown menu within the button's container to avoid cross-field pollution
    const container = button.closest('.field') || button.closest('.form-field') || button.parentElement;
    
    // First try standard menu items
    let dropdownMenu = container?.querySelector('.menu__items') || button.parentElement.querySelector('.menu__items');
    let menuItems = Array.from(dropdownMenu?.querySelectorAll('span') || []);
    let match = menuItems.find(item => item.innerText.trim().toLowerCase() === searchValue.trim().toLowerCase());
    
    // If not found and this is a country field, try fuzzy matching with original value too
    if (!match && buttonSelector.includes('Country/Region of Manufacture')) {
        match = menuItems.find(item => {
            const itemText = item.innerText.trim().toLowerCase();
            const originalLower = value.trim().toLowerCase();
            const searchLower = searchValue.trim().toLowerCase();
            
            return itemText === originalLower || itemText === searchLower ||
                   itemText.includes(originalLower) || itemText.includes(searchLower) ||
                   originalLower.includes(itemText) || searchLower.includes(itemText);
        });
        
        if (match) {
            console.log(`🎯 Found country match via fuzzy search: "${match.innerText.trim()}" for "${value}"`);
        }
    }
    
    // If not found, try filter menu items (used for Performance/Activity and similar fields)
    if (!match) {
        const filterMenuItems = Array.from(document.querySelectorAll('.filter-menu__item'));
        console.log(`🔍 Found ${filterMenuItems.length} filter menu items, searching for: "${searchValue}"`);
        
        match = filterMenuItems.find(item => {
            const text = item.querySelector('.filter-menu__text');
            const textContent = text?.textContent?.trim()?.toLowerCase();
            const isMatch = textContent === searchValue.trim().toLowerCase();
            if (isMatch) {
                console.log(`✅ Found exact match in filter menu for "${searchValue}": ${textContent}`);
            }
            return isMatch;
        });
    }
    
    if (match) {
        // Check if it's a filter menu item that needs special handling
        if (match.classList.contains('filter-menu__item')) {
            const isChecked = match.getAttribute('aria-checked') === 'true';
            if (!isChecked) {
                console.log(`🎯 Selecting filter menu item "${searchValue}"`);
                match.click();
                await new Promise(resolve => setTimeout(resolve, 150));
                
                // Close the dropdown after selection
                document.body.click();
                await new Promise(resolve => setTimeout(resolve, 300));
            } else {
                console.log(`✓ "${searchValue}" already selected in filter menu`);
            }
        } else {
            // Regular menu item
            match.click();
        }
        console.log(`✅ Selected "${searchValue}" for ${buttonSelector}`);
    } else {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        console.log(`⌨️ Used Enter key for "${searchValue}" in ${buttonSelector}`);
    }
}

async function fillMultiSelect(buttonSelector, searchInputSelector, values) {
    const button = document.querySelector(buttonSelector);
    if (!button) return;
    
    console.log(`🔧 Opening multi-select for: ${buttonSelector}`);
    
    // Open dropdown once at the beginning
    button.click();
    await new Promise(resolve => setTimeout(resolve, 800));
    
    // Find the search input - start with the specific selector
    let input = document.querySelector(searchInputSelector);
    
    // If not found, try to find input within the button's immediate area
    if (!input) {
        // First try to find the input within the button's container/parent
        const container = button.closest('.field') || button.closest('.form-field') || button.parentElement;
        if (container) {
            const containerInputs = container.querySelectorAll('input[placeholder*="Search"], .filter-menu input[type="text"]');
            for (const inp of containerInputs) {
                if (inp.offsetParent !== null) { // Check if visible
                    input = inp;
                    console.log(`📍 Found multi-select input in container: ${inp.placeholder || inp.name || 'unnamed'}`);
                    break;
                }
            }
        }
        
        // If still not found, look for the input that just appeared (likely the one we opened)
        if (!input) {
            const potentialInputs = document.querySelectorAll('input[placeholder*="Search"], .filter-menu input[type="text"]');
            
            // Try to find the input that's visible and in the right context
            for (const inp of potentialInputs) {
                const inputRect = inp.getBoundingClientRect();
                const buttonRect = button.getBoundingClientRect();
                
                // Check if the input is visible and near the button
                if (inputRect.height > 0 && inputRect.width > 0) {
                    // Check if it's in a reasonable position relative to the button
                    const isNearButton = Math.abs(inputRect.top - buttonRect.bottom) < 200;
                    if (isNearButton) {
                        input = inp;
                        console.log(`📍 Found multi-select input near button: ${inp.placeholder || inp.name || 'unnamed'}`);
                        break;
                    }
                }
            }
        }
    }
    
    if (!input) {
        console.warn(`⚠️ Could not find search input for multi-select field ${buttonSelector}`);
        document.body.click();
        return;
    }
    
    console.log(`✅ Using input for multi-select: ${input.placeholder || input.name || 'unnamed'}`);
    
    // Verify this is the right input by checking it's not conflicting with expected field
    const inputName = (input.name || '').toLowerCase();
    const inputPlaceholder = (input.placeholder || '').toLowerCase();
    const expectedFieldType = buttonSelector.toLowerCase();
    
    // Extract the expected field name from button selector
    const buttonNameMatch = buttonSelector.match(/name="attributes\.([^"]+)"/);
    const expectedFieldName = buttonNameMatch ? buttonNameMatch[1].toLowerCase().replace(/\s+/g, '').replace(/[^a-z]/g, '') : '';
    
    console.log(`🔍 Multi-select field check: expected="${expectedFieldName}", input name="${inputName}", placeholder="${inputPlaceholder}"`);
    
    // Build expected input name variations for the target field
    const expectedInputVariations = [
        `search-box-attributes${expectedFieldName}`,
        `attributes${expectedFieldName}`,
        expectedFieldName
    ];
    
    // Check if the current input matches any of the expected variations
    const isCorrectInput = expectedInputVariations.some(variation => 
        inputName.includes(variation) || inputPlaceholder.includes(variation)
    );
    
    // Only abort if we detect a clearly conflicting field (wrong field entirely)
    const isConflictingField = !isCorrectInput && (
        (inputName.includes('brand') && expectedFieldName !== 'brand') ||
        (inputName.includes('size') && expectedFieldName !== 'size') ||
        (inputName.includes('color') && expectedFieldName !== 'color') ||
        (inputName.includes('type') && expectedFieldName !== 'type') ||
        (inputName.includes('style') && expectedFieldName !== 'style')
    );
    
    if (isConflictingField) {
        console.warn(`⚠️ Detected wrong input field (${inputName || inputPlaceholder}), expected ${expectedFieldName}, aborting multi-select for ${buttonSelector}`);
        document.body.click();
        
        // Try to find the correct input field using more specific selectors
        const correctInputSelectors = [
            `input[name="search-box-attributes${expectedFieldName.charAt(0).toUpperCase() + expectedFieldName.slice(1)}"]`,
            `input[name*="attributes${expectedFieldName.charAt(0).toUpperCase() + expectedFieldName.slice(1)}"]`,
            `input[name*="search-box-attributes${expectedFieldName}"]`,
            `input[name*="attributes${expectedFieldName}"]`,
            `input[placeholder*="${expectedFieldName}"]`
        ];
        
        for (const selector of correctInputSelectors) {
            const correctInput = document.querySelector(selector);
            if (correctInput && !correctInput.name.includes('brand') && correctInput !== input) {
                console.log(`🔧 Found correct input for ${expectedFieldName}: ${correctInput.name || correctInput.placeholder}`);
                input = correctInput;
                break;
            }
        }
        
        // If still no correct input found, skip this field
        if (!input || input.name.includes('brand')) {
            console.warn(`❌ Could not find correct input field for ${expectedFieldName}, skipping`);
            return false;
        }
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
    
    // Look for matching menu items - be more specific about which menu we're looking at
    const menuItems = Array.from(document.querySelectorAll('.filter-menu__item'));
    console.log(`🔍 Found ${menuItems.length} menu items, searching for: "${value}"`);
    
    const match = menuItems.find(item => {
        const text = item.querySelector('.filter-menu__text');
        const textContent = text?.textContent?.trim()?.toLowerCase();
        const isMatch = textContent === value.trim().toLowerCase();
        if (isMatch) {
            console.log(`✅ Found exact match for "${value}": ${textContent}`);
        }
        return isMatch;
    });
    
    if (match) {
        const isChecked = match.getAttribute('aria-checked') === 'true';
        if (!isChecked) {
            // Select the item efficiently
            console.log(`🎯 Selecting "${value}" in multi-select`);
            match.click();
            selectedCount.count++;
            await new Promise(resolve => setTimeout(resolve, 150));
        } else {
            console.log(`✓ "${value}" already selected`);
        }
    } else {
        // Try Enter key as fallback for custom values
        console.log(`⌨️ No exact match found for "${value}", trying Enter key`);
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
    console.log(`🔍 Scoring: "${labelText}" vs target "${targetCategory}"`);
    console.log(`📍 Target path: "${targetPath}"`);
    console.log(`👤 Category info:`, categoryInfo);
    
    // 1. Category name matching (most important)
    if (labelLower === targetLower) {
        score += 100;
        reasons.push('exact category name match');
    } else if (labelLower.includes(targetLower)) {
        score += 80;
        reasons.push('partial category name match');
        
        // CRITICAL: Check for subcategory mismatch (tops vs shorts, etc.)
        const targetWords = targetLower.split(' ');
        const labelWords = labelLower.split(' ');
        
        for (const targetWord of targetWords) {
            if (targetWord === 'tops' && labelWords.includes('shorts')) {
                score -= 2000; // MASSIVE penalty for tops vs shorts mismatch
                reasons.push('SUBCATEGORY MISMATCH (tops vs shorts) - MASSIVE PENALTY');
                console.warn(`🚫 SUBCATEGORY MISMATCH: Target needs "tops" but found "shorts": ${labelText}`);
                break;
            } else if (targetWord === 'shorts' && labelWords.includes('tops')) {
                score -= 2000; // MASSIVE penalty for shorts vs tops mismatch
                reasons.push('SUBCATEGORY MISMATCH (shorts vs tops) - MASSIVE PENALTY');
                console.warn(`🚫 SUBCATEGORY MISMATCH: Target needs "shorts" but found "tops": ${labelText}`);
                break;
            }
        }
    } else if (targetLower.includes(labelLower)) {
        score += 60;
        reasons.push('category name contains match');
    }
    
    // SPECIAL BONUS: Perfect gender + category match
    const departmentFromData = (categoryInfo?.department || window.currentListingData?.department || '').toLowerCase();
    if (departmentFromData && labelLower.includes(targetLower)) {
        if ((departmentFromData === 'men' && labelLower.includes('men')) ||
            (departmentFromData === 'women' && labelLower.includes('women'))) {
            score += 1000; // Huge bonus for correct gender + category combination
            reasons.push('PERFECT GENDER + CATEGORY MATCH - HUGE BONUS');
            console.log(`✅ PERFECT MATCH: ${departmentFromData} + ${targetCategory} = ${labelText}`);
        }
    }
    
    // 2. Gender/department matching (very important for disambiguation)
    if (targetPathLower) {
        console.log(`🚻 Gender analysis: targetPath="${targetPathLower}"`);
        if (targetPathLower.includes('men') && !targetPathLower.includes('women')) {
            // This is a men's item
            console.log(`♂️ Detected men's item from path`);
            if (labelLower.includes('men') && !labelLower.includes('women')) {
                score += 200; // Strong bonus for correct gender
                reasons.push('men\'s category match');
            } else if (labelLower.includes('women') || labelLower.includes('ladies')) {
                score -= 1000; // Very strong penalty for wrong gender
                reasons.push('wrong gender (women vs men) - MAJOR PENALTY');
                console.warn(`🚫 GENDER MISMATCH: Target is men's but found women's category: ${labelText}`);
            }
        } else if (targetPathLower.includes('women') || targetPathLower.includes('ladies')) {
            // This is a women's item
            console.log(`♀️ Detected women's item from path`);
            if (labelLower.includes('women') || labelLower.includes('ladies')) {
                score += 200; // Strong bonus for correct gender
                reasons.push('women\'s category match');
            } else if (labelLower.includes('men') && !labelLower.includes('women')) {
                score -= 1000; // Very strong penalty for wrong gender
                reasons.push('wrong gender (men vs women) - MAJOR PENALTY');
                console.warn(`🚫 GENDER MISMATCH: Target is women's but found men's category: ${labelText}`);
            }
        } else {
            console.log(`⚪ No clear gender detected in path`);
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
            console.log(`♀️ Detected women's item from categoryInfo`);
            if (labelLower.includes('women') || labelLower.includes('ladies')) {
                score += 150; // Strong bonus for correct gender from info
                reasons.push('women\'s category match (from info)');
            } else if (labelLower.includes('men') && !labelLower.includes('women')) {
                score -= 800; // Strong penalty for wrong gender from info
                reasons.push('wrong gender from info (men vs women) - MAJOR PENALTY');
                console.warn(`🚫 GENDER MISMATCH (from info): Target is women's but found men's category: ${labelText}`);
            }
        } else if (categoryData.includes('men') && !categoryData.includes('women')) {
            console.log(`♂️ Detected men's item from categoryInfo`);
            if (labelLower.includes('men') && !labelLower.includes('women')) {
                score += 150; // Strong bonus for correct gender from info
                reasons.push('men\'s category match (from info)');
            } else if (labelLower.includes('women') || labelLower.includes('ladies')) {
                score -= 800; // Strong penalty for wrong gender from info
                reasons.push('wrong gender from info (women vs men) - MAJOR PENALTY');
                console.warn(`🚫 GENDER MISMATCH (from info): Target is men's but found women's category: ${labelText}`);
            }
        }
    }
    
    // Check department field directly from listing data for even stronger gender enforcement
    const listingData = window.currentListingData;
    if (listingData && listingData.department) {
        const department = listingData.department.toLowerCase();
        console.log(`👔 Department check: department="${department}"`);
        if (department === 'men') {
            if (labelLower.includes('men') && !labelLower.includes('women')) {
                score += 300; // Very strong bonus for correct department match
                reasons.push('department match (men)');
                console.log(`✅ DEPARTMENT MATCH: Men's department matches men's category: ${labelText}`);
            } else if (labelLower.includes('women') || labelLower.includes('ladies')) {
                score -= 1500; // MASSIVE penalty for wrong department
                reasons.push('DEPARTMENT MISMATCH (women vs men) - MASSIVE PENALTY');
                console.error(`🚫 DEPARTMENT MISMATCH: Men's item but found women's category: ${labelText}`);
            }
        } else if (department === 'women') {
            if (labelLower.includes('women') || labelLower.includes('ladies')) {
                score += 300; // Very strong bonus for correct department match
                reasons.push('department match (women)');
                console.log(`✅ DEPARTMENT MATCH: Women's department matches women's category: ${labelText}`);
            } else if (labelLower.includes('men') && !labelLower.includes('women')) {
                score -= 1500; // MASSIVE penalty for wrong department
                reasons.push('DEPARTMENT MISMATCH (men vs women) - MASSIVE PENALTY');
                console.error(`🚫 DEPARTMENT MISMATCH: Women's item but found men's category: ${labelText}`);
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
        score: score, // Allow negative scores for gender mismatches
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
    
    // Debug: Log all JSON data keys that might be country-related
    console.log('🗂️ ========== JSON DATA DEBUG ==========');
    console.log('🗂️ All keys in JSON data:', Object.keys(data));
    console.log('🗂️ Country-related fields in JSON:');
    Object.keys(data).forEach(key => {
        if (key.toLowerCase().includes('country') || key.toLowerCase().includes('origin') || key.toLowerCase().includes('manufacture')) {
            console.log(`🗂️   - ${key}: "${data[key]}"`);
        }
    });
    console.log('🗂️ ======================================');
    
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
        
        // Brand verification will be done during form verification if needed

        async function handleCategorySelection(data) {
            // Handle both eBay categories and Store categories
            let targetProductCategory = null;
            let targetStoreCategory = '0–30 days'; // Default store category
            let categoryPath = null;
            let isInferred = false;
            
            if (data.categoryInfo) {
                targetProductCategory = data.categoryInfo.category;
                // Override default only if a store category was provided
                if (data.categoryInfo.storeCategory) {
                    targetStoreCategory = data.categoryInfo.storeCategory;
                }
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
            console.log('🏪 ========== STORE CATEGORY HANDLING ==========');
            console.log('🏪 Target store category:', storeCategory);
            
            // Look for store category selection elements
            const storeCategoryButton = document.querySelector('button[name="primaryStoreCategoryId"], button[name="storeCategoryId"]');
            console.log('🏪 Store category button found:', !!storeCategoryButton);
            
            if (storeCategoryButton) {
                console.log('🏪 Clicking store category button...');
                console.log('🏪 Button element:', storeCategoryButton);
                console.log('🏪 Button text:', storeCategoryButton.textContent);
                console.log('🏪 Button name:', storeCategoryButton.getAttribute('name'));
                
                // Scroll button into view first
                storeCategoryButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await new Promise(resolve => setTimeout(resolve, 300));
                
                // Try multiple click methods
                storeCategoryButton.focus();
                await new Promise(resolve => setTimeout(resolve, 100));
                
                // Method 1: Direct click
                storeCategoryButton.click();
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // Method 2: MouseEvent if first didn't work
                const clickEvent = new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: window,
                    detail: 1
                });
                storeCategoryButton.dispatchEvent(clickEvent);
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // Method 3: mousedown + mouseup sequence
                storeCategoryButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                await new Promise(resolve => setTimeout(resolve, 50));
                storeCategoryButton.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                
                // Wait longer for dialog to appear and load
                await new Promise(resolve => setTimeout(resolve, 1500));
                
                // Try multiple dialog selectors with retries
                const dialogSelectors = [
                    '.lightbox-dialog__window',
                    'div[role="dialog"]',
                    '.se-panel-container.details__category',
                    '.keyboard-trap--active',
                    'div[id*="dialog"]',
                    '.dialog',
                    '[role="dialog"]'
                ];
                
                let dialog = null;
                let dialogAttempts = 0;
                const maxDialogAttempts = 10;
                
                console.log('🏪 Looking for dialog to appear...');
                while (!dialog && dialogAttempts < maxDialogAttempts) {
                    for (const selector of dialogSelectors) {
                        const found = document.querySelector(selector);
                        if (found && found.offsetParent !== null) { // Check if visible
                            console.log(`🏪 Found visible dialog with selector: ${selector}`);
                            dialog = found;
                            break;
                        }
                    }
                    
                    if (!dialog) {
                        await new Promise(resolve => setTimeout(resolve, 200));
                        dialogAttempts++;
                        console.log(`🏪 Dialog search attempt ${dialogAttempts}/${maxDialogAttempts}`);
                    }
                }
                
                if (!dialog) {
                    console.warn('🏪 ⚠️ Dialog element not found after multiple attempts');
                    console.warn('🏪 Checking what elements are on page...');
                    const allDialogs = document.querySelectorAll('div[role="dialog"], .dialog, [class*="dialog"]');
                    console.warn(`🏪 Found ${allDialogs.length} potential dialog elements`);
                    allDialogs.forEach((d, idx) => {
                        console.warn(`🏪   ${idx + 1}. ${d.className} (visible: ${d.offsetParent !== null})`);
                    });
                } else {
                    console.log('🏪 ✅ Dialog is open and visible');
                }
                
                // Wait for the dialog content to load (check for fieldset or form inside dialog)
                console.log('🏪 Waiting for dialog content to load...');
                let contentLoaded = false;
                let contentAttempts = 0;
                const maxContentAttempts = 10;
                
                while (!contentLoaded && contentAttempts < maxContentAttempts) {
                    const fieldset = document.querySelector('fieldset');
                    const formContent = document.querySelector('.lightbox-dialog__window fieldset, .lightbox-dialog__window form');
                    
                    if (fieldset || formContent) {
                        console.log(`🏪 Dialog content loaded after ${contentAttempts} attempts`);
                        contentLoaded = true;
                        break;
                    }
                    
                    await new Promise(resolve => setTimeout(resolve, 200));
                    contentAttempts++;
                    console.log(`🏪 Content loading attempt ${contentAttempts}/${maxContentAttempts}`);
                }
                
                if (!contentLoaded) {
                    console.warn('🏪 Dialog content did not load, but continuing...');
                }
                
                // Now wait for radio buttons to appear in the dialog
                let radioOptions = [];
                let attempts = 0;
                const maxAttempts = 15;
                
                console.log('🏪 Waiting for radio buttons to appear...');
                while (radioOptions.length === 0 && attempts < maxAttempts) {
                    // Try multiple selectors for radio buttons
                    radioOptions = document.querySelectorAll('input[name="primaryStoreCategoryId"][type="radio"]');
                    if (radioOptions.length === 0) {
                        // Try alternative selectors
                        radioOptions = document.querySelectorAll('.lightbox-dialog__window input[type="radio"]');
                    }
                    if (radioOptions.length === 0) {
                        radioOptions = document.querySelectorAll('fieldset input[type="radio"]');
                    }
                    
                    if (radioOptions.length === 0) {
                        await new Promise(resolve => setTimeout(resolve, 200));
                        attempts++;
                        console.log(`🏪 Attempt ${attempts}/${maxAttempts}: ${radioOptions.length} radio buttons found`);
                    } else {
                        console.log(`🏪 Found ${radioOptions.length} radio options after ${attempts} attempts`);
                        break;
                    }
                }
                
                console.log('🏪 Final count:', radioOptions.length, 'radio options');
                
                if (radioOptions.length > 0) {
                    console.log('🏪 Logging all available options:');
                    radioOptions.forEach((radio, idx) => {
                        const label = document.querySelector(`label[for="${radio.id}"]`);
                        const labelText = label ? label.textContent.trim() : 'no label';
                        console.log(`🏪   ${idx + 1}. "${labelText}" (value: ${radio.value})`);
                    });
                } else {
                    console.warn('🏪 ⚠️ No radio buttons found after waiting');
                    
                    // Try direct value mapping as last resort
                    const categoryValueMap = {
                        '0–30 days': '85568562013',
                        '30–60 days': '85451187013',
                        '60–90 days': '85451188013',
                        '90–120 days': '85451189013',
                        '120–150 days': '85451190013',
                        '151–210 days': '85451191013',
                        '210+ days': '85451192013'
                    };
                    
                    const targetValue = categoryValueMap[storeCategory];
                    console.log(`🏪 Trying direct value approach with value: ${targetValue}`);
                    
                    if (targetValue) {
                        // Try to find by value directly
                        const radioByValue = document.querySelector(`input[name="primaryStoreCategoryId"][value="${targetValue}"]`);
                        if (radioByValue) {
                            console.log('🏪 Found radio by value!');
                            radioByValue.click();
                            await new Promise(resolve => setTimeout(resolve, 500));
                            const doneButton = document.querySelector('button[_track="1.primaryStoreCategoryId.2.Done"]');
                            if (doneButton) {
                                doneButton.click();
                            }
                            return;
                        }
                    }
                    
                    return;
                }
                
                let categorySelected = false;
                
                for (const radio of radioOptions) {
                    const label = document.querySelector(`label[for="${radio.id}"]`);
                    if (label) {
                        const labelText = label.textContent.trim();
                        console.log('🏪 Checking label:', labelText);
                        
                        // Check if this label matches our store category with flexible matching
                        const normalizedLabel = labelText.replace(/[-–—]/g, '-').toLowerCase();
                        const normalizedTarget = storeCategory.replace(/[-–—]/g, '-').toLowerCase();
                        
                        console.log('🏪 Normalized label:', normalizedLabel);
                        console.log('🏪 Normalized target:', normalizedTarget);
                        
                        if (normalizedLabel === normalizedTarget ||
                            labelText === storeCategory ||
                            labelText.includes(storeCategory) ||
                            storeCategory.includes(labelText)) {
                            
                            console.log('🏪 ✅ MATCH FOUND! Clicking radio...');
                            radio.click();
                            await new Promise(resolve => setTimeout(resolve, 200));
                            
                            const doneButton = document.querySelector('button[_track="1.primaryStoreCategoryId.2.Done"]');
                            if (doneButton) {
                                console.log('🏪 Clicking Done button...');
                                doneButton.click();
                                categorySelected = true;
                                await new Promise(resolve => setTimeout(resolve, 1000));
                            } else {
                                console.warn('🏪 ⚠️ Done button not found');
                            }
                            break;
                        }
                    }
                }
                
                if (!categorySelected) {
                    console.warn('🏪 ⚠️ No matching category found in first pass, trying numeric matching...');
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
            
            // First, try to find exact category match
            const clickableElements = document.querySelectorAll('button, a, [role="button"], [role="option"], li, label');
            console.log(`🔍 Searching for category: "${targetCategory}" among ${clickableElements.length} elements`);
            
            // Try exact match first
            for (const element of clickableElements) {
                const text = element.textContent.trim();
                if (text === targetCategory) {
                    console.log(`✅ Found exact match for "${targetCategory}": "${text}"`);
                    try {
                        element.click();
                        await new Promise(resolve => setTimeout(resolve, 400)); 
                        return await confirmCategorySelection();
                    } catch (error) {
                        console.warn(`❌ Failed to click exact match: ${error.message}`);
                    }
                }
            }
            
            // Try partial match with validation
            for (const element of clickableElements) {
                const text = element.textContent.trim();
                const textLower = text.toLowerCase();
                const targetLower = targetCategory.toLowerCase();
                
                if (textLower.includes(targetLower) && text.length < 100) {
                    // Validate that this is not a wrong subcategory match
                    if (targetLower.includes('tops') && textLower.includes('shorts')) {
                        console.warn(`❌ Skipping wrong subcategory: "${text}" (target needs tops, not shorts)`);
                        continue;
                    }
                    if (targetLower.includes('shorts') && textLower.includes('tops')) {
                        console.warn(`❌ Skipping wrong subcategory: "${text}" (target needs shorts, not tops)`);
                        continue;
                    }
                    
                    console.log(`✅ Found partial match for "${targetCategory}": "${text}"`);
                    try {
                        element.click();
                        await new Promise(resolve => setTimeout(resolve, 400));
                        return await confirmCategorySelection();
                    } catch (error) {
                        console.warn(`❌ Failed to click partial match: ${error.message}`);
                    }
                }
            }
            
            // If no direct match found, try to find the category selection dialog specifically
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
                            
                            // Now search for target category in the new view
                            const updatedElements = categoryContainer.querySelectorAll('button, a, [role="button"], [role="option"], li, label, span, div');
                            
                            for (const element of updatedElements) {
                                const text = element.textContent.trim();
                                if (text === targetCategory || (text.toLowerCase().includes(targetCategory.toLowerCase()) && text.length < 50)) {
                                    try {
                                        element.click();
                                        await new Promise(resolve => setTimeout(resolve, 1000));
                                        return await confirmCategorySelection();
                                    } catch (error) {
                                        console.warn(`❌ Failed to click category: ${error.message}`);
                                    }
                                }
                            }
                        }
                    }
                }
                
                // If we didn't find through navigation, try clicking any matching element
                for (let i = 0; i < Math.min(20, containerElements.length); i++) {
                    const element = containerElements[i];
                    const text = element.textContent.trim();
                    if (text.length > 0 && text.length < 100) {
                        const textLower = text.toLowerCase();
                        const targetLower = targetCategory.toLowerCase();
                        
                        if (textLower.includes(targetLower)) {
                            // Apply same validation as before
                            if (targetLower.includes('tops') && textLower.includes('shorts')) {
                                continue; // Skip wrong subcategory
                            }
                            if (targetLower.includes('shorts') && textLower.includes('tops')) {
                                continue; // Skip wrong subcategory
                            }
                            
                            try {
                                element.click();
                                await new Promise(resolve => setTimeout(resolve, 1000));
                                return await confirmCategorySelection();
                            } catch (error) {
                                // Continue to next element
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
            const department = window.currentListingData?.department?.toLowerCase() || '';
            
            console.log(`🔍 Searching for category: "${targetCategory}" with department: "${department}"`);
            console.log(`📍 Target path: "${targetPath}"`);
            
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
            
            // Try different search strategies for gender-specific categories
            const searchStrategies = [];
            
            // Strategy 1: Try with department prefix if we know the department
            if (department && (department === 'men' || department === 'women')) {
                searchStrategies.push(`${department}'s ${targetCategory}`);
                searchStrategies.push(`${department} ${targetCategory}`);
            }
            
            // Strategy 2: Original target category
            searchStrategies.push(targetCategory);
            
            // Strategy 3: Just the last word(s) if it's a compound category
            if (targetCategory.includes(' ')) {
                const lastWords = targetCategory.split(' ').slice(-1).join(' '); // Get last word
                searchStrategies.push(lastWords);
            }
            
            // Handle "&" character issue - if category contains "&", search only the first word
            let searchTerm = searchStrategies[0];
            if (searchTerm.includes('&')) {
                // Extract first word before "&" for search
                searchTerm = searchTerm.split('&')[0].trim();
                console.warn(`⚠️ Search term contains "&" - using "${searchTerm}" instead`);
            }
            
            console.log(`🔍 Search strategies: ${JSON.stringify(searchStrategies)}`);
            console.log(`🎯 Starting with search term: "${searchTerm}"`);
            
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
            let bestMatch = { score: -2000, element: null, reason: '', labelText: '' }; // Start with very low score
            
            for (const selector of resultSelectors) {
                const elements = document.querySelectorAll(selector);
                
                for (const element of elements) {
                    const label = document.querySelector(`label[for="${element.id}"]`);
                    const labelText = label ? label.textContent : 'Unknown';
                    
                    // When searching with partial term due to "&", prioritize exact match to original category
                    let score;
                    if (searchTerm !== targetCategory) {
                        // We searched with partial term, look for exact match to original
                        const labelLower = labelText.toLowerCase();
                        const targetLower = targetCategory.toLowerCase();
                        
                        // Check for EXACT match (not just contains) to avoid confusion between similar categories
                        const isExactMatch = labelLower === targetLower || 
                                           labelLower.replace(/[&\s]+/g, ' ').trim() === targetLower.replace(/[&\s]+/g, ' ').trim();
                        
                        if (isExactMatch) {
                            // Still apply gender scoring even for exact matches to prevent gender mismatches
                            score = calculateCategoryMatchScore(labelText, targetCategory, targetPath, categoryInfo);
                            score.score += 500; // Bonus for exact match
                            score.reason = `exact match + ${score.reason}`;
                            console.warn(`🎯 Found EXACT match for "${targetCategory}": "${labelText}" (score: ${score.score})`);
                        } else if (labelLower.includes(targetLower)) {
                            // Partial match - still use normal scoring with small bonus
                            score = calculateCategoryMatchScore(labelText, targetCategory, targetPath, categoryInfo);
                            score.score += 100; // Small bonus for containing target
                            score.reason = `partial match + ${score.reason}`;
                            console.warn(`🔍 Found partial match for "${targetCategory}": "${labelText}" (score: ${score.score})`);
                        } else {
                            // Score this option based on category name and path matching
                            score = calculateCategoryMatchScore(labelText, targetCategory, targetPath, categoryInfo);
                        }
                    } else {
                        // Normal scoring
                        score = calculateCategoryMatchScore(labelText, targetCategory, targetPath, categoryInfo);
                    }
                    
                    console.warn(`📊 Score for "${labelText}": ${score.score} (${score.reason})`);
                    console.warn(`🔍 Department from data: ${window.currentListingData?.department || 'none'}`);
                    console.warn(`🔍 Label contains 'women': ${labelText.toLowerCase().includes('women')}`);
                    console.warn(`🔍 Label contains 'men': ${labelText.toLowerCase().includes('men')}`);
                    
                    if (score.score > bestMatch.score) {
                        bestMatch = { score: score.score, element: element, reason: score.reason, labelText: labelText };
                        console.warn(`🏆 New best match: "${labelText}" with score ${score.score} (previous best: ${bestMatch.score})`);
                    } else if (score.score < 0) {
                        console.warn(`❌ Negative score for "${labelText}": ${score.score} - likely gender mismatch`);
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
                
                // Additional gender validation check
                const listingData = window.currentListingData;
                if (listingData && listingData.department) {
                    const department = listingData.department.toLowerCase();
                    const selectedLower = selectedCategoryText.toLowerCase();
                    
                    if (department === 'men' && (selectedLower.includes('women') || selectedLower.includes('ladies'))) {
                        console.error(`🚫 CRITICAL GENDER MISMATCH: Men's item selecting women's category: "${selectedCategoryText}"`);
                        console.error(`🚫 Score was: ${bestMatch.score}, reason: ${bestMatch.reason}`);
                        // Don't proceed with this selection
                        return false;
                    } else if (department === 'women' && selectedLower.includes('men') && !selectedLower.includes('women')) {
                        console.error(`🚫 CRITICAL GENDER MISMATCH: Women's item selecting men's category: "${selectedCategoryText}"`);
                        console.error(`🚫 Score was: ${bestMatch.score}, reason: ${bestMatch.reason}`);
                        // Don't proceed with this selection
                        return false;
                    }
                }
                
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
            
            // FINAL CATEGORY SELECTION SUMMARY
            console.warn(`🏆 FINAL SELECTION SUMMARY:`);
            console.warn(`   Target Category: "${targetCategory}"`);
            console.warn(`   Search Term Used: "${searchTerm}"`);
            console.warn(`   Selected Category: "${bestMatch.labelText}"`);
            console.warn(`   Final Score: ${bestMatch.score}`);
            console.warn(`   Reason: ${bestMatch.reason}`);
            console.warn(`   Department: ${window.currentListingData?.department || 'none'}`);
            
            // CRITICAL VALIDATION: Check for subcategory mismatch before selection
            const selectedLower = bestMatch.labelText.toLowerCase();
            const targetLower = targetCategory.toLowerCase();
            
            // Block selection if it's a critical subcategory mismatch
            if (targetLower.includes('tops') && selectedLower.includes('shorts')) {
                console.error(`🚫 BLOCKING SELECTION: Target is "${targetCategory}" but selected "${bestMatch.labelText}"`);
                console.error(`🚫 This is a CRITICAL MISMATCH (tops vs shorts) - aborting selection`);
                
                // Close any popups and return false
                const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true });
                document.dispatchEvent(escapeEvent);
                await new Promise(resolve => setTimeout(resolve, 500));
                document.body.click();
                
                return false;
            }
            
            if (targetLower.includes('shorts') && selectedLower.includes('tops')) {
                console.error(`🚫 BLOCKING SELECTION: Target is "${targetCategory}" but selected "${bestMatch.labelText}"`);
                console.error(`🚫 This is a CRITICAL MISMATCH (shorts vs tops) - aborting selection`);
                
                // Close any popups and return false
                const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true });
                document.dispatchEvent(escapeEvent);
                await new Promise(resolve => setTimeout(resolve, 500));
                document.body.click();
                
                return false;
            }
            
            // If we get here, the selection is acceptable - proceed with clicking
            console.log(`✅ Selection validated - proceeding with: "${bestMatch.labelText}"`);
            
            // Click the radio button
            targetResult.checked = true; // Set as checked
            targetResult.click(); // Also trigger click event
            targetResult.dispatchEvent(new Event('change', { bubbles: true })); // Trigger change event
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
                
                // Try to close popup using escape key and other methods
                const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true });
                document.dispatchEvent(escapeEvent);
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // Click outside the popup to close it
                document.body.click();
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // Look for any close buttons or X buttons
                const closeButtons = document.querySelectorAll(
                    'button[aria-label*="close"], button[aria-label*="Close"], ' +
                    '.close, .modal-close, [role="button"][aria-label*="close"]'
                );
                
                for (const closeButton of closeButtons) {
                    closeButton.click();
                    await new Promise(resolve => setTimeout(resolve, 300));
                }
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



        // Fill basic visible fields first (these are typically always visible)
        // Add extra timing and protection for brand field
        if (data.brand) {
            console.log(`🔖 Setting brand: ${data.brand}`);
            await fillDropdown('button[name="attributes.Brand"]', 'input[name="search-box-attributesBrand"]', data.brand);
            await new Promise(resolve => setTimeout(resolve, 500)); // Extra delay after brand
        }
        
        if (data.size) {
            console.log(`📏 Setting size: ${data.size}`);
            await fillDropdown('button[name="attributes.Size"]', 'input[name="search-box-attributesSize"]', data.size);
            await new Promise(resolve => setTimeout(resolve, 300));
        }
        
        if (data.color) {
            console.log(`🎨 Setting color: ${data.color}`);
            await fillDropdown('button[name="attributes.Color"]', 'input[name="search-box-attributesColor"]', data.color);
            await new Promise(resolve => setTimeout(resolve, 300));
        }

        // Check for and click "Show more" button if it exists and is not expanded
        const showMoreButton = document.querySelector('button[_track="1.ATTRIBUTES.0.ShowMore"][aria-expanded="false"]');
        if (showMoreButton) {
            showMoreButton.click();
            await new Promise(resolve => setTimeout(resolve, 1500)); // Wait longer for fields to appear
        }

        // DYNAMIC FIELD DETECTION AND FILLING
        
        // Get all attribute buttons on the page (including itemOrigin fields)
        const attributeButtons = [
            ...document.querySelectorAll('button[name^="attributes."]'),
            ...document.querySelectorAll('button[name^="itemOrigin."]')
        ];
        
        console.log('📋 ========== FIELD DETECTION DEBUG ==========');
        console.log(`📋 Total attribute buttons found: ${attributeButtons.length}`);
        console.log('📋 All button names on page:');
        attributeButtons.forEach((btn, idx) => {
            const name = btn.getAttribute('name');
            if (name.toLowerCase().includes('country') || name.toLowerCase().includes('origin')) {
                console.log(`📋   ${idx + 1}. "${name}" ⭐ COUNTRY FIELD`);
            } else {
                console.log(`📋   ${idx + 1}. "${name}"`);
            }
        });
        console.log('📋 ============================================');
        
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
            'country of origin': 'countryOfOrigin',  // New eBay field name (attributes) - maps to countryOfOrigin
            'itemorigin.country of origin': 'countryOfOrigin',  // New eBay field name (item origin) - maps to countryOfOrigin
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
            'performance/activity': 'performanceActivity',
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
            const buttonName = button.getAttribute('name');
            let attributeName = buttonName.replace('attributes.', '').replace('itemOrigin.', '');
            const normalizedName = attributeName.toLowerCase();
            const isItemOriginField = buttonName.startsWith('itemOrigin.');
            
            // Add debug logging for country fields
            if (normalizedName.includes('country') || normalizedName.includes('origin')) {
                console.log('🌍 ========== COUNTRY FIELD PROCESSING DEBUG ==========');
                console.log(`🌍 Found country-related button: "${buttonName}"`);
                console.log(`🌍 Attribute name: "${attributeName}"`);
                console.log(`🌍 Normalized name: "${normalizedName}"`);
                console.log(`🌍 Is itemOrigin field: ${isItemOriginField}`);
            }
            
            // Skip basic fields already handled
            if (['brand', 'size', 'color'].includes(normalizedName)) {
                continue;
            }
            
            // Try to find matching JSON property using field mappings first
            let jsonProperty = fieldMappings[normalizedName];
            
            // Add debug logging for country fields
            if (normalizedName.includes('country') || normalizedName.includes('origin')) {
                console.log(`🌍 Mapped to JSON property (from fieldMappings): "${jsonProperty || 'NOT FOUND IN MAPPING'}"`);
            }
            
            // If not in mapping, try dynamic conversion (same as extraction)
            if (!jsonProperty) {
                jsonProperty = attributeName
                    .toLowerCase()
                    .replace(/[^a-zA-Z0-9]/g, ' ')
                    .trim()
                    .split(' ')
                    .map((word, index) => index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1))
                    .join('');
                
                // Add debug logging for country fields
                if (normalizedName.includes('country') || normalizedName.includes('origin')) {
                    console.log(`🌍 Dynamic conversion result: "${jsonProperty}"`);
                }
            }
            
            // Add debug logging for country fields
            if (normalizedName.includes('country') || normalizedName.includes('origin')) {
                console.log(`🌍 Final JSON property to use: "${jsonProperty}"`);
                console.log(`🌍 Checking if data["${jsonProperty}"] exists...`);
                console.log(`🌍 data["${jsonProperty}"] = "${data[jsonProperty] || 'undefined'}"`);
                console.log(`🌍 Has value: ${data[jsonProperty] && data[jsonProperty] !== '' && !(Array.isArray(data[jsonProperty]) && data[jsonProperty].length === 0)}`);
            }
            
            // Check if we have data for this field
            if (data[jsonProperty] && data[jsonProperty] !== '' && 
                !(Array.isArray(data[jsonProperty]) && data[jsonProperty].length === 0)) {
                
                const value = data[jsonProperty];
                
                try {
                    if (['material', 'theme', 'accents', 'features', 'season'].includes(jsonProperty) && Array.isArray(value)) {
                        // Handle multi-select fields (material, theme, accents, features, season)
                        console.log(`🔧 Processing multi-select field: ${attributeName} with values:`, value);
                        
                        // Add extra delay for theme field to prevent interference with brand
                        if (jsonProperty === 'theme') {
                            console.log('⏰ Adding extra delay before theme processing to protect brand field...');
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        }
                        
                        const prefix = isItemOriginField ? 'itemOrigin' : 'attributes';
                        await fillMultiSelect(
                            `button[name="${prefix}.${attributeName}"]`,
                            'input[aria-label="Search or enter your own. Search results appear below"]',
                            value
                        );
                        console.log(`✅ Completed multi-select field: ${attributeName}`);
                    } else {
                        // Handle regular dropdown fields
                        console.log(`🔧 Processing dropdown field: ${attributeName} with value: ${value}`);
                        const prefix = isItemOriginField ? 'itemOrigin' : 'attributes';
                        const searchInputPrefix = isItemOriginField ? 'search-box-itemOrigin' : 'search-box-attributes';
                        const searchInputName = `${searchInputPrefix}${attributeName.replace(/[^a-zA-Z]/g, '')}`;
                        
                        // Add extra debug for country fields
                        if (normalizedName.includes('country') || normalizedName.includes('origin')) {
                            console.log(`🌍 About to fill country field:`);
                            console.log(`🌍   - Button selector: "button[name='${prefix}.${attributeName}']"`);
                            console.log(`🌍   - Input selector: "input[name='${searchInputName}']"`);
                            console.log(`🌍   - Value to set: "${Array.isArray(value) ? value[0] : value}"`);
                        }
                        
                        await fillDropdown(
                            `button[name="${prefix}.${attributeName}"]`,
                            `input[name="${searchInputName}"]`,
                            Array.isArray(value) ? value[0] : value
                        );
                        console.log(`✅ Completed dropdown field: ${attributeName}`);
                        
                        // Add extra verification for country fields
                        if (normalizedName.includes('country') || normalizedName.includes('origin')) {
                            const verifyButton = document.querySelector(`button[name="${prefix}.${attributeName}"]`);
                            if (verifyButton) {
                                console.log(`🌍 Verification - Button text after fill: "${verifyButton.textContent.trim()}"`);
                            }
                            console.log('🌍 ===================================================');
                        }
                    }
                } catch (error) {
                    console.warn(`⚠️ Failed to fill ${attributeName}:`, error.message);
                }
            } else {
                console.log(`📝 Field ${attributeName} found on page but no data in JSON (${jsonProperty})`);
            }
        }

        // Check for JSON fields that weren't found on the page
        // Handle dynamic package weight based on item type
        await handlePackageWeight(data);

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
        await handleConditionSelection(data);

        async function handleConditionSelection(data) {
            console.log('🏷️ ========== CONDITION HANDLING DEBUG ==========');
            console.log('🏷️ Condition from JSON:', data.condition);
            console.log('🏷️ Condition description from JSON:', data.conditionDescription);
            
            // NO INFERENCE - just use what we got from the source listing
            // If condition is missing, that's an extraction error that should be fixed, not worked around
            
            if (!data.condition || data.condition === 'undefined' || data.condition === '') {
                console.warn('⚠️ No condition extracted from source listing - this should not happen');
                console.warn('⚠️ Check the extraction logic in background.js');
                return;
            }
            
            console.log('🏷️ Using condition from source listing:', data.condition);

            // Create mapping for condition values to eBay's radio button values
            const conditionMappings = {
                // New conditions (handles both apparel and shoes)
                'new with box': '1000',
                'new with tags': '1000',
                'new': '1000',
                'new without box': '1500',
                'new without tags': '1500',
                'new with defects': '1750',
                'new with imperfections': '1750',
                'new defects': '1750',
                'new irregular': '1750',
                // Pre-owned conditions
                'pre-owned - excellent': '2990',
                'pre-owned excellent': '2990',
                'excellent': '2990',
                'pre-owned - good': '3000',
                'pre-owned good': '3000',
                'pre-owned': '3000',
                'good': '3000',
                'used': '3000',
                'pre-owned - fair': '3010',
                'pre-owned fair': '3010',
                'fair': '3010'
            };
            
            const normalizedCondition = data.condition.toLowerCase().trim();
            const conditionValue = conditionMappings[normalizedCondition];
            
            console.log('🏷️ Normalized condition:', normalizedCondition);
            console.log('🏷️ Mapped to value:', conditionValue);
            
            if (!conditionValue) {
                console.warn(`⚠️ No mapping found for condition: ${data.condition}`);
                console.warn('🏷️ Available mappings:', Object.keys(conditionMappings));
                return;
            }

            console.log(`🏷️ Setting condition: ${data.condition} → value ${conditionValue}`);

            // Method 1: Try to find radio buttons with the condition values (most reliable)
            let conditionSet = false;
            const radioButtons = document.querySelectorAll('input[name="condition"][type="radio"]');
            
            for (const radio of radioButtons) {
                if (radio.value === conditionValue) {
                    console.log(`✅ Found radio button with value ${conditionValue}, clicking...`);
                    radio.checked = true;
                    radio.click();
                    radio.dispatchEvent(new Event('change', { bubbles: true }));
                    conditionSet = true;
                    break;
                }
            }

            // Method 2: If radio buttons not found, try clicking condition recommendation buttons
            if (!conditionSet) {
                const conditionTextMappings = {
                    '1000': ['New with box', 'New with tags'], // Handle both shoes and apparel
                    '1500': ['New without box', 'New without tags'],
                    '1750': ['New with defects', 'New with imperfections'], 
                    '2990': ['Pre-owned - Excellent'],
                    '3000': ['Pre-owned - Good'],
                    '3010': ['Pre-owned - Fair']
                };
                
                const possibleTexts = conditionTextMappings[conditionValue] || [];
                
                // Try to find and click the condition button
                const conditionButtons = document.querySelectorAll('.condition-recommendation-value, button[aria-label*="condition"]');
                
                for (const button of conditionButtons) {
                    const buttonText = button.textContent.trim();
                    if (possibleTexts.includes(buttonText) || buttonText.toLowerCase() === normalizedCondition) {
                        console.log(`✅ Found condition button: ${buttonText}, clicking...`);
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
                            if (possibleTexts.includes(buttonText) || buttonText.toLowerCase() === normalizedCondition) {
                                console.log(`✅ Found condition button in expanded options: ${buttonText}, clicking...`);
                                button.click();
                                conditionSet = true;
                                break;
                            }
                        }
                    }
                }
            }

            // Method 3: Try finding labels associated with radio buttons
            if (!conditionSet) {
                const labels = document.querySelectorAll('label[for*="condition"]');
                for (const label of labels) {
                    const labelText = label.textContent.trim();
                    const conditionTextMappings = {
                        '1000': ['New with box', 'New with tags'],
                        '1500': ['New without box', 'New without tags'],
                        '1750': ['New with defects', 'New with imperfections'],
                        '2990': ['Pre-owned - Excellent'],
                        '3000': ['Pre-owned - Good'],
                        '3010': ['Pre-owned - Fair']
                    };
                    
                    const possibleTexts = conditionTextMappings[conditionValue] || [];
                    
                    if (possibleTexts.includes(labelText)) {
                        const radioId = label.getAttribute('for');
                        const radio = document.getElementById(radioId);
                        if (radio && radio.value === conditionValue) {
                            console.log(`✅ Found label for radio button ${conditionValue}, clicking...`);
                            radio.checked = true;
                            radio.click();
                            radio.dispatchEvent(new Event('change', { bubbles: true }));
                            conditionSet = true;
                            break;
                        }
                    }
                }
            }
            
            if (!conditionSet) {
                console.warn(`⚠️ Could not find condition element for: ${data.condition} (value: ${conditionValue})`);
                return;
            }
            
            console.log('✅ Condition set successfully!');
            
            // Wait for eBay to update the DOM after condition selection
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Verify what condition was actually selected
            const verifyCondition = document.querySelector('input[name="condition"]:checked');
            if (verifyCondition) {
                console.log('🏷️ Verification - Condition value in form:', verifyCondition.value);
                const verifyLabel = document.querySelector(`label[for="${verifyCondition.id}"]`);
                if (verifyLabel) {
                    console.log('🏷️ Verification - Condition label in form:', verifyLabel.textContent.trim());
                }
            }
            console.log('🏷️ ==============================================');
            
            // Handle condition description if it exists and condition is pre-owned
            if (data.conditionDescription && !['1000', '1500', '1750'].includes(conditionValue)) {
                // Find and populate the condition description textarea
                setTimeout(() => {
                    const conditionTextarea = document.querySelector('textarea[name="itemConditionDescription"]');
                    if (conditionTextarea) {
                        let description = data.conditionDescription;
                        
                        // Remove trailing period if it exists
                        if (description.endsWith('.')) {
                            description = description.slice(0, -1);
                        }
                        
                        // Add default condition text from settings
                        const defaultConditionText = settings?.defaults?.defaultConditionText || 
                                                    'washed using hypoallergenic laundry detergent that is free of dyes and perfumes.';
                        
                        if (!description.includes(defaultConditionText)) {
                            description = description + ', ' + defaultConditionText;
                        }
                        
                        conditionTextarea.value = description;
                        conditionTextarea.dispatchEvent(new Event('input', { bubbles: true }));
                        conditionTextarea.dispatchEvent(new Event('change', { bubbles: true }));
                        
                        console.log(`📝 Set condition description: ${description}`);
                    } else {
                        console.warn('⚠️ Could not find condition description textarea');
                    }
                }, 1000);
            }

            console.log(`✅ Condition set successfully: ${data.condition} (${conditionValue})`);
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
        console.log('🔍 ========== COUNTRY FIELD VALIDATION DEBUG ==========');
        
        // First check if the field exists on the page and has been populated
        console.log('🔍 Step 1: Looking for country button on page...');
        const countryButton1 = document.querySelector('button[name="attributes.Country of Origin"]');
        const countryButton2 = document.querySelector('button[name="itemOrigin.Country of Origin"]');
        const countryButton3 = document.querySelector('button[name="attributes.Country/Region of Manufacture"]');
        
        console.log('🔍 Country button searches:');
        console.log(`   - attributes.Country of Origin: ${countryButton1 ? 'FOUND' : 'NOT FOUND'}`);
        console.log(`   - itemOrigin.Country of Origin: ${countryButton2 ? 'FOUND' : 'NOT FOUND'}`);
        console.log(`   - attributes.Country/Region of Manufacture: ${countryButton3 ? 'FOUND' : 'NOT FOUND'}`);
        
        const countryButton = countryButton1 || countryButton2 || countryButton3;
        
        let countryFieldPopulated = false;
        if (countryButton) {
            const buttonText = countryButton.textContent.trim();
            const buttonName = countryButton.getAttribute('name');
            console.log(`🔍 Step 2: Country button found! Name: "${buttonName}"`);
            console.log(`🔍 Step 3: Button text content: "${buttonText}"`);
            
            // Check if button has a value other than placeholders
            const hasValue = buttonText && 
                           !buttonText.includes('Select') && 
                           !buttonText.includes('Choose') &&
                           !buttonText.includes('Country of Origin') &&
                           !buttonText.includes('Country/Region of Manufacture') &&
                           buttonText !== 'Not specified' &&
                           buttonText.length > 0;
            
            console.log(`🔍 Step 4: Validation checks:`);
            console.log(`   - Has text: ${buttonText ? 'YES' : 'NO'}`);
            console.log(`   - Not "Select": ${!buttonText.includes('Select')}`);
            console.log(`   - Not "Choose": ${!buttonText.includes('Choose')}`);
            console.log(`   - Not "Country of Origin": ${!buttonText.includes('Country of Origin')}`);
            console.log(`   - Not "Country/Region of Manufacture": ${!buttonText.includes('Country/Region of Manufacture')}`);
            console.log(`   - Not "Not specified": ${buttonText !== 'Not specified'}`);
            console.log(`   - Has length: ${buttonText.length > 0}`);
            console.log(`🔍 Step 5: Final hasValue result: ${hasValue}`);
            
            if (hasValue) {
                countryFieldPopulated = true;
                console.log(`✅ Country field IS POPULATED on form: "${buttonText}"`);
            } else {
                console.log(`❌ Country field is NOT populated on form (placeholder text detected)`);
            }
        } else {
            console.log('❌ Step 2: NO country button found on page!');
        }
        
        // Also check if we have country data in JSON
        console.log('🔍 Step 6: Checking JSON data for country values...');
        console.log(`   - data.countryOfOrigin: "${data.countryOfOrigin || 'undefined'}"`);
        console.log(`   - data.countryRegionOfManufacture: "${data.countryRegionOfManufacture || 'undefined'}"`);
        console.log(`   - data.countryOfManufacture: "${data.countryOfManufacture || 'undefined'}"`);
        console.log(`   - data['country/region of manufacture']: "${data['country/region of manufacture'] || 'undefined'}"`);
        console.log(`   - data.country: "${data.country || 'undefined'}"`);
        
        const countryValue = data.countryOfOrigin ||
                            data.countryRegionOfManufacture || 
                            data.countryOfManufacture || 
                            data['country/region of manufacture'] ||
                            data.country;
        
        console.log(`🔍 Step 7: Selected country value from JSON: "${countryValue || 'NONE'}"`);
        
        const hasValidCountryData = countryValue && 
                                   countryValue !== '' && 
                                   countryValue.toLowerCase() !== 'unknown';
        
        console.log(`🔍 Step 8: Has valid country data in JSON: ${hasValidCountryData}`);
        
        // Only show warning if BOTH the form field is empty AND we don't have data
        const shouldWarn = !countryFieldPopulated && !hasValidCountryData;
        
        console.log('🔍 Step 9: FINAL DECISION:');
        console.log(`   - Country field populated on form: ${countryFieldPopulated}`);
        console.log(`   - Has valid country data in JSON: ${hasValidCountryData}`);
        console.log(`   - Should show warning: ${shouldWarn}`);
        console.log('🔍 ===================================================');
        
        if (shouldWarn) {
            const missingReason = !countryValue ? 'missing' : 
                                 countryValue.toLowerCase() === 'unknown' ? 'set to "Unknown"' : 'invalid';
            
            console.warn(`⚠️ Country of manufacture is ${missingReason} - this is required information`);
            
            // Remove loading overlay first
            removeLoadingOverlay();
            
            if (countryButton) {
                countryButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
                countryButton.focus();
                countryButton.style.border = '3px solid red';
                countryButton.style.backgroundColor = '#ffe6e6';
                setTimeout(() => {
                    countryButton.style.border = '';
                    countryButton.style.backgroundColor = '';
                }, 5000);
                console.warn('🎯 Country field focused for user attention');
            }
            
            // Show warning dialog
            alert(
                `⚠️ WARNING: Country of Manufacture ${missingReason.charAt(0).toUpperCase() + missingReason.slice(1)}!\n\n` +
                'This is a key piece of information required for eBay listings.\n' +
                'You will need to manually fill this field before publishing.\n\n' +
                'The Country field has been highlighted for your attention.'
            );
        } else {
            // Remove loading overlay if country of manufacture is valid
            removeLoadingOverlay();
            
            if (countryFieldPopulated && !hasValidCountryData) {
                console.log(`ℹ️ Country field populated on form but not in JSON data - this is OK`);
            }
            
            // FINAL VERIFICATION: Extract current form values and compare with original JSON
            // Trigger verification immediately after overlay closes
            console.log('🔍 Starting form verification...');
            // Remove any extra eBay spinners that might appear
            removeEbaySpinners();
            
            performFormVerification(data);
            
            // Focus on title when everything goes well
            const titleInputFinal = document.querySelector('input[name="title"]');
            if (titleInputFinal) {
                console.log('✅ All fields completed successfully - focusing on title');
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
    // Remove any existing eBay spinners before creating overlay
    removeEbaySpinners();
    
    const overlay = document.createElement('div');
    overlay.id = 'ebay-xlister-loading-overlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.8);
        z-index: 9999999;
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
    
    // Set up periodic removal of eBay spinners that might appear on top
    const spinnerRemovalInterval = setInterval(() => {
        if (document.getElementById('ebay-xlister-loading-overlay')) {
            removeEbaySpinners();
        } else {
            clearInterval(spinnerRemovalInterval);
        }
    }, 500); // Check every 500ms
    
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
    
    // Also remove any eBay spinners that might have appeared
    removeEbaySpinners();
}

// Helper function to remove eBay's own spinners that can interfere with our overlay
function removeEbaySpinners() {
    const spinnerSelectors = [
        '.page-mask__spinner-wrap',
        '.page-mask__spinner',
        '.spinner-wrap',
        '[aria-label="Busy"]',
        '.progress-spinner'
    ];
    
    spinnerSelectors.forEach(selector => {
        const spinners = document.querySelectorAll(selector);
        spinners.forEach(spinner => {
            if (spinner && spinner.parentNode) {
                console.log('🧹 Removing eBay spinner:', selector);
                spinner.remove();
            }
        });
    });
}

async function handlePackageWeight(data) {
    try {
        console.log('📦 Setting dynamic package weight based on item type...');
        
        // Determine weight based on category, item type, and other attributes
        const weight = calculateDynamicWeight(data);
        
        if (!weight) {
            console.log('⚠️ Could not determine appropriate weight for this item type');
            return;
        }
        
        console.log(`📦 Setting package weight to ${weight}g based on item analysis`);
        
        // Find the weight input fields
        const minorWeightInput = document.querySelector('input[name="minorWeight"]');
        const majorWeightInput = document.querySelector('input[name="majorWeight"]');
        
        if (minorWeightInput) {
            // Clear major weight (kg) field
            if (majorWeightInput) {
                majorWeightInput.value = '';
                majorWeightInput.dispatchEvent(new Event('input', { bubbles: true }));
                majorWeightInput.dispatchEvent(new Event('change', { bubbles: true }));
            }
            
            // Set minor weight (grams) field
            minorWeightInput.focus();
            minorWeightInput.value = weight.toString();
            minorWeightInput.dispatchEvent(new Event('input', { bubbles: true }));
            minorWeightInput.dispatchEvent(new Event('change', { bubbles: true }));
            minorWeightInput.dispatchEvent(new Event('blur', { bubbles: true }));
            
            console.log(`✅ Package weight set to ${weight}g`);
        } else {
            console.warn('⚠️ Could not find package weight input fields');
        }
        
    } catch (error) {
        console.error('❌ Error setting package weight:', error);
    }
}

function calculateDynamicWeight(data) {
    try {
        // Get various item indicators
        const title = (data.title || '').toLowerCase();
        const category = (data.category || '').toLowerCase();
        const categoryPath = data.categoryInfo?.path || data.categoryInfo?.fullPath || '';
        const categoryPathLower = categoryPath.toLowerCase();
        const type = (data.type || '').toLowerCase();
        
        // Combine all text for analysis
        const allText = `${title} ${category} ${categoryPathLower} ${type}`.toLowerCase();
        
        console.log(`🔍 Analyzing item for weight: "${title}"`);
        console.log(`📂 Category info: "${category}" | "${categoryPath}"`);
        
        // Weight categories (from heaviest to lightest for priority matching)
        
        // 950g - Jackets, Coats, Heavy Outerwear, Vests
        if (allText.match(/\b(jacket|coat|parka|bomber|blazer|windbreaker|outerwear|vest)\b/)) {
            console.log('🧥 Detected jacket/coat/vest - setting weight to 950g');
            return 950;
        }
        
        // 800g - Jeans, Heavy Pants
        if (allText.match(/\b(jeans?|denim)\b/)) {
            console.log('👖 Detected jeans - keeping default weight at 800g');
            return 800;
        }
        
        // 680g - Pants, Sweatpants, Hoodies, Sweatshirts
        if (allText.match(/\b(pants?|trousers?|sweatpants?|joggers?|hoodi?es?|sweatshirts?|pullover|sweater)\b/)) {
            console.log('👕 Detected pants/sweatpants/hoodie/sweatshirt - setting weight to 680g');
            return 680;
        }
        
        // 400g - Shoes, Sneakers, Boots
        if (allText.match(/\b(shoes?|sneakers?|boots?|sandals?|loafers?|heels?|flats?|footwear)\b/) ||
            categoryPathLower.includes('shoes') || categoryPathLower.includes('footwear')) {
            console.log('👟 Detected shoes - setting weight to 400g');
            return 400;
        }
        
        // 400g - Shirts, Shorts, Light Items
        if (allText.match(/\b(shirts?|t-shirts?|tees?|tops?|blouses?|tank|shorts?|polo|dress shirt)\b/)) {
            console.log('👔 Detected shirt/shorts - setting weight to 400g');
            return 400;
        }
        
        // Check by category path for more specific matching
        if (categoryPathLower.includes('shirts') || categoryPathLower.includes('tops')) {
            console.log('👔 Detected shirt/top from category - setting weight to 400g');
            return 400;
        }
        
        if (categoryPathLower.includes('shorts')) {
            console.log('🩳 Detected shorts from category - setting weight to 400g');
            return 400;
        }
        
        if (categoryPathLower.includes('jeans')) {
            console.log('👖 Detected jeans from category - keeping default weight at 800g');
            return 800;
        }
        
        if (categoryPathLower.includes('hoodies') || categoryPathLower.includes('sweatshirts')) {
            console.log('👕 Detected hoodie/sweatshirt from category - setting weight to 680g');
            return 680;
        }
        
        // Default fallback - if it's clothing but we can't determine specific type
        if (categoryPathLower.includes('clothing') || categoryPathLower.includes('apparel')) {
            console.log('👕 Detected general clothing - using default weight of 680g');
            return 680;
        }
        
        // If no specific match found, return null to keep existing weight
        console.log('❓ Could not determine specific item type - keeping existing weight');
        return null;
        
    } catch (error) {
        console.error('❌ Error calculating dynamic weight:', error);
        return null;
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
            console.log('🌐 Requesting image from background script:', imageUrl);        // Send message to background script to fetch the image
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
                            
                            console.log(`📏 Image dimensions: ${originalWidth}x${originalHeight}`);
                            
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
        console.log('⚠️ Ignoring duplicate fill request (too soon after last request)');
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
            console.log('⚠️ Keyboard shortcut throttled (too rapid)');
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

// Brand verification function to ensure the correct brand is set
async function verifyAndFixBrandField(expectedBrand) {
    try {
        console.log(`🔍 Verifying brand field should be: ${expectedBrand}`);
        
        // Wait a bit for any pending operations to complete
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Find the brand button and check its current value
        const brandButton = document.querySelector('button[name="attributes.Brand"]');
        if (!brandButton) {
            console.warn('⚠️ Brand button not found during verification');
            return;
        }
        
        // Check the current displayed value in the brand field
        const currentDisplayValue = brandButton.textContent.trim();
        const isCorrect = currentDisplayValue.toLowerCase().includes(expectedBrand.toLowerCase()) || 
                          expectedBrand.toLowerCase().includes(currentDisplayValue.toLowerCase());
        
        console.log(`🔍 Current brand field shows: "${currentDisplayValue}"`);
        
        if (!isCorrect && currentDisplayValue !== 'Brand') {
            console.warn(`⚠️ Brand field verification failed. Expected: "${expectedBrand}", Found: "${currentDisplayValue}"`);
            console.log('🔧 Attempting to fix brand field...');
            
            // Clear any open dropdowns first
            document.body.click();
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Re-fill the brand field with more aggressive approach
            console.log('🔄 Re-filling brand field...');
            const brandInput = document.querySelector('input[name="search-box-attributesBrand"]');
            if (brandInput) {
                // Clear any existing value
                brandInput.value = '';
                brandInput.dispatchEvent(new Event('input', { bubbles: true }));
                await new Promise(resolve => setTimeout(resolve, 300));
            }
            
            // Re-fill the brand field
            await fillDropdown('button[name="attributes.Brand"]', 'input[name="search-box-attributesBrand"]', expectedBrand);
            
            // Verify again
            await new Promise(resolve => setTimeout(resolve, 500));
            const newDisplayValue = brandButton.textContent.trim();
            if (newDisplayValue.toLowerCase().includes(expectedBrand.toLowerCase())) {
                console.log(`✅ Brand field fixed successfully: ${newDisplayValue}`);
            } else {
                console.warn(`❌ Brand field fix failed. Still shows: ${newDisplayValue}`);
                
                // Last resort: try manual selection
                console.log('🚨 Attempting manual brand correction...');
                brandButton.click();
                await new Promise(resolve => setTimeout(resolve, 500));
                
                const brandSearchInput = document.querySelector('input[name="search-box-attributesBrand"]');
                if (brandSearchInput) {
                    brandSearchInput.value = expectedBrand;
                    brandSearchInput.dispatchEvent(new Event('input', { bubbles: true }));
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                    // Press Enter to select
                    brandSearchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
                    await new Promise(resolve => setTimeout(resolve, 300));
                    
                    const finalDisplayValue = brandButton.textContent.trim();
                    console.log(`🏁 Final brand field value: ${finalDisplayValue}`);
                }
            }
        } else {
            console.log(`✅ Brand field verified correctly: ${currentDisplayValue}`);
        }
    } catch (error) {
        console.error('❌ Error during brand verification:', error);
    }
}

// IMPROVEMENTS MADE FOR FORM VERIFICATION AND AUTO-FIXING:
// 1. Enhanced multi-select field detection to avoid brand field interference
// 2. Improved condition detection with multiple fallback selectors
// 3. Added auto-fix functionality for common verification failures
// 4. Better timing and waiting for form changes to settle
// 5. More intelligent difference detection (skip minor issues, focus on important fields)
// 6. Automatic correction of missing closure, country, brand, and multi-select fields

// Helper function for category auto-fixing
async function selectCategoryFunc(targetCategory) {
    try {
        console.log(`🔍 Attempting to select category: ${targetCategory}`);
        
        // First, try to find the category button and click it
        const categoryButton = document.querySelector('button[name="categoryId"]') ||
                             document.querySelector('button[data-testid="category-field-trigger"]') ||
                             document.querySelector('.category-picker__trigger') ||
                             document.querySelector('[data-testid="category"]') ||
                             document.querySelector('.category-field button') ||
                             document.querySelector('button[aria-label*="category"]');
        
        if (!categoryButton) {
            console.warn('⚠️ Category button not found');
            return false;
        }
        
        // Click to open category selection
        categoryButton.click();
        await new Promise(resolve => setTimeout(resolve, 800));
        
        // Look for category options in the dropdown/modal
        const categoryOptions = document.querySelectorAll(
            'a, button, li, [role="option"], [role="button"], .clickable, .selectable'
        );
        
        // Try exact match first
        for (const option of categoryOptions) {
            const text = option.textContent.trim();
            if (text === targetCategory) {
                console.log('✅ Found exact category match:', targetCategory);
                option.click();
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // Close any remaining popups/modals
                const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true });
                document.dispatchEvent(escapeEvent);
                await new Promise(resolve => setTimeout(resolve, 500));
                
                return true;
            }
        }
        
        // Try partial match - but be more specific for exact word matches
        for (const option of categoryOptions) {
            const text = option.textContent.trim();
            const textLower = text.toLowerCase();
            const targetLower = targetCategory.toLowerCase();
            
            // For "Activewear Tops" vs "Activewear Shorts", ensure we match the exact end word
            if (textLower.includes(targetLower) && text.length < targetCategory.length + 30) {
                // Extra validation: if target ends with "tops", don't match "shorts"
                if (targetLower.endsWith('tops') && textLower.endsWith('shorts')) {
                    console.log('❌ Skipping wrong match:', text, '(target needs "tops" not "shorts")');
                    continue;
                }
                if (targetLower.endsWith('shorts') && textLower.endsWith('tops')) {
                    console.log('❌ Skipping wrong match:', text, '(target needs "shorts" not "tops")');
                    continue;
                }
                
                console.log('✅ Found partial category match:', targetCategory, '→', text);
                option.click();
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // Close any remaining popups/modals
                const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true });
                document.dispatchEvent(escapeEvent);
                await new Promise(resolve => setTimeout(resolve, 500));
                
                return true;
            }
        }
        
        console.warn(`⚠️ Could not find category option for: ${targetCategory}`);
        
        // Clean up any open popups/modals before returning
        const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true });
        document.dispatchEvent(escapeEvent);
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Click outside to close any remaining popups
        document.body.click();
        await new Promise(resolve => setTimeout(resolve, 500));
        
        return false;
        
    } catch (error) {
        console.error('❌ Error in selectCategoryFunc:', error);
        
        // Clean up any open popups/modals before returning
        try {
            const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true });
            document.dispatchEvent(escapeEvent);
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Click outside to close any remaining popups
            document.body.click();
            await new Promise(resolve => setTimeout(resolve, 500));
        } catch (cleanupError) {
            console.warn('⚠️ Error during popup cleanup:', cleanupError);
        }
        
        return false;
    }
}

// Auto-fix function to handle common verification issues
async function attemptAutoFix(differences, originalData, extractedData) {
    const remainingDifferences = [];
    
    for (let i = 0; i < differences.length; i++) {
        const diff = differences[i];
        const fieldMatch = diff.match(/^([^:]+):/);
        if (!fieldMatch) {
            remainingDifferences.push(diff);
            continue;
        }
        
        const fieldName = fieldMatch[1].trim();
        let fixed = false;
        
        // Update progress message
        updateLoadingMessage(`Auto-fixing field ${i + 1} of ${differences.length}: ${fieldName}...`);
        
        // Auto-fix missing closure field
        if (fieldName === 'closure' && diff.includes('Missing from form') && originalData.closure) {
            console.log(`🔧 Auto-fixing closure field: ${originalData.closure}`);
            const closureButton = document.querySelector('button[name="attributes.Closure"]');
            if (closureButton) {
                try {
                    await fillDropdown('button[name="attributes.Closure"]', 'input[name="search-box-attributesClosure"]', originalData.closure);
                    // Wait for the selection to be reflected in the UI
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    fixed = true;
                    console.log('✅ Closure field auto-fixed');
                } catch (error) {
                    console.warn('⚠️ Failed to auto-fix closure field:', error);
                }
            }
        }
        
        // Auto-fix brand field if missing or incorrect
        else if (fieldName === 'brand' && originalData.brand) {
            console.log(`🔧 Auto-fixing brand field: ${originalData.brand}`);
            try {
                await verifyAndFixBrandField(originalData.brand);
                fixed = true;
                console.log('✅ Brand field auto-fixed');
            } catch (error) {
                console.warn('⚠️ Failed to auto-fix brand field:', error);
            }
        }
        
        // Auto-fix missing country field - try multiple field names and data properties
        else if ((fieldName === 'countryRegionOfManufacture' || fieldName === 'countryOfOrigin') && 
                 diff.includes('Missing from form') && 
                 (originalData.countryOfOrigin || originalData.countryRegionOfManufacture)) {
            const countryValueToUse = originalData.countryOfOrigin || originalData.countryRegionOfManufacture;
            console.log(`🔧 Auto-fixing country field: ${countryValueToUse}`);
            // Try new field names first, then fall back to old one
            const countryButton = document.querySelector('button[name="attributes.Country of Origin"]') ||
                                 document.querySelector('button[name="itemOrigin.Country of Origin"]') ||
                                 document.querySelector('button[name="attributes.Country/Region of Manufacture"]');
            if (countryButton) {
                try {
                    const buttonName = countryButton.getAttribute('name');
                    let buttonSelector, inputSelector;
                    
                    if (buttonName === 'attributes.Country of Origin') {
                        buttonSelector = 'button[name="attributes.Country of Origin"]';
                        inputSelector = 'input[name="search-box-attributesCountryofOrigin"]';
                    } else if (buttonName === 'itemOrigin.Country of Origin') {
                        buttonSelector = 'button[name="itemOrigin.Country of Origin"]';
                        inputSelector = 'input[name="search-box-itemOriginCountryofOrigin"]';
                    } else {
                        buttonSelector = 'button[name="attributes.Country/Region of Manufacture"]';
                        inputSelector = 'input[name="search-box-attributesCountryRegionofManufacture"]';
                    }
                    
                    await fillDropdown(buttonSelector, inputSelector, countryValueToUse);
                    // Wait for the selection to be reflected in the UI
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    fixed = true;
                    console.log('✅ Country field auto-fixed');
                } catch (error) {
                    console.warn('⚠️ Failed to auto-fix country field:', error);
                }
            }
        }
        
        // Auto-fix category field if there's a mismatch
        else if (fieldName === 'category' && originalData.category && diff.includes('Value mismatch')) {
            console.log(`🔧 Auto-fixing category field: ${originalData.category}`);
            try {
                // Remove any existing highlight first
                const categoryButton = document.querySelector('button[name="categoryId"]');
                if (categoryButton) {
                    // Remove any highlighting from previous operations
                    categoryButton.classList.remove('ebay-xlister-mismatch');
                    const container = categoryButton.closest('.field') || 
                                    categoryButton.closest('.form-field') || 
                                    categoryButton.closest('.input-group') ||
                                    categoryButton.closest('.field-group') ||
                                    categoryButton.parentElement;
                    if (container) {
                        container.classList.remove('ebay-xlister-mismatch');
                    }
                }
                
                // Attempt to select the correct category
                const categorySelected = await selectCategoryFunc(originalData.category);
                
                if (categorySelected) {
                    // Ensure category popup is closed after selection
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                    // Force close any open category modals/dropdowns
                    const categoryModals = document.querySelectorAll('.modal, .dialog, .popup, .overlay, .category-selection, .category-picker');
                    categoryModals.forEach(modal => {
                        if (modal.style.display !== 'none' && modal.offsetParent !== null) {
                            console.log('🔄 Closing category modal after auto-fix');
                            modal.style.display = 'none';
                            modal.remove();
                        }
                    });
                    
                    // Also try clicking outside to close any remaining dropdowns
                    document.body.click();
                    await new Promise(resolve => setTimeout(resolve, 300));
                    
                    // Press Escape key to close any remaining popups
                    document.dispatchEvent(new KeyboardEvent('keydown', {
                        key: 'Escape',
                        keyCode: 27,
                        bubbles: true
                    }));
                    
                    await new Promise(resolve => setTimeout(resolve, 500));
                    fixed = true;
                    console.log('✅ Category field auto-fixed and popup closed');
                } else {
                    console.warn('⚠️ Failed to auto-select category');
                }
            } catch (error) {
                console.warn('⚠️ Failed to auto-fix category field:', error);
            }
        }
        
        // Auto-fix multi-select fields that appear empty
        else if (diff.includes('Multi-select field appears empty')) {
            const multiSelectFields = {
                'theme': originalData.theme,
                'features': originalData.features,
                'accents': originalData.accents,
                'occasion': originalData.occasion,
                'performanceActivity': originalData.performanceActivity
            };
            
            if (multiSelectFields[fieldName] && Array.isArray(multiSelectFields[fieldName])) {
                console.log(`🔧 Auto-fixing multi-select field: ${fieldName}`);
                
                // Map field names to their actual eBay attribute names
                const fieldNameMap = {
                    'theme': 'Theme',
                    'features': 'Features',
                    'accents': 'Accents',
                    'occasion': 'Occasion',
                    'performanceActivity': 'Performance/Activity'
                };
                
                const ebayFieldName = fieldNameMap[fieldName] || (fieldName.charAt(0).toUpperCase() + fieldName.slice(1));
                const buttonSelector = `button[name="attributes.${ebayFieldName}"]`;
                const inputSelector = `input[name="search-box-attributes${ebayFieldName.replace(/[^a-zA-Z0-9]/g, '')}"]`;
                const button = document.querySelector(buttonSelector);
                
                if (button) {
                    try {
                        await fillMultiSelect(buttonSelector, inputSelector, multiSelectFields[fieldName]);
                        // Wait for the selection to be reflected in the UI
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        fixed = true;
                        console.log(`✅ Multi-select field ${fieldName} auto-fixed`);
                    } catch (error) {
                        console.warn(`⚠️ Failed to auto-fix multi-select field ${fieldName}:`, error);
                    }
                }
            }
        }
        
        // Skip store category auto-assignment (this is often eBay doing it automatically)
        else if (fieldName === 'storeCategory' && diff.includes('Extra value in form')) {
            console.log('ℹ️ Store category auto-assigned by eBay - this is normal');
            fixed = true; // Don't flag this as an error
        }
        
        // If not fixed, keep in remaining differences
        if (!fixed) {
            remainingDifferences.push(diff);
        }
        
        // Small delay between fixes
        if (fixed) {
            // Remove highlight from successfully fixed field
            await removeHighlightFromField(fieldName);
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
    
    return remainingDifferences;
}

// Helper function to remove highlights from auto-fixed fields
async function removeHighlightFromField(fieldName) {
    try {
        // Field to selector mappings (same as in highlightMismatchedFields)
        const fieldSelectors = {
            'title': 'input[name="title"]',
            'sku': 'input[name="customLabel"]',
            'priceCAD': 'input[name="price"]',
            'description': 'iframe[id*="se-rte-frame"], textarea[name="description"]',
            'condition': 'input[name="condition"]:checked',
            'conditionDescription': 'textarea[name="itemConditionDescription"]',
            'category': 'button[name="categoryId"]',
            'storeCategory': 'button[name="primaryStoreCategoryId"], button[name="storeCategoryId"]',
            'brand': 'button[name="attributes.Brand"]',
            'size': 'button[name="attributes.Size"]',
            'color': 'button[name="attributes.Color"]',
            'style': 'button[name="attributes.Style"]',
            'type': 'button[name="attributes.Type"]',
            'material': 'button[name="attributes.Material"]',
            'pattern': 'button[name="attributes.Pattern"]',
            'department': 'button[name="attributes.Department"]',
            'theme': 'button[name="attributes.Theme"]',
            'features': 'button[name="attributes.Features"]',
            'accents': 'button[name="attributes.Accents"]',
            'closure': 'button[name="attributes.Closure"]',
            'fabricType': 'button[name="attributes.Fabric Type"]',
            'countryRegionOfManufacture': 'button[name="attributes.Country of Origin"], button[name="itemOrigin.Country of Origin"], button[name="attributes.Country/Region of Manufacture"]',
            'model': 'button[name="attributes.Model"]',
            'productLine': 'button[name="attributes.Product Line"]',
            'performanceActivity': 'button[name="attributes.Performance/Activity"]',
            'occasion': 'button[name="attributes.Occasion"]',
            'liningMaterial': 'button[name="attributes.Lining Material"]',
            'outerShellMaterial': 'button[name="attributes.Outer Shell Material"]'
        };
        
        const selector = fieldSelectors[fieldName];
        if (!selector) {
            return;
        }
        
        // Handle multiple selectors separated by comma
        const selectors = selector.split(',').map(s => s.trim());
        
        for (const sel of selectors) {
            const element = document.querySelector(sel);
            if (element) {
                // Remove highlight from the element itself
                element.classList.remove('ebay-xlister-mismatch');
                
                // Also remove highlight from parent containers
                const container = element.closest('.field') || 
                                element.closest('.form-field') || 
                                element.closest('.input-group') ||
                                element.closest('.field-group') ||
                                element.parentElement;
                
                if (container) {
                    container.classList.remove('ebay-xlister-mismatch');
                }
                
                console.log(`🧹 Removed highlight from auto-fixed field: ${fieldName}`);
                break;
            }
        }
    } catch (error) {
        console.warn(`⚠️ Error removing highlight from field ${fieldName}:`, error);
    }
}

// Form verification function to extract current form values and compare with original JSON
async function performFormVerification(originalData) {
    try {
        console.log('🔍 Extracting current form values for verification...');
        
        // Wait longer for any final form updates to settle
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        const extractedData = await extractCurrentFormData();
        const differences = compareFormData(originalData, extractedData);
        
        console.log('📋 Original JSON data:', originalData);
        console.log('📋 Extracted form data:', extractedData);
        
        if (differences.length > 0) {
            console.warn('⚠️ FORM VERIFICATION FAILED - Differences found:');
            differences.forEach((diff, index) => {
                console.warn(`${index + 1}. ${diff}`);
            });
            
            // Show loading overlay during auto-fix process
            const autoFixOverlay = createLoadingOverlay();
            autoFixOverlay.querySelector('#loading-message').textContent = 'Attempting to auto-fix form mismatches...';
            document.body.appendChild(autoFixOverlay);
            
            try {
                // Try to auto-fix some common issues before highlighting
                const remainingDifferences = await attemptAutoFix(differences, originalData, extractedData);
                
                // Remove loading overlay
                if (autoFixOverlay && autoFixOverlay.parentNode) {
                    autoFixOverlay.remove();
                }
                
                // Only highlight if there are still unfixed differences
                if (remainingDifferences.length > 0) {
                    await highlightMismatchedFields(remainingDifferences, originalData, extractedData);
                } else {
                    console.log('✅ All verification issues were auto-fixed!');
                }
            } catch (error) {
                // Remove loading overlay on error
                if (autoFixOverlay && autoFixOverlay.parentNode) {
                    autoFixOverlay.remove();
                }
                console.error('❌ Error during auto-fix process:', error);
                // Still try to highlight the original differences
                await highlightMismatchedFields(differences, originalData, extractedData);
            }
            
        } else {
            console.log('✅ FORM VERIFICATION PASSED - All values match!');
        }
        
    } catch (error) {
        console.error('❌ Error during form verification:', error);
        alert('❌ Form verification failed due to error. Check console for details.');
    }
}

// Extract current form data from eBay.ca page
async function extractCurrentFormData() {
    const extractedData = {};
    
    try {
        // Extract basic fields
        const titleInput = document.querySelector('input[name="title"]');
        if (titleInput && titleInput.value) {
            extractedData.title = titleInput.value.trim();
        }
        
        const priceInput = document.querySelector('input[name="price"]');
        if (priceInput && priceInput.value) {
            extractedData.priceCAD = priceInput.value.trim();
        }
        
        const skuInput = document.querySelector('input[name="customLabel"]');
        if (skuInput && skuInput.value) {
            extractedData.sku = skuInput.value.trim();
        }
        
        // Extract description
        let description = '';
        const descriptionIframe = document.querySelector('iframe[id*="se-rte-frame"]');
        if (descriptionIframe) {
            try {
                const iframeDoc = descriptionIframe.contentDocument || descriptionIframe.contentWindow.document;
                const editableDiv = iframeDoc?.querySelector('div[contenteditable="true"]');
                if (editableDiv) {
                    description = editableDiv.innerHTML.replace(/<br>/g, '\n').replace(/<[^>]*>/g, '').trim();
                }
            } catch (error) {
                console.warn('Could not extract description from iframe');
            }
        }
        
        if (!description) {
            const descTextarea = document.querySelector('textarea[name="description"]');
            if (descTextarea && descTextarea.value) {
                description = descTextarea.value.trim();
            }
        }
        
        if (description) {
            extractedData.description = description;
        }
        
        // Extract condition - improved detection
        console.log('🏷️ [EXTRACTION] ========== CONDITION EXTRACTION DEBUG ==========');
        let selectedCondition = document.querySelector('input[name="condition"]:checked');
        console.log('🏷️ [EXTRACTION] Method 1 - input[name="condition"]:checked:', selectedCondition ? 'FOUND' : 'NOT FOUND');
        
        // If not found, try alternative selectors
        if (!selectedCondition) {
            selectedCondition = document.querySelector('input[type="radio"][name="condition"]:checked') ||
                               document.querySelector('input[name="itemCondition"]:checked') ||
                               document.querySelector('input[value][name*="condition"]:checked');
            console.log('🏷️ [EXTRACTION] Method 2 - Alternative selectors:', selectedCondition ? 'FOUND' : 'NOT FOUND');
        }
        
        if (selectedCondition) {
            console.log('🏷️ [EXTRACTION] Found radio button with value:', selectedCondition.value);
            extractedData.conditionValue = selectedCondition.value;
            
            // Map condition values back to readable text
            const conditionMap = {
                '1000': 'new with tags/box',
                '1500': 'new without tags/box', 
                '1750': 'new with defects',
                '2990': 'pre-owned - excellent',
                '3000': 'pre-owned - good',
                '3010': 'pre-owned - fair'
            };
            extractedData.condition = conditionMap[selectedCondition.value] || `unknown (${selectedCondition.value})`;
            console.log('🏷️ [EXTRACTION] Mapped to condition:', extractedData.condition);
        } else {
            console.log('🏷️ [EXTRACTION] Method 3 - Trying to find from buttons/labels...');
            // Try to find condition from button text or labels
            const conditionButtons = document.querySelectorAll('button[aria-checked="true"], label[class*="selected"], div[class*="selected condition"]');
            console.log('🏷️ [EXTRACTION] Found', conditionButtons.length, 'potential condition buttons');
            for (const button of conditionButtons) {
                const text = button.textContent.toLowerCase();
                console.log('🏷️ [EXTRACTION] Checking button text:', text);
                if (text.includes('pre-owned') || text.includes('new') || text.includes('used')) {
                    extractedData.condition = button.textContent.trim();
                    console.log('🏷️ [EXTRACTION] Found condition from button:', extractedData.condition);
                    break;
                }
            }
        }
        
        console.log('🏷️ [EXTRACTION] Final extracted condition:', extractedData.condition || 'NONE');
        console.log('🏷️ [EXTRACTION] ==============================================');
        
        // Extract condition description
        const conditionTextarea = document.querySelector('textarea[name="itemConditionDescription"]');
        if (conditionTextarea && conditionTextarea.value) {
            extractedData.conditionDescription = conditionTextarea.value.trim();
        }
        
        // Extract category information
        const categoryButton = document.querySelector('button[name="categoryId"]');
        if (categoryButton) {
            const categoryText = categoryButton.textContent.trim();
            if (categoryText && categoryText !== 'Item category') {
                extractedData.category = categoryText;
            }
        }
        
        // Extract all attribute fields dynamically (including itemOrigin fields)
        const attributeButtons = [
            ...document.querySelectorAll('button[name^="attributes."]'),
            ...document.querySelectorAll('button[name^="itemOrigin."]')
        ];
        
        for (const button of attributeButtons) {
            const buttonName = button.getAttribute('name');
            const attributeName = buttonName.replace('attributes.', '').replace('itemOrigin.', '');
            const buttonText = button.textContent.trim();
            
            // Skip empty or placeholder values - improved detection
            if (buttonText && 
                !buttonText.includes('Select') && 
                !buttonText.includes('Choose') &&
                !buttonText.includes('Click to select') &&
                buttonText !== attributeName &&
                buttonText !== 'Select an option' &&
                buttonText !== 'Not specified' &&
                buttonText.length > 0) {
                
                // Convert attribute name to JSON property format
                const jsonProperty = attributeName
                    .toLowerCase()
                    .replace(/[^a-zA-Z0-9]/g, ' ')
                    .trim()
                    .split(' ')
                    .map((word, index) => index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1))
                    .join('');
                
                // Check if this looks like a multi-select field by analyzing the button text
                const hasMultipleItems = buttonText.includes(',') || buttonText.includes('+') || buttonText.includes(' and ');
                const isKnownMultiSelect = ['theme', 'material', 'features', 'accents', 'season', 'occasion', 'performanceActivity'].includes(jsonProperty);
                
                if (isKnownMultiSelect || hasMultipleItems) {
                    // For multi-select fields, try to extract the actual values
                    if (buttonText.includes(' items selected') || buttonText.includes(' selected')) {
                        extractedData[jsonProperty] = `[Multi-select: ${buttonText}]`;
                    } else if (hasMultipleItems) {
                        // Try to parse comma-separated values
                        const values = buttonText.split(',').map(v => v.trim()).filter(v => v.length > 0);
                        extractedData[jsonProperty] = values.length > 1 ? values : buttonText;
                    } else {
                        extractedData[jsonProperty] = buttonText;
                    }
                } else {
                    extractedData[jsonProperty] = buttonText;
                }
            }
        }
        
        // Extract store category if present
        const storeCategoryButton = document.querySelector('button[name="primaryStoreCategoryId"], button[name="storeCategoryId"]');
        if (storeCategoryButton) {
            const storeCategoryText = storeCategoryButton.textContent.trim();
            if (storeCategoryText && !storeCategoryText.includes('Select')) {
                extractedData.storeCategory = storeCategoryText;
            }
        }
        
        console.log('📝 Extracted form data:', extractedData);
        return extractedData;
        
    } catch (error) {
        console.error('❌ Error extracting form data:', error);
        return extractedData;
    }
}

// Compare original JSON data with extracted form data
function compareFormData(original, extracted) {
    const differences = [];
    
    // Field mappings for comparison
    const fieldMappings = {
        'title': 'title',
        'sku': 'sku',
        'priceCAD': 'priceCAD',
        'description': 'description',
        'condition': 'condition',
        'conditionDescription': 'conditionDescription',
        'category': 'category',
        'storeCategory': 'storeCategory'
    };
    
    // Add all attribute mappings
    const attributeFields = [
        'brand', 'size', 'color', 'style', 'type', 'material', 'pattern', 
        'department', 'theme', 'features', 'accents', 'closure', 'fabricType',
        'countryRegionOfManufacture', 'model', 'productLine', 'performanceActivity',
        'occasion', 'liningMaterial', 'outerShellMaterial'
    ];
    
    attributeFields.forEach(field => {
        fieldMappings[field] = field;
    });
    
    // Compare each field
    for (const [originalField, extractedField] of Object.entries(fieldMappings)) {
        const originalValue = original[originalField];
        const extractedValue = extracted[extractedField];
        
        // Skip if both are empty/undefined
        if (!originalValue && !extractedValue) continue;
        
        // Handle different data types
        if (Array.isArray(originalValue)) {
            // For arrays, check if extracted value contains the array elements
            if (!extractedValue || extractedValue.includes('[Multi-select:')) {
                // Multi-select field detected, this is often fine as eBay may not expose selected values easily
                // Only flag as error if it appears completely empty
                if (!extractedValue || extractedValue === 'empty') {
                    differences.push(`${originalField}: Multi-select field appears empty (Original: ${JSON.stringify(originalValue)}, Form: ${extractedValue || 'empty'})`);
                }
                // Otherwise skip - multi-selects are hard to verify
            } else {
                const hasMatch = originalValue.some(val => 
                    extractedValue.toLowerCase().includes(val.toLowerCase())
                );
                if (!hasMatch) {
                    differences.push(`${originalField}: Array mismatch (Original: ${JSON.stringify(originalValue)}, Form: ${extractedValue})`);
                }
            }
        } else if (originalValue && extractedValue) {
            // Both have values, check if they match (case insensitive)
            const originalLower = String(originalValue).toLowerCase().trim();
            const extractedLower = String(extractedValue).toLowerCase().trim();
            
            // Special handling for country names - apply mapping for comparison
            let isCountryMatch = false;
            if (originalField === 'countryRegionOfManufacture') {
                const mappedOriginal = mapCountryForCanada(originalValue).toLowerCase().trim();
                isCountryMatch = mappedOriginal === extractedLower || 
                               originalLower === extractedLower ||
                               mappedOriginal.includes(extractedLower) ||
                               extractedLower.includes(mappedOriginal) ||
                               originalLower.includes(extractedLower) ||
                               extractedLower.includes(originalLower);
                               
                if (isCountryMatch) {
                    console.log(`✅ Country match found: "${originalValue}" → "${extractedValue}" (mapped: "${mapCountryForCanada(originalValue)}")`);
                }
            }
            
            // Special handling for condition description - more forgiving comparison
            let isConditionDescMatch = false;
            if (originalField === 'conditionDescription') {
                // Remove common formatting differences and normalize text
                const normalizeConditionText = (text) => {
                    return text.toLowerCase()
                              .replace(/\s+/g, ' ')      // Multiple spaces to single space
                              .replace(/[^\w\s]/g, ' ')  // Remove special characters
                              .replace(/\s+/g, ' ')      // Clean up multiple spaces again
                              .trim();
                };
                
                const normalizedOriginal = normalizeConditionText(originalValue);
                const normalizedExtracted = normalizeConditionText(extractedValue);
                
                // Check if they match after normalization or if one contains the other
                isConditionDescMatch = normalizedOriginal === normalizedExtracted ||
                                     normalizedOriginal.includes(normalizedExtracted) ||
                                     normalizedExtracted.includes(normalizedOriginal) ||
                                     // Also check if the core content is similar (80% match)
                                     (normalizedOriginal.length > 10 && normalizedExtracted.length > 10 && 
                                      (normalizedOriginal.includes(normalizedExtracted.substring(0, Math.min(normalizedExtracted.length, 20))) ||
                                       normalizedExtracted.includes(normalizedOriginal.substring(0, Math.min(normalizedOriginal.length, 20)))));
                
                if (isConditionDescMatch) {
                    console.log(`✅ Condition description match found: "${originalValue}" → "${extractedValue}"`);
                }
            }
            
            // Special handling for category names with & character
            const normalizedOriginal = originalLower.replace(/&/g, 'and').replace(/\s+/g, ' ');
            const normalizedExtracted = extractedLower.replace(/&/g, 'and').replace(/\s+/g, ' ');
            
            if (!isCountryMatch && !isConditionDescMatch && 
                normalizedOriginal !== normalizedExtracted && 
                !normalizedOriginal.includes(normalizedExtracted) && 
                !normalizedExtracted.includes(normalizedOriginal)) {
                differences.push(`${originalField}: Value mismatch (Original: "${originalValue}", Form: "${extractedValue}")`);
            }
        } else if (originalValue && !extractedValue) {
            // Only flag as missing if it's an important field
            const importantFields = ['brand', 'size', 'color', 'condition', 'countryRegionOfManufacture'];
            if (importantFields.includes(originalField)) {
                differences.push(`${originalField}: Missing from form (Original: "${originalValue}", Form: empty)`);
            }
            // For less important fields, just log but don't flag as error
            else {
                console.warn(`ℹ️ Optional field not filled: ${originalField} = "${originalValue}"`);
            }
        } else if (!originalValue && extractedValue) {
            // Extra values are generally okay, only warn about store category if it seems wrong
            if (originalField === 'storeCategory' && extractedValue.includes('30 days')) {
                console.warn(`ℹ️ Store category set automatically: ${extractedValue}`);
            } else {
                differences.push(`${originalField}: Extra value in form (Original: empty, Form: "${extractedValue}")`);
            }
        }
    }
    
    // Special check for gender/department consistency in category
    if (original.department && extracted.category) {
        const department = original.department.toLowerCase();
        const category = extracted.category.toLowerCase();
        
        if (department === 'men' && (category.includes('women') || category.includes('ladies'))) {
            differences.push(`GENDER MISMATCH: Department is "${original.department}" but category is "${extracted.category}"`);
        } else if (department === 'women' && category.includes('men') && !category.includes('women')) {
            differences.push(`GENDER MISMATCH: Department is "${original.department}" but category is "${extracted.category}"`);
        }
    }
    
    return differences;
}

// Highlight mismatched fields with red border and focus on the first one
async function highlightMismatchedFields(differences, originalData, extractedData) {
    const highlightedFields = [];
    let firstFieldToFocus = null;
    
    // Parse differences to extract field names
    const mismatchedFields = differences.map(diff => {
        // Extract field name from difference string (before the colon)
        const match = diff.match(/^([^:]+):/);
        return match ? match[1].trim() : null;
    }).filter(field => field);
    
    console.log('🎯 Highlighting mismatched fields:', mismatchedFields);
    
    // Field to selector mappings
    const fieldSelectors = {
        'title': 'input[name="title"]',
        'sku': 'input[name="customLabel"]',
        'priceCAD': 'input[name="price"]',
        'description': 'iframe[id*="se-rte-frame"], textarea[name="description"]',
        'condition': 'input[name="condition"]:checked',
        'conditionDescription': 'textarea[name="itemConditionDescription"]',
        'category': 'button[name="categoryId"]',
        'storeCategory': 'button[name="primaryStoreCategoryId"], button[name="storeCategoryId"]',
        'brand': 'button[name="attributes.Brand"]',
        'size': 'button[name="attributes.Size"]',
        'color': 'button[name="attributes.Color"]',
        'style': 'button[name="attributes.Style"]',
        'type': 'button[name="attributes.Type"]',
        'material': 'button[name="attributes.Material"]',
        'pattern': 'button[name="attributes.Pattern"]',
        'department': 'button[name="attributes.Department"]',
        'theme': 'button[name="attributes.Theme"]',
        'features': 'button[name="attributes.Features"]',
        'accents': 'button[name="attributes.Accents"]',
        'closure': 'button[name="attributes.Closure"]',
        'fabricType': 'button[name="attributes.Fabric Type"]',
        'countryRegionOfManufacture': 'button[name="attributes.Country of Origin"], button[name="itemOrigin.Country of Origin"], button[name="attributes.Country/Region of Manufacture"]',
        'model': 'button[name="attributes.Model"]',
        'productLine': 'button[name="attributes.Product Line"]',
        'performanceActivity': 'button[name="attributes.Performance/Activity"]',
        'occasion': 'button[name="attributes.Occasion"]',
        'liningMaterial': 'button[name="attributes.Lining Material"]',
        'outerShellMaterial': 'button[name="attributes.Outer Shell Material"]'
    };
    
    // Create CSS for highlighting
    const highlightCSS = `
        .ebay-xlister-mismatch {
            border: 3px solid #ff4444 !important;
            box-shadow: 0 0 10px rgba(255, 68, 68, 0.5) !important;
            background-color: rgba(255, 68, 68, 0.1) !important;
            animation: ebay-xlister-pulse 2s infinite !important;
        }
        
        @keyframes ebay-xlister-pulse {
            0% { box-shadow: 0 0 10px rgba(255, 68, 68, 0.5); }
            50% { box-shadow: 0 0 20px rgba(255, 68, 68, 0.8); }
            100% { box-shadow: 0 0 10px rgba(255, 68, 68, 0.5); }
        }
    `;
    
    // Add CSS to page if not already added
    if (!document.getElementById('ebay-xlister-mismatch-styles')) {
        const style = document.createElement('style');
        style.id = 'ebay-xlister-mismatch-styles';
        style.textContent = highlightCSS;
        document.head.appendChild(style);
    }
    
    // Highlight each mismatched field
    for (const fieldName of mismatchedFields) {
        const selector = fieldSelectors[fieldName];
        if (!selector) {
            console.warn(`⚠️ No selector found for field: ${fieldName}`);
            continue;
        }
        
        // Handle multiple selectors separated by comma
        const selectors = selector.split(',').map(s => s.trim());
        let element = null;
        
        for (const sel of selectors) {
            element = document.querySelector(sel);
            if (element) break;
        }
        
        if (element) {
            console.log(`🎯 Highlighting field: ${fieldName}`);
            
            // Special handling for iframe (description field)
            if (element.tagName === 'IFRAME') {
                try {
                    const iframeDoc = element.contentDocument || element.contentWindow.document;
                    const editableDiv = iframeDoc?.querySelector('div[contenteditable="true"]');
                    if (editableDiv) {
                        editableDiv.classList.add('ebay-xlister-mismatch');
                        highlightedFields.push({element: editableDiv, originalClass: editableDiv.className});
                    }
                } catch (error) {
                    // If iframe access fails, highlight the iframe itself
                    element.classList.add('ebay-xlister-mismatch');
                    highlightedFields.push({element, originalClass: element.className});
                }
            } else {
                // For regular elements, highlight the container or the element itself
                let targetElement = element;
                
                // For buttons and inputs, try to highlight the parent container for better visibility
                if (element.tagName === 'BUTTON' || element.tagName === 'INPUT') {
                    const container = element.closest('.field') || 
                                    element.closest('.form-field') || 
                                    element.closest('.input-group') ||
                                    element.closest('.field-group') ||
                                    element.parentElement;
                    
                    if (container && container !== document.body) {
                        targetElement = container;
                    }
                }
                
                targetElement.classList.add('ebay-xlister-mismatch');
                highlightedFields.push({element: targetElement, originalClass: targetElement.className});
            }
            
            // Set the first field to focus on
            if (!firstFieldToFocus) {
                firstFieldToFocus = element;
            }
        } else {
            console.warn(`⚠️ Element not found for field: ${fieldName} (selector: ${selector})`);
        }
    }
    
    // Focus on the first mismatched field and scroll to it
    if (firstFieldToFocus) {
        console.log('🎯 Original first field to focus:', firstFieldToFocus);
        
        // Find the actual first element with the mismatch class in DOM order (from top)
        const allMismatchedElements = document.querySelectorAll('.ebay-xlister-mismatch');
        const firstMismatchedElement = allMismatchedElements[0];
        
        if (firstMismatchedElement) {
            console.log('🎯 Actual first mismatched element found:', firstMismatchedElement);
            
            // Scroll to the first mismatched element
            firstMismatchedElement.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'center',
                inline: 'center'
            });
            
            // Find the corresponding interactive element to focus on
            let interactiveElement = firstFieldToFocus;
            
            // Try to find the interactive element within or related to the highlighted element
            if (firstMismatchedElement.tagName === 'BUTTON' || firstMismatchedElement.tagName === 'INPUT') {
                interactiveElement = firstMismatchedElement;
            } else {
                // Look for button/input within the highlighted container
                const innerButton = firstMismatchedElement.querySelector('button, input');
                const innerInput = firstMismatchedElement.querySelector('input[type="text"], input[type="number"], textarea');
                
                if (innerButton) {
                    interactiveElement = innerButton;
                } else if (innerInput) {
                    interactiveElement = innerInput;
                }
            }
            
            console.log('🎯 Interactive element to focus:', interactiveElement);
            
            // Wait for scroll to complete, then focus
            setTimeout(() => {
                try {
                    // Focus on the interactive element
                    interactiveElement.focus();
                    
                    // For buttons, click to open dropdown after a short delay
                    if (interactiveElement.tagName === 'BUTTON') {
                        setTimeout(() => {
                            console.log('🔘 Clicking button to open dropdown');
                            interactiveElement.click();
                        }, 300);
                    }
                    
                } catch (error) {
                    console.warn('Could not focus on first mismatched field:', error);
                }
            }, 500);
            
        } else {
            console.warn('⚠️ No elements found with .ebay-xlister-mismatch class');
        }
    }
    
    // Log summary
    console.log(`🔴 Highlighted ${highlightedFields.length} mismatched fields with red borders`);
    console.log('💡 Check the form - mismatched fields are highlighted in red with pulsing animation');
    console.log('🔄 Highlights will remain until page refresh or manual correction');
    
    return highlightedFields;
}
