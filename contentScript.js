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
    button.click();
    await new Promise(resolve => setTimeout(resolve, 700));
    for (const value of values) {
        const input = await waitForSelector(searchInputSelector);
        input.focus();
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(resolve => setTimeout(resolve, 700));
        const menuItems = Array.from(document.querySelectorAll('.filter-menu__item'));
        const match = menuItems.find(item => item.innerText.trim().toLowerCase() === value.trim().toLowerCase());
        if (match) {
            const isChecked = match.getAttribute('aria-checked') === 'true';
            if (!isChecked) {
                match.click();
            }
        } else {
            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        }
        await new Promise(resolve => setTimeout(resolve, 300));
    }
}

async function fillFields(data) {
    console.log('🔄 Starting to fill fields with data:', data);
    
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
            console.log('✅ Page elements are ready');
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
            titleInput.focus();
            titleInput.value = data.title;
            titleInput.dispatchEvent(new Event('input', { bubbles: true }));
            titleInput.dispatchEvent(new Event('change', { bubbles: true }));
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

        // Handle description field (rich text editor)
        if (data.description) {
            console.log('📝 Setting description field...');
            
            // Add bridge notice for eBay.ca listings
            let description = data.description;
            if (isEbayCA && data.originalUrl) {
                description += `\n\n--- Bridged from eBay.com ---\nOriginal listing: ${data.originalUrl}`;
            }
            
            let descriptionSet = false;
            
            // Method 1: Try the rich text editor iframe approach first
            const descriptionIframe = document.querySelector('iframe[id*="se-rte-frame"]');
            if (descriptionIframe) {
                console.log('📝 Found description iframe, waiting for it to be ready...');
                try {
                    // Wait for iframe to be fully loaded and contenteditable div to be available
                    const editableDiv = await waitForIframeReady(descriptionIframe);
                    
                    console.log('✅ Found contenteditable div in iframe');
                    
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
                    
                    console.log('✅ Triggered focus/blur sequence to activate eBay auto-save');
                    
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
                        console.log('✅ Also updated hidden textarea for synchronization');
                    }
                    
                    // Wait a bit more to allow the API call to complete
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                    console.log('✅ Description set in iframe successfully with auto-save trigger');
                    descriptionSet = true;
                    
                } catch (error) {
                    console.warn('⚠️ Error waiting for iframe to be ready:', error);
                }
            }
            
            // Method 2: Fallback to hidden textarea if iframe method fails
            if (!descriptionSet) {
                const descTextarea = document.querySelector('textarea[name="description"]');
                if (descTextarea) {
                    console.log('📝 Using fallback textarea method');
                    descTextarea.value = description;
                    descTextarea.dispatchEvent(new Event('input', { bubbles: true }));
                    descTextarea.dispatchEvent(new Event('change', { bubbles: true }));
                    descriptionSet = true;
                }
            }
            
            // Method 3: Try other possible selectors
            if (!descriptionSet) {
                console.log('🔍 Trying alternative description selectors...');
                const alternativeSelectors = [
                    'textarea[data-testid="richEditor"]',
                    'textarea[placeholder*="description"]',
                    'div[contenteditable="true"]'
                ];
                
                for (const selector of alternativeSelectors) {
                    const element = document.querySelector(selector);
                    if (element) {
                        console.log(`📝 Found description element with selector: ${selector}`);
                        
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
                console.log('🔄 Checking for eBay auto-save system...');
                
                // Look for signs that eBay has an auto-save mechanism
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
                                console.log('✅ Final auto-save trigger completed');
                            }
                        }
                    } catch (error) {
                        console.log('ℹ️ Final auto-save trigger failed (this may be normal)');
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
            console.log('🔽 Clicking Show more button to reveal additional fields');
            showMoreButton.click();
            await new Promise(resolve => setTimeout(resolve, 1500)); // Wait longer for fields to appear
        }

        // DYNAMIC FIELD DETECTION AND FILLING
        console.log('🔍 Starting dynamic field detection...');
        
        // Get all attribute buttons on the page
        const attributeButtons = document.querySelectorAll('button[name^="attributes."]');
        console.log(`📋 Found ${attributeButtons.length} attribute fields on page`);
        
        // Create a mapping of common field variations to JSON property names
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
            'fabric wash': 'wash',
            'closure': 'closure',
            'type': 'type',
            'fabric type': 'fabricType',
            'neckline': 'neckline',
            'sleeve length': 'sleeveLength',
            'collar style': 'collarStyle',
            'chest size': 'chestSize',
            'shirt length': 'shirtLength',
            'country/region of manufacture': 'country',
            'material': 'material',
            
            // Additional mappings for fields that might be present
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
            
            // Newly discovered fields
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
            
            // Skip if we already filled these basic fields
            if (['brand', 'size', 'color'].includes(normalizedName)) {
                continue;
            }
            
            // Find matching JSON property
            const jsonProperty = fieldMappings[normalizedName];
            
            if (jsonProperty && data[jsonProperty]) {
                const value = data[jsonProperty];
                
                // Skip empty values
                if (!value || (Array.isArray(value) && value.length === 0) || value === '') {
                    continue;
                }
                
                console.log(`🎯 Filling ${attributeName}: ${value}`);
                
                try {
                    if (jsonProperty === 'material' && Array.isArray(value)) {
                        // Handle multi-select material field
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
            } else if (jsonProperty) {
                console.log(`📝 Field ${attributeName} found on page but no data in JSON (${jsonProperty})`);
            } else {
                console.log(`🔍 Unknown field found: ${attributeName} - consider adding to fieldMappings`);
            }
        }

        // Check for JSON fields that weren't found on the page
        console.log('🔍 Checking for JSON fields not found on page...');
        const pageFieldNames = Array.from(attributeButtons).map(button => 
            button.getAttribute('name').replace('attributes.', '').toLowerCase()
        );
        
        // Check each JSON property against available page fields
        Object.entries(fieldMappings).forEach(([pageFieldName, jsonProperty]) => {
            if (data[jsonProperty] && data[jsonProperty] !== '' && 
                !(Array.isArray(data[jsonProperty]) && data[jsonProperty].length === 0)) {
                
                // Skip basic fields we already handled
                if (['brand', 'size', 'color'].includes(pageFieldName)) {
                    return;
                }
                
                if (!pageFieldNames.includes(pageFieldName)) {
                    console.log(`⚠️ JSON has data for "${jsonProperty}" (${data[jsonProperty]}) but field "${pageFieldName}" not found on page`);
                }
            }
        });

        // Handle condition selection
        if (data.condition) {
            console.log('🏷️ Setting condition:', data.condition);
            
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
            
            // Try to find and click the condition button
            const conditionButtons = document.querySelectorAll('.condition-recommendation-value');
            let conditionSet = false;
            
            for (const button of conditionButtons) {
                if (button.textContent.trim() === mappedCondition) {
                    console.log(`✅ Found and clicking condition button: ${mappedCondition}`);
                    button.click();
                    conditionSet = true;
                    break;
                }
            }
            
            // If not found in visible buttons, try the "..." more options button
            if (!conditionSet) {
                const moreOptionsButton = document.querySelector('.condition-recommendation-more-values');
                if (moreOptionsButton) {
                    console.log('🔍 Condition not found in visible options, clicking "..." for more');
                    moreOptionsButton.click();
                    
                    // Wait for more options to appear and try again
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                    const allConditionButtons = document.querySelectorAll('.condition-recommendation-value');
                    for (const button of allConditionButtons) {
                        if (button.textContent.trim() === mappedCondition) {
                            console.log(`✅ Found condition in expanded options: ${mappedCondition}`);
                            button.click();
                            conditionSet = true;
                            break;
                        }
                    }
                }
            }
            
            if (!conditionSet) {
                console.warn(`⚠️ Could not find condition button for: ${data.condition} (mapped to: ${mappedCondition})`);
            }
        }

        // Wait a bit more to ensure all async operations are complete
        await new Promise(resolve => setTimeout(resolve, 1000));

        console.log('✅ All fields filled successfully');
        
        // Remove loading overlay
        removeLoadingOverlay();
        
        // Focus on the "Save for later" button
        const saveForLaterButton = document.querySelector('button[aria-label="Save for later"]');
        if (saveForLaterButton) {
            saveForLaterButton.focus();
            saveForLaterButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
            console.log('✅ Focused on Save for later button');
        } else {
            // Fallback to title input if save button not found
            if (titleInput) {
                titleInput.focus();
                titleInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            console.log('⚠️ Save for later button not found, focused on title input instead');
        }
        
    } catch (error) {
        console.error('❌ Error filling fields:', error);
        removeLoadingOverlay();
        alert('Error filling some fields. Please check the console for details.');
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

function removeLoadingOverlay() {
    const overlay = document.getElementById('ebay-xlister-loading-overlay');
    if (overlay) {
        overlay.remove();
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

    if (msg.action === 'update' || msg.action === 'fillForm') {
        console.log('🔄 Filling eBay.ca form with bridged data:', msg.data);
        fillFields(msg.data);
    } else if (msg.action === 'save') {
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
