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
            settings = { currency: { usdToCadRate: 1.35 } };
          }

          // Function to convert USD to CAD using settings
          function convertUsdToCad(usdPrice) {
            const exchangeRate = settings.currency.usdToCadRate || 1.35;
            return (parseFloat(usdPrice) * exchangeRate).toFixed(2);
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

            // Extract condition
            const conditionSelect = document.querySelector('select[name="itemCondition"]') ||
                                   document.querySelector('button[name="itemCondition"]');
            if (conditionSelect) {
              data.condition = conditionSelect.value || conditionSelect.textContent.trim();
            }

            // Try to determine template type from title or category
            data.templateType = determineTemplateType(data.title, data);

            // Add metadata
            data.source = 'EBAY_US_CA_BRIDGE';
            data.originalUrl = window.location.href;
            data.extractedAt = new Date().toISOString();

            return data;
          }

          // Function to determine template type based on title and data
          function determineTemplateType(title, data) {
            if (!title) return 'jeans'; // default
            
            const titleLower = title.toLowerCase();
            
            // Check for specific clothing types in title
            if (titleLower.includes('hoodie') || titleLower.includes('sweatshirt')) {
              return 'hoodies';
            }
            if (titleLower.includes('jacket') || titleLower.includes('blazer') || titleLower.includes('coat')) {
              if (titleLower.includes('women') || titleLower.includes('ladies')) {
                return 'jackets_womens';
              }
              return 'jackets';
            }
            if (titleLower.includes('jean')) {
              if (titleLower.includes('women') || titleLower.includes('ladies')) {
                return 'jeans_womens';
              }
              return 'jeans';
            }
            if (titleLower.includes('pant') || titleLower.includes('trouser')) {
              return 'pants';
            }
            if (titleLower.includes('short')) {
              if (titleLower.includes('swim') || titleLower.includes('board')) {
                return 'shorts_swim';
              }
              if (titleLower.includes('athletic') || titleLower.includes('gym') || titleLower.includes('sport')) {
                return 'shorts_activewear';
              }
              return 'shorts';
            }
            if (titleLower.includes('polo')) {
              return 'shirt_polo';
            }
            if (titleLower.includes('button') || titleLower.includes('dress shirt')) {
              return 'shirt_button';
            }
            if (titleLower.includes('t-shirt') || titleLower.includes('tee') || titleLower.includes('tank')) {
              return 'shirt_tee';
            }
            if (titleLower.includes('athletic') || titleLower.includes('dri-fit') || titleLower.includes('training')) {
              return 'shirt_activewear';
            }
            if (titleLower.includes('sweater') || titleLower.includes('pullover') || titleLower.includes('cardigan')) {
              return 'sweaters';
            }
            if (titleLower.includes('sweatpant') || titleLower.includes('jogger')) {
              return 'sweatpants';
            }
            
            // Default to jeans if unsure
            return 'jeans';
          }

          const extractedData = extractEbayListingFormData();
          
          // Convert extracted eBay.com data to bridged JSON format - FULLY DYNAMIC
          const bridgedJson = {
            source: "EBAY_US_CA_BRIDGE",
            templateType: extractedData.templateType || "jeans",
            adRate: "6.0"
          };
          
          // Dynamically copy ALL extracted fields to bridged JSON
          Object.keys(extractedData).forEach(key => {
            bridgedJson[key] = extractedData[key];
          });

          // Save to storage for popup sync
          chrome.storage.local.set({ latestEbayJson: bridgedJson });
          
          // Send back to popup with explicit UI update request
          chrome.runtime.sendMessage({ 
            action: "extractedEbayComData", 
            payload: bridgedJson
          });
          
          // If triggered by keyboard shortcut, send message to background for auto-bridging
          if (isFromKeyboardShortcut) {
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
    
    // Load settings to get template URL
    fetch(chrome.runtime.getURL('settings.json'))
      .then(response => response.json())
      .then(settings => {
        const templateType = bridgedJson.templateType || 'jeans';
        const templateUrl = settings.templates.ebayCA.categories[templateType] || 
                           settings.templates.ebayCA.defaultTemplate;
        
        console.log('🎯 Using template for', templateType, ':', templateUrl);
        
        // Create new tab with eBay.ca template
        chrome.tabs.create({ url: templateUrl }, (newTab) => {
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
        const templateType = listingData.templateType || 'jeans';
        
        // Get the appropriate eBay.ca template URL
        const templateUrl = settings.templates.ebayCA.categories[templateType] || 
                           settings.templates.ebayCA.defaultTemplate;
        
        console.log('🎯 Using template for', templateType, ':', templateUrl);
        
        // Create new tab with eBay.ca template
        chrome.tabs.create({ url: templateUrl }, (newTab) => {
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
  
  return true; // Keep message port open for async responses
});
