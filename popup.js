// Load settings from external file
let settings = null;

async function loadSettings() {
    try {
        const response = await fetch(chrome.runtime.getURL('settings.json'));
        settings = await response.json();
        console.log('✅ Settings loaded successfully');
    } catch (error) {
        console.error('❌ Failed to load settings:', error);
        // Fallback to default settings
        settings = {
            currency: { usdToCadRate: 1.35 },
            templates: { ebayCA: { defaultTemplate: "https://bulkedit.ebay.ca/managetemplates", categories: {} } },
            defaults: { adRate: "6.0", templateType: "jeans" },
            ui: { messages: {}, buttons: {} }
        };
    }
}

// Initialize settings on load
loadSettings();

const statusEl = document.getElementById('statusMessage');
const inputEl = document.getElementById('listingJsonInput');
const createBtn = document.getElementById('createListingBtn');

let currentSite = '';
createBtn.disabled = true;

chrome.tabs.query({ active: true, currentWindow: true }, async ([tab]) => {
    if (!tab || !tab.url) return;

    // Ensure settings are loaded
    if (!settings) await loadSettings();

    const url = tab.url;

    // Handle eBay.ca listing pages (for updating existing CA listings)
    if (url.includes('ebay.ca') && url.includes('/lstng')) {
        currentSite = 'ebay_ca';
        createBtn.textContent = settings.ui.buttons.updateCAListing || 'Update CA Listing';
        statusEl.textContent = settings.ui.messages.ebayCADetected || '🇨🇦 eBay.ca detected. Loading saved JSON...';
        inputEl.style.display = 'none';

        chrome.storage.local.get('latestEbayJson', ({ latestEbayJson }) => {
            if (!latestEbayJson) {
                statusEl.textContent = settings.ui.messages.noJsonFound || '⚠️ No saved JSON found.';
                return;
            }

            inputEl.value = JSON.stringify(latestEbayJson, null, 2);
            inputEl.style.display = 'block';
            statusEl.textContent = '✅ Loaded saved JSON from storage.';
            createBtn.disabled = false;

            sendData('update');
            createBtn.textContent = settings.ui.messages.updating || 'Updating...';
            createBtn.disabled = true;
        });

        return;
    }

    // Handle eBay.com listing pages (for extraction and bridging to CA)
    if (url.includes('ebay.com') && (url.includes('/lstng') || url.includes('/sl/list'))) {
        currentSite = 'ebay_com';
        createBtn.textContent = settings.ui.buttons.bridgeToEbayCA || 'Extract Data';
        statusEl.textContent = settings.ui.messages.ebayUSDetected || '🌉 eBay.com listing detected. Ready to extract and bridge to eBay.ca';
        inputEl.style.display = 'none'; // Hide until we have data
        createBtn.disabled = false;
        return;
    }

    // Handle eBay.com item pages (will navigate to edit mode)
    if (url.includes('ebay.com') && url.includes('/itm/')) {
        currentSite = 'ebay_com_item';
        createBtn.textContent = settings.ui.buttons.editAndExtract || 'Edit & Extract';
        statusEl.textContent = settings.ui.messages.ebayUSItemDetected || '📦 eBay.com item detected. Click to navigate to edit mode and extract data.';
        inputEl.style.display = 'none';
        createBtn.disabled = false;
        return;
    }

    // Handle ChatGPT (legacy support for manual JSON creation)
    if (url.includes('chatgpt.com')) {
        currentSite = 'chatgpt';
        createBtn.textContent = settings.ui.buttons.createListing || 'Create Listing';
        statusEl.textContent = settings.ui.messages.chatgptDetected || '🔍 ChatGPT detected. Scanning for listing JSON...';
        inputEl.style.display = 'block';
        createBtn.disabled = true;

        chrome.runtime.sendMessage({ action: "extractJsonFromChatGPT" });

        setTimeout(() => {
            if (!inputEl.value) {
                statusEl.textContent = '⚠️ No valid EBAY_LISTER JSON found.';
            }
        }, 3000);

        return;
    }

    statusEl.textContent = settings.ui.messages.unavailable || '⚠️ Please navigate to an eBay.com listing to bridge to eBay.ca';
    createBtn.textContent = settings.ui.buttons.unavailable || 'Unavailable';
    inputEl.style.display = 'none';
    createBtn.disabled = true;
});

chrome.runtime.onMessage.addListener(async (msg) => {
    // Ensure settings are loaded
    if (!settings) await loadSettings();
    
    if (msg.action === "parsedEbayJson") {
        const json = msg.payload;

        chrome.storage.local.set({ latestEbayJson: json }, () => {
            console.log("✅ JSON saved to storage");
        });

        inputEl.value = JSON.stringify(json, null, 2);
        statusEl.textContent = settings.ui.messages.jsonParsed || '✅ JSON parsed from ChatGPT.';
        createBtn.disabled = false;

        if (currentSite === 'chatgpt' && json?.templateType) {
            autoCreateListingIfReady(json);
        }
    }

    if (msg.action === "extractedEbayComData") {
        const extractedData = msg.payload;
        
        // Convert extracted eBay.com data to our JSON format
        const bridgedJson = {
            source: "EBAY_US_CA_BRIDGE",
            templateType: extractedData.templateType || settings.defaults.templateType || "jeans",
            title: extractedData.title || "",
            sku: extractedData.sku || "",
            priceCAD: extractedData.priceCAD || "",
            priceUSD: extractedData.priceUSD || "",
            brand: extractedData.brand || "",
            size: extractedData.size || "",
            inseam: extractedData.inseam || "",
            waistSize: extractedData.waistSize || "",
            color: extractedData.color || "",
            wash: extractedData.wash || "",
            rise: extractedData.rise || "",
            style: extractedData.style || "",
            fit: extractedData.fit || "",
            type: extractedData.type || "",
            material: extractedData.material || [],
            sleeveLength: extractedData.sleeveLength || "",
            neckline: extractedData.neckline || "",
            closure: extractedData.closure || "",
            collarStyle: extractedData.collarStyle || "",
            fabricType: extractedData.fabricType || "",
            chestSize: extractedData.chestSize || "",
            shirtLength: extractedData.shirtLength || "",
            country: extractedData.country || "Unknown",
            description: extractedData.description || "",
            condition: extractedData.condition || "",
            conditionDescription: extractedData.conditionDescription || "",
            adRate: settings.defaults.adRate || "6.0",
            // Metadata
            originalUrl: extractedData.originalUrl,
            extractedAt: extractedData.extractedAt
        };

        chrome.storage.local.set({ latestEbayJson: bridgedJson }, () => {
            console.log("✅ Bridged JSON saved to storage");
        });

        inputEl.value = JSON.stringify(bridgedJson, null, 2);
        inputEl.style.display = 'block'; // Make sure the textarea is visible for review
        statusEl.textContent = settings.ui.messages.dataExtracted || '✅ eBay.com data extracted and converted. Ready to bridge to eBay.ca!';
        createBtn.textContent = settings.ui.messages.createOnEbayCA || 'Create on eBay.ca';
        createBtn.disabled = false;
        
        // Update current site since we're now on a listing page
        currentSite = 'ebay_com';
        
        // Log extraction summary
        console.log('📦 Extracted data summary:', {
            title: bridgedJson.title,
            templateType: bridgedJson.templateType,
            brand: bridgedJson.brand,
            size: bridgedJson.size,
            color: bridgedJson.color,
            priceUSD: bridgedJson.priceUSD,
            priceCAD: bridgedJson.priceCAD
        });
        
        // Don't auto-create - let user review the extracted data first
        // autoCreateListingIfReady(bridgedJson);
    }

    if (msg.action === "editError") {
        statusEl.textContent = `❌ ${msg.error}`;
        createBtn.disabled = true;
        createBtn.textContent = 'Cannot Edit';
    }
});

createBtn.addEventListener('click', async () => {
    // Ensure settings are loaded
    if (!settings) await loadSettings();
    
    if (currentSite === 'ebay_com_item') {
        // Navigate to edit mode for eBay.com item page
        chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
            const url = tab.url;
            const itemIdMatch = url.match(/\/itm\/(\d+)/);
            
            if (itemIdMatch) {
                const itemId = itemIdMatch[1];
                const editUrl = `https://www.ebay.com/sl/list?itemId=${itemId}&mode=ReviseItem`;
                
                createBtn.textContent = 'Navigating...';
                createBtn.disabled = true;
                statusEl.textContent = settings.ui.messages.navigating || '🔄 Navigating to edit mode...';
                
                chrome.tabs.update(tab.id, { url: editUrl });
                
                // Close popup since we're navigating
                setTimeout(() => {
                    window.close();
                }, 1000);
            } else {
                statusEl.textContent = '❌ Could not extract item ID from URL';
            }
        });
        return;
    }
    
    if (currentSite === 'ebay_com') {
        // Check if we already have data and button says "Create on eBay.ca"
        if (createBtn.textContent.includes('Create on eBay.ca') && inputEl.value) {
            // User wants to create listing on eBay.ca with extracted data
            try {
                const json = JSON.parse(inputEl.value);
                
                // Validate required fields
                if (!json.templateType) {
                    statusEl.textContent = '❌ Template type is required. Please set templateType in the JSON.';
                    return;
                }

                // Show loading state
                createBtn.disabled = true;
                createBtn.textContent = 'Opening eBay.ca...';
                statusEl.textContent = '🚀 Creating listing on eBay.ca...';

                // Send data to background script to create listing
                const response = await chrome.runtime.sendMessage({
                    action: 'createListing',
                    data: json
                });

                if (response && response.success) {
                    statusEl.textContent = '✅ eBay.ca listing page opened! Form will be filled automatically.';
                    // Close popup after a delay
                    setTimeout(() => {
                        window.close();
                    }, 2000);
                } else {
                    statusEl.textContent = `❌ Failed to create listing: ${response?.error || 'Unknown error'}`;
                    createBtn.disabled = false;
                    createBtn.textContent = 'Create on eBay.ca';
                }

            } catch (e) {
                statusEl.textContent = '❌ Invalid JSON format. Please check the data and try again.';
                createBtn.disabled = false;
                createBtn.textContent = 'Create on eBay.ca';
            }
            return;
        }
        
        // Extract data from eBay.com listing
        chrome.runtime.sendMessage({ action: "extractEbayComListing" });
        createBtn.textContent = settings.ui.messages.extracting || 'Extracting...';
        createBtn.disabled = true;
        return;
    }
    
    if (currentSite === 'chatgpt') {
        // Legacy ChatGPT workflow
        try {
            const json = JSON.parse(inputEl.value);
            const type = (json.templateType || '').toLowerCase();
            const url = settings.templates.ebayCA.categories[type] || settings.templates.ebayCA.defaultTemplate;
            chrome.tabs.create({ url });
        } catch (e) {
            alert('Invalid JSON format.');
        }
        return;
    }
    
    // If we have extracted data and user wants to create listing
    if (inputEl.value && createBtn.textContent.includes('Create on eBay.ca')) {
        try {
            const json = JSON.parse(inputEl.value);
            autoCreateListingIfReady(json);
        } catch (e) {
            alert('Invalid JSON format.');
        }
    }
});

function sendData(action) {
    try {
        const text = inputEl.value;
        const data = JSON.parse(text);

        chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['contentScript.js']
            }, () => {
                chrome.tabs.sendMessage(tab.id, { action, data });
            });
        });
    } catch (e) {
        alert('Invalid JSON format.');
    }
}

async function autoCreateListingIfReady(json) {
    // Ensure settings are loaded
    if (!settings) await loadSettings();
    
    try {
        const type = (json.templateType || '').toLowerCase();
        const url = settings.templates.ebayCA.categories[type] || settings.templates.ebayCA.defaultTemplate;

        chrome.tabs.create({ url }, (newTab) => {
            chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
                if (tabId === newTab.id && info.status === 'complete') {
                    chrome.tabs.onUpdated.removeListener(listener);
                    chrome.scripting.executeScript({
                        target: { tabId: newTab.id },
                        func: () => {
                            window.postMessage({
                                source: 'EBAY_US_CA_BRIDGE_TRIGGER'
                            }, '*');
                        }
                    });
                }
            });
        });
    } catch (e) {
        alert('Invalid JSON format during auto-create.');
    }
}
