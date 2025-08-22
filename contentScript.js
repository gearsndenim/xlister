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

        if (descTextarea && data.description) {
            // Add bridge notice for eBay.ca listings
            let description = data.description;
            if (isEbayCA && data.originalUrl) {
                description += `\n\n--- Bridged from eBay.com ---\nOriginal listing: ${data.originalUrl}`;
            }
            descTextarea.value = description;
            descTextarea.dispatchEvent(new Event('input', { bubbles: true }));
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

        // Fill ALL other fields AFTER "Show more" is clicked (many of these might be hidden)
        // JEANS specific
        if (data.style) await fillDropdown('button[name="attributes.Style"]', 'input[name="search-box-attributesStyle"]', data.style);
        if (data.inseam) await fillDropdown('button[name="attributes.Inseam"]', 'input[name="search-box-attributesInseam"]', data.inseam);
        if (data.fit) await fillDropdown('button[name="attributes.Fit"]', 'input[name="search-box-attributesFit"]', data.fit);
        if (data.waistSize) await fillDropdown('button[name="attributes.Waist Size"]', 'input[name="search-box-attributesWaistSize"]', data.waistSize);
        if (data.rise) await fillDropdown('button[name="attributes.Rise"]', 'input[name="search-box-attributesRise"]', data.rise);

        // Hoodies specific
        if (data.type) await fillDropdown('button[name="attributes.Type"]', 'input[name="search-box-attributesType"]', data.type);
        if (data.fabricType) await fillDropdown('button[name="attributes.Fabric Type"]', 'input[name="search-box-attributesFabricType"]', data.fabricType);
        if (data.neckline) await fillDropdown('button[name="attributes.Neckline"]', 'input[name="search-box-attributesNeckline"]', data.neckline);

        // Polos specific
        if (data.sleeveLength) await fillDropdown('button[name="attributes.Sleeve Length"]', 'input[name="search-box-attributesSleeveLength"]', data.sleeveLength);
        if (data.collarStyle) await fillDropdown('button[name="attributes.Collar Style"]', 'input[name="search-box-attributesCollarStyle"]', data.collarStyle);
        if (data.chestSize) await fillDropdown('button[name="attributes.Chest Size"]', 'input[name="search-box-attributesChestSize"]', data.chestSize);
        if (data.shirtLength) await fillDropdown('button[name="attributes.Shirt Length"]', 'input[name="search-box-attributesShirtLength"]', data.shirtLength);

        // Material and fabric fields
        if (data.wash) await fillDropdown('button[name="attributes.Fabric Wash"]', 'input[name="search-box-attributesFabricWash"]', data.wash);
        if (data.material) {
            const materials = Array.isArray(data.material) ? data.material : [data.material];
            await fillMultiSelect(
                'button[name="attributes.Material"]',
                'input[aria-label="Search or enter your own. Search results appear below"]',
                materials
            );
        }
        if (data.closure) await fillDropdown(
            'button[name="attributes.Closure"]',
            'input[name="search-box-attributesClosure"]',
            data.closure
        );

        // Geographic and manufacturing fields
        if (data.country) await fillDropdown('button[name="attributes.Country/Region of Manufacture"]', 'input[name="search-box-attributesCountryRegionofManufacture"]', data.country);
        
        // Additional common fields that might be under "Show more"
        if (data.pattern) await fillDropdown('button[name="attributes.Pattern"]', 'input[name="search-box-attributesPattern"]', data.pattern);
        if (data.sleeve) await fillDropdown('button[name="attributes.Sleeve"]', 'input[name="search-box-attributesSleeve"]', data.sleeve);
        if (data.occasion) await fillDropdown('button[name="attributes.Occasion"]', 'input[name="search-box-attributesOccasion"]', data.occasion);
        if (data.season) await fillDropdown('button[name="attributes.Season"]', 'input[name="search-box-attributesSeason"]', data.season);
        if (data.vintage) await fillDropdown('button[name="attributes.Vintage"]', 'input[name="search-box-attributesVintage"]', data.vintage);
        if (data.theme) {
            console.log('🎨 Filling theme:', data.theme);
            await fillDropdown('button[name="attributes.Theme"]', 'input[name="search-box-attributesTheme"]', data.theme);
        }
        if (data.character) await fillDropdown('button[name="attributes.Character"]', 'input[name="search-box-attributesCharacter"]', data.character);
        if (data.department) await fillDropdown('button[name="attributes.Department"]', 'input[name="search-box-attributesDepartment"]', data.department);
        if (data.model) {
            console.log('🚗 Filling model:', data.model);
            await fillDropdown('button[name="attributes.Model"]', 'input[name="search-box-attributesModel"]', data.model);
        }
        if (data.features) {
            console.log('⭐ Filling features:', data.features);
            await fillDropdown('button[name="attributes.Features"]', 'input[name="search-box-attributesFeatures"]', data.features);
        }
        if (data.performance) await fillDropdown('button[name="attributes.Performance/Activity"]', 'input[name="search-box-attributesPerformanceActivity"]', data.performance);
        if (data.lining) await fillDropdown('button[name="attributes.Lining"]', 'input[name="search-box-attributesLining"]', data.lining);
        if (data.accents) {
            console.log('✨ Filling accents:', data.accents);
            await fillDropdown('button[name="attributes.Accents"]', 'input[name="search-box-attributesAccents"]', data.accents);
        }

        // Handle ads section
        const adToggle = document.querySelector('[class="promoted-listing-program-wrapper"] input[type="checkbox"]');
        if (adToggle && !adToggle.checked) {
            adToggle.click();
        }

        await new Promise(resolve => setTimeout(resolve, 500));

        const adRateInput = document.querySelector('input[name="adRate"]');
        if (adRateInput) {
            const adRateValue = data.adRate ? parseFloat(data.adRate) : (settings.defaults.adRate ? parseFloat(settings.defaults.adRate) : 6.0);
            adRateInput.focus();
            adRateInput.value = adRateValue.toFixed(1);
            adRateInput.dispatchEvent(new Event('input', { bubbles: true }));
            adRateInput.dispatchEvent(new Event('change', { bubbles: true }));

            // Simulate blur to finalize the change
            adRateInput.blur();
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
    if (!msg || !msg.action || !msg.data) return;

    if (msg.action === 'update' || msg.action === 'fillForm') {
        console.log('🔄 Filling eBay.ca form with bridged data:', msg.data);
        fillFields(msg.data);
    } else if (msg.action === 'save') {
        fillFields(msg.data).then(saveDraft);
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
