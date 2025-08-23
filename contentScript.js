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

async function fillFields(data) {
    // Prevent duplicate execution with better checking
    if (isCurrentlyFilling) {
        return;
    }
    
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

        console.log('🔍 DEBUG: Title input found:', !!titleInput);
        console.log('🔍 DEBUG: Data has title:', !!data.title);
        console.log('🔍 DEBUG: Title value:', data.title);

        if (titleInput && data.title) {
            console.log('📝 Setting title to:', data.title);
            
            // Set title immediately
            titleInput.focus();
            titleInput.value = data.title;
            titleInput.dispatchEvent(new Event('input', { bubbles: true }));
            titleInput.dispatchEvent(new Event('change', { bubbles: true }));
            console.log('✅ Title set. Current value:', titleInput.value);
            
            // Set title again after a delay to counteract eBay's interference
            setTimeout(() => {
                const titleInputDelayed = document.querySelector('input[name="title"]');
                if (titleInputDelayed && titleInputDelayed.value !== data.title) {
                    console.log('🔄 Re-setting title after delay, current value:', titleInputDelayed.value);
                    titleInputDelayed.focus();
                    titleInputDelayed.value = data.title;
                    titleInputDelayed.dispatchEvent(new Event('input', { bubbles: true }));
                    titleInputDelayed.dispatchEvent(new Event('change', { bubbles: true }));
                    titleInputDelayed.dispatchEvent(new Event('blur', { bubbles: true }));
                    console.log('✅ Title re-set after delay. Current value:', titleInputDelayed.value);
                } else if (titleInputDelayed) {
                    console.log('✅ Title still correct after delay:', titleInputDelayed.value);
                }
            }, 2000);
            
            // Set title one more time after attributes are processed
            setTimeout(() => {
                const titleInputFinal = document.querySelector('input[name="title"]');
                if (titleInputFinal && titleInputFinal.value !== data.title) {
                    console.log('🔄 Final title check - re-setting title, current value:', titleInputFinal.value);
                    titleInputFinal.focus();
                    titleInputFinal.value = data.title;
                    titleInputFinal.dispatchEvent(new Event('input', { bubbles: true }));
                    titleInputFinal.dispatchEvent(new Event('change', { bubbles: true }));
                    titleInputFinal.dispatchEvent(new Event('blur', { bubbles: true }));
                    console.log('✅ Final title set. Current value:', titleInputFinal.value);
                } else if (titleInputFinal) {
                    console.log('✅ Title still correct at final check:', titleInputFinal.value);
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

        // Handle category selection
        if (data.category || data.categoryId) {
            // Clean up category text for better matching
            let categoryToMatch = data.category;
            if (categoryToMatch) {
                categoryToMatch = categoryToMatch
                    .replace(/–/g, '-') // Replace em dash with regular dash
                    .replace(/—/g, '-') // Replace em dash with regular dash
                    .trim();
            }
            
            // Try multiple methods to find and set the category
            
            // Method 1: Look for primary store category button first
            const storeCategoryButton = document.querySelector('button[name="primaryStoreCategoryId"], button[name="storeCategoryId"]');
            if (storeCategoryButton && categoryToMatch) {
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
                        if (labelText.toLowerCase().includes(categoryToMatch.toLowerCase()) ||
                            categoryToMatch.toLowerCase().includes(labelText.toLowerCase()) ||
                            (labelText.includes('Clothing') && categoryToMatch.toLowerCase().includes('clothing')) ||
                            (labelText.includes('Jeans') && categoryToMatch.toLowerCase().includes('jeans'))) {
                            
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
                                await new Promise(resolve => setTimeout(resolve, 1000));
                                
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
            if (categoryButton && categoryToMatch && !storeCategoryButton) {
                categoryButton.click();
                await new Promise(resolve => setTimeout(resolve, 800));
                
                // Look for category search input
                const categorySearch = document.querySelector('input[placeholder*="category"], input[placeholder*="Category"], input[aria-label*="category"]');
                if (categorySearch) {
                    categorySearch.focus();
                    categorySearch.value = categoryToMatch;
                    categorySearch.dispatchEvent(new Event('input', { bubbles: true }));
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                    // Look for matching category in dropdown and click it (this will close popup)
                    const categoryOptions = document.querySelectorAll('[role="option"], .category-option, [data-testid*="category-option"]');
                    const matchingCategory = Array.from(categoryOptions).find(option => 
                        option.textContent.toLowerCase().includes(categoryToMatch.toLowerCase())
                    );
                    
                    if (matchingCategory) {
                        matchingCategory.click();
                        console.log('✅ Selected and closed main category popup:', categoryToMatch);
                        await new Promise(resolve => setTimeout(resolve, 500));
                    } else {
                        // Try Enter key to select first match
                        categorySearch.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
                        console.log('🔧 Attempted to select main category with Enter:', categoryToMatch);
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                } else {
                    // No search input found, just close the popup
                    document.body.click();
                    await new Promise(resolve => setTimeout(resolve, 300));
                }
            }
            
            // Method 3: Look for category selectors and input fields
            if (!categoryButton && !storeCategoryButton) {
                const categorySelectors = [
                    'select[name*="category"]',
                    'input[name*="category"]',
                    '[data-testid*="category-selector"]',
                    '.category-selector'
                ];
                
                for (const selector of categorySelectors) {
                    const element = document.querySelector(selector);
                    if (element && categoryToMatch) {
                        if (element.tagName === 'SELECT') {
                            // Handle select dropdown
                            const options = Array.from(element.options);
                            const matchingOption = options.find(option => 
                                option.text.toLowerCase().includes(categoryToMatch.toLowerCase())
                            );
                            if (matchingOption) {
                                element.value = matchingOption.value;
                                element.dispatchEvent(new Event('change', { bubbles: true }));
                                console.log('✅ Selected category from dropdown:', categoryToMatch);
                            }
                        } else if (element.tagName === 'INPUT') {
                            // Handle input field
                            element.focus();
                            element.value = categoryToMatch;
                            element.dispatchEvent(new Event('input', { bubbles: true }));
                            element.dispatchEvent(new Event('change', { bubbles: true }));
                            console.log('✅ Set category in input field:', categoryToMatch);
                        }
                        break;
                    }
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
            'unit type': 'unitType'
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
                console.log(`📝 Field ${attributeName} found on page but no data in JSON (${jsonProperty})`);
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
            // Skip non-attribute fields
            if (['source', 'templateType', 'title', 'sku', 'priceCAD', 'priceUSD', 
                 'description', 'condition', 'conditionDescription', 'adRate', 
                 'originalUrl', 'extractedAt', 'category', 'categoryId', 'images'].includes(jsonKey)) {
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

        console.log(`🔧 DEBUG: Checking condition data - condition: "${data.condition}", conditionDescription: "${data.conditionDescription}"`);

        // Handle condition selection
        // First, check if we need to infer condition from conditionDescription
        if ((!data.condition || data.condition === 'undefined' || data.condition === '') && data.conditionDescription) {
            // If we have a condition description but no condition, default to pre-owned
            data.condition = 'pre-owned';
            console.log(`🔧 CONDITION: Inferred condition "pre-owned" from conditionDescription`);
        }

        if (data.condition && data.condition !== 'undefined' && data.condition !== '') {
            console.log(`🔧 CONDITION: Processing condition "${data.condition}"`);
            
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
            console.log(`🔧 CONDITION: Mapped "${data.condition}" to "${mappedCondition}"`);
            
            // Try to find and click the condition button first
            const conditionButtons = document.querySelectorAll('.condition-recommendation-value');
            console.log(`🔧 CONDITION: Found ${conditionButtons.length} condition buttons`);
            let conditionSet = false;
            
            for (const button of conditionButtons) {
                const buttonText = button.textContent.trim();
                console.log(`🔧 CONDITION: Checking button "${buttonText}" vs "${mappedCondition}"`);
                if (buttonText === mappedCondition) {
                    button.click();
                    conditionSet = true;
                    console.log(`✅ CONDITION: Clicked condition button "${mappedCondition}"`);
                    break;
                }
            }
            
            // If not found in visible buttons, try the "..." more options button
            if (!conditionSet) {
                const moreOptionsButton = document.querySelector('.condition-recommendation-more-values');
                if (moreOptionsButton) {
                    console.log(`🔧 CONDITION: Clicking "..." for more options`);
                    moreOptionsButton.click();
                    
                    // Wait for more options to appear and try again
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                    const allConditionButtons = document.querySelectorAll('.condition-recommendation-value');
                    console.log(`🔧 CONDITION: Found ${allConditionButtons.length} condition buttons after clicking "..."`);
                    for (const button of allConditionButtons) {
                        const buttonText = button.textContent.trim();
                        if (buttonText === mappedCondition) {
                            button.click();
                            conditionSet = true;
                            console.log(`✅ CONDITION: Clicked condition button "${mappedCondition}" from expanded list`);
                            break;
                        }
                    }
                }
            }
            
            if (!conditionSet) {
                console.warn(`⚠️ CONDITION: Could not find condition button for: ${data.condition} (mapped to: ${mappedCondition})`);
                return;
            }
            
            // Wait for eBay to update the DOM after condition selection
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Now modify the DOM to show the filled condition state
            const conditionSection = document.querySelector('.smry.summary__condition, .smry.summary--warn.summary__condition');
            console.log(`🔧 CONDITION: Found condition section:`, conditionSection ? 'YES' : 'NO');
            
            if (conditionSection) {
                console.log(`🔧 CONDITION: Current classes:`, conditionSection.className);
                
                // Remove warning class and update structure
                conditionSection.classList.remove('summary--warn');
                conditionSection.classList.add('summary__condition');
                console.log(`🔧 CONDITION: Updated classes:`, conditionSection.className);
                
                // Clear the warning notice
                const noticeDiv = conditionSection.querySelector('.summary__notice');
                if (noticeDiv) {
                    noticeDiv.innerHTML = '';
                    console.log(`✅ CONDITION: Cleared warning notice`);
                }
                
                // Update the condition value button text
                const conditionValueButton = conditionSection.querySelector('#summary-condition-field-value');
                if (conditionValueButton) {
                    conditionValueButton.textContent = mappedCondition;
                    console.log(`✅ CONDITION: Updated button text to "${mappedCondition}"`);
                } else {
                    console.warn(`⚠️ CONDITION: Could not find condition value button`);
                }
                
                                // Remove the condition recommendation section and replace with filled structure
                const summaryRow = conditionSection.querySelector('.summary-row');
                if (summaryRow) {
                    console.log(`🔧 CONDITION: Found summary-row, updating its content`);
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
                        console.log(`✅ CONDITION: Successfully updated summary-row content`);
                    } catch (error) {
                        console.warn(`⚠️ CONDITION: Error updating summary-row:`, error);
                    }
                } else {
                    console.log(`🔧 CONDITION: No summary-row found - eBay may have already updated the DOM after clicking condition button`);
                }
                
                // Handle condition description
                if (data.conditionDescription && !mappedCondition.toLowerCase().includes('new')) {
                
                    // Skip trying to modify the DOM structure - just work with eBay's existing elements
                    console.log(`🔧 CONDITION: Skipping DOM modification, will populate eBay's existing textarea`);
                    
                    // Find and populate the actual condition description textarea that eBay uses
                    setTimeout(() => {
                        const actualConditionTextarea = document.querySelector('textarea[name="itemConditionDescription"]');
                        if (actualConditionTextarea) {
                            actualConditionTextarea.value = data.conditionDescription;
                            actualConditionTextarea.dispatchEvent(new Event('input', { bubbles: true }));
                            actualConditionTextarea.dispatchEvent(new Event('change', { bubbles: true }));
                            console.log(`✅ CONDITION: Populated eBay's condition textarea with "${data.conditionDescription}"`);
                        } else {
                            console.warn(`⚠️ CONDITION: Could not find eBay's condition textarea`);
                        }
                    }, 1000); // Wait a bit longer for eBay's DOM to update
                }
                
                console.log(`✅ CONDITION: Condition handling completed successfully`);
            } else {
                console.warn(`⚠️ CONDITION: Could not find condition section to modify`);
            }
        }

        // Wait a bit more to ensure all async operations are complete
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Remove loading overlay
        removeLoadingOverlay();
        
        // Focus on the "Save for later" button
        const saveForLaterButton = document.querySelector('button[aria-label="Save for later"]');
        if (saveForLaterButton) {
            saveForLaterButton.focus();
            saveForLaterButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
            // Fallback to title input if save button not found
            if (titleInput) {
                titleInput.focus();
                titleInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
        // Send message to background script to fetch the image
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
                action: 'fetchImageAsBlob',
                imageUrl: imageUrl
            }, (response) => {
                if (response && response.success) {
                    // Convert base64 to blob
                    const base64Data = response.base64Data;
                    const mimeType = response.mimeType || 'image/jpeg';
                    
                    // Convert base64 to blob
                    const byteCharacters = atob(base64Data);
                    const byteNumbers = new Array(byteCharacters.length);
                    for (let i = 0; i < byteCharacters.length; i++) {
                        byteNumbers[i] = byteCharacters.charCodeAt(i);
                    }
                    const byteArray = new Uint8Array(byteNumbers);
                    const blob = new Blob([byteArray], { type: mimeType });
                    
                    // Create File object
                    const filename = imageUrl.split('/').pop().split('?')[0] || 'image.jpg';
                    const file = new File([blob], filename, { type: mimeType });
                    
                    resolve(file);
                } else {
                    reject(new Error(response?.error || 'Failed to fetch image'));
                }
            });
        });
    } catch (error) {
        console.error('❌ Error converting URL to file:', error);
        throw error;
    }
}

async function simulateDragAndDrop(targetElement, file) {
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
        console.log('🔄 Filling eBay.ca form with bridged data. Keys:', Object.keys(msg.data));
        window.lastFillTimestamp = now;
        fillFields(msg.data);
    } else if (msg.action === 'save') {
        window.lastFillTimestamp = now;
        fillFields(msg.data).then(saveDraft);
    } else if (msg.action === 'extractedEbayComData') {
        console.log('📦 Received extracted eBay.com data in content script');
        // This is for manual popup workflow - just log for now
    }
});

// Listen for direct trigger from background script (used in auto-bridging)
window.addEventListener('message', function(event) {
    if (event.source !== window) return;
    
    if (event.data.source === 'EBAY_US_CA_BRIDGE_TRIGGER') {
        console.log('🌉 Received bridge trigger, loading saved data...');
        
        // Get the saved JSON data from storage and fill the form
        chrome.storage.local.get('latestEbayJson', ({ latestEbayJson }) => {
            if (latestEbayJson) {
                console.log('📦 Found saved data, filling form:', latestEbayJson);
                fillFields(latestEbayJson);
            } else {
                console.log('❌ No saved data found for bridging');
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
        console.log('⌨️ Keyboard shortcut triggered (Cmd/Ctrl + Period)');
        
        const currentUrl = window.location.href;
        
        // Determine action based on current page
        if (currentUrl.includes('ebay.ca') && currentUrl.includes('/lstng')) {
            // eBay.ca listing page - Fill form with saved data
            console.log('🇨🇦 eBay.ca listing detected - filling form with saved data');
            chrome.storage.local.get('latestEbayJson', ({ latestEbayJson }) => {
                if (latestEbayJson) {
                    console.log('📦 Found saved data, filling form');
                    fillFields(latestEbayJson);
                } else {
                    alert('⚠️ No saved JSON data found. Please extract data from an eBay.com listing first.');
                }
            });
            
        } else if (currentUrl.includes('ebay.com') && (currentUrl.includes('/lstng') || currentUrl.includes('/sl/list'))) {
            // eBay.com listing page - Extract data and bridge to eBay.ca
            console.log('🇺🇸 eBay.com listing detected - extracting data and bridging to eBay.ca');
            
            // Start the extraction with keyboard shortcut flag
            console.log('📤 Sending extraction request with keyboard shortcut flag');
            chrome.runtime.sendMessage({ 
                action: "extractEbayComListing",
                fromKeyboardShortcut: true 
            }, (response) => {
                console.log('📥 Response from background script:', response);
            });
            
        } else if (currentUrl.includes('ebay.com') && currentUrl.includes('/itm/')) {
            // eBay.com item page - Navigate to edit mode
            console.log('📦 eBay.com item detected - navigating to edit mode');
            const itemIdMatch = currentUrl.match(/\/itm\/(\d+)/);
            
            if (itemIdMatch) {
                const itemId = itemIdMatch[1];
                const editUrl = `https://www.ebay.com/sl/list?itemId=${itemId}&mode=ReviseItem`;
                console.log('🔄 Navigating to edit mode:', editUrl);
                window.location.href = editUrl;
            } else {
                alert('❌ Could not extract item ID from URL');
            }
            
        } else if (currentUrl.includes('chatgpt.com')) {
            // ChatGPT page - Extract JSON and create listing
            console.log('🤖 ChatGPT detected - extracting JSON');
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
